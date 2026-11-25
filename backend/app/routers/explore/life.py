"""Listening life: peaks, sessions, milestones."""

from datetime import timedelta

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con
from app.routers.explore._common import parse_year, year_clause
from app.schemas.explore import ListeningLife
from app.services.metrics import tz_offset_minutes

router = APIRouter()


@router.get("/api/metrics/listening-life", response_model=ListeningLife)
async def get_listening_life(year: str = "all", con: Con = Depends(get_con)):
    """Peak listening periods, session pace, and chronological play milestones.

    All values use music plays from history. Peak day, week, and month are
    based on listened time; sessions split after 30 minutes without a play.
    """
    yr = parse_year(year)

    def query():
        off = tz_offset_minutes(con)
        music = "WHERE track_uri LIKE 'spotify:track:%' AND ts IS NOT NULL" + year_clause(yr, off)

        try:
            day = con.execute(
                f"SELECT CAST(ts + to_minutes({off}) AS DATE), SUM(COALESCE(ms_played, 0)) "
                f"FROM history {music} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1"
            ).fetchone()
            week = con.execute(
                f"SELECT CAST(date_trunc('week', ts + to_minutes({off})) AS DATE), "
                f"SUM(COALESCE(ms_played, 0)) FROM history {music} "
                "GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1"
            ).fetchone()
            month = con.execute(
                f"SELECT CAST(date_trunc('month', ts + to_minutes({off})) AS DATE), "
                f"SUM(COALESCE(ms_played, 0)) FROM history {music} "
                "GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1"
            ).fetchone()
        except Exception:
            return None

        if not day:
            return None

        def format_day(value):
            return f"{value.strftime('%B')} {value.day}, {value.year}"

        def format_week(value):
            end = value + timedelta(days=6)
            if value.month == end.month and value.year == end.year:
                return f"{value.strftime('%B')} {value.day}-{end.day}, {value.year}"
            return f"{format_day(value)} - {format_day(end)}"

        peaks = [
            {"label": "Day", "minutes": round(day[1] / 60000, 2), "period": format_day(day[0])},
            {"label": "Week", "minutes": round(week[1] / 60000, 2), "period": format_week(week[0])},
            {
                "label": "Month",
                "minutes": round(month[1] / 60000, 2),
                "period": month[0].strftime("%B %Y"),
            },
        ]

        try:
            session_rows = con.execute(
                f"""
                WITH ordered AS (
                    SELECT ts, COALESCE(ms_played, 0) AS ms_played,
                           LAG(ts) OVER (ORDER BY ts) AS previous_ts
                    FROM history {music}
                ), marked AS (
                    SELECT ts, ms_played,
                           CASE WHEN previous_ts IS NULL
                                     OR date_diff('minute', previous_ts, ts) > 30
                                THEN 1 ELSE 0 END AS starts_session
                    FROM ordered
                ), sessions AS (
                    SELECT ms_played,
                           SUM(starts_session) OVER (ORDER BY ts) AS session_id
                    FROM marked
                )
                SELECT SUM(ms_played) / 60000.0 AS minutes
                FROM sessions GROUP BY session_id
                """
            ).fetchall()
        except Exception:
            session_rows = []

        sessions = sorted(float(row[0] or 0) for row in session_rows)
        if sessions:
            middle = len(sessions) // 2
            median = (
                sessions[middle]
                if len(sessions) % 2
                else (sessions[middle - 1] + sessions[middle]) / 2
            )
            typical_session_minutes = round(median)
            buckets = [0, 0, 0, 0]
            for minutes in sessions:
                if minutes < 15:
                    buckets[0] += 1
                elif minutes < 30:
                    buckets[1] += 1
                elif minutes < 60:
                    buckets[2] += 1
                else:
                    buckets[3] += 1
            total_sessions = len(sessions)
            session_mix = [
                {"label": label, "share": round(count / total_sessions, 3)}
                for label, count in zip(
                    ("Under 15m", "15-30m", "30-60m", "Over 1h"), buckets, strict=False
                )
            ]
        else:
            typical_session_minutes = 0
            session_mix = []

        milestones = []
        try:
            for target in (1000, 5000, 10000):
                row = con.execute(
                    f"""
                    WITH ordered AS (
                        SELECT ts + to_minutes({off}) AS local_ts, track_name, artist_name,
                               ROW_NUMBER() OVER (ORDER BY ts) AS play_number
                        FROM history {music}
                    )
                    SELECT local_ts, track_name, artist_name
                    FROM ordered WHERE play_number >= ?
                    ORDER BY play_number LIMIT 1
                    """,
                    [target],
                ).fetchone()
                if row:
                    milestones.append(
                        {
                            "target": target,
                            "date": row[0].strftime("%B %Y"),
                            "track": row[1] or "Unknown track",
                            "artist": row[2] or "",
                        }
                    )
        except Exception:
            milestones = []

        return {
            "peaks": peaks,
            "typical_session_minutes": typical_session_minutes,
            "session_mix": session_mix,
            "milestones": milestones,
        }

    res = await run_in_threadpool(query)
    if not res:
        return {
            "status": "ok",
            "year": yr,
            "peaks": [],
            "typical_session_minutes": 0,
            "session_mix": [],
            "milestones": [],
        }
    return {"status": "ok", "year": yr, **res}
