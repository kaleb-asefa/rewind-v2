"""Wrapped: listening-personality spectrum badges."""

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con
from app.routers.explore._common import parse_year, year_clause
from app.schemas.explore import Wrapped
from app.services.metrics import chronotype, tz_offset_minutes

router = APIRouter()


@router.get("/api/metrics/wrapped", response_model=Wrapped)
async def get_wrapped(year: str = "all", con: Con = Depends(get_con)):
    """Finale personality synthesis: traits from history (loyalty, chronotype,
    skip, shuffle) plus one catalog trait (mainstream, from track_features).
    """
    yr = parse_year(year)

    def query():
        off = tz_offset_minutes(con)
        clause = year_clause(yr, off)
        hclause = year_clause(yr, off, "h.")
        music = "WHERE track_uri LIKE 'spotify:track:%' AND ts IS NOT NULL" + clause

        # Discovery share (share of plays that are an artist's first month) — the
        # SAME signal Chapter 6 uses, so the Explorer/Loyalist trait agrees with it.
        try:
            row = con.execute(
                f"""
                WITH plays AS (
                    SELECT artist_name, date_trunc('month', ts) AS month
                    FROM history WHERE artist_name IS NOT NULL AND ts IS NOT NULL{clause}
                ), first_month AS (
                    SELECT artist_name, MIN(month) AS first_month FROM plays GROUP BY artist_name
                )
                SELECT COALESCE(AVG((month = first_month)::INTEGER), 0), COUNT(*)
                FROM plays JOIN first_month USING (artist_name)
                """
            ).fetchone()
        except Exception:
            return None
        if not row or not row[1]:
            return None
        new_artist_share = float(row[0] or 0)

        # Chronotype from the hourly distribution.
        hourly = [0] * 24
        try:
            for h, c in con.execute(
                f"SELECT EXTRACT(hour FROM ts + to_minutes({off}))::INTEGER AS h, COUNT(*) "
                f"FROM history {music} GROUP BY h"
            ).fetchall():
                if h is not None and 0 <= int(h) <= 23:
                    hourly[int(h)] = int(c)
        except Exception:
            pass
        chrono = chronotype(hourly)

        # Skip + shuffle behaviour.
        try:
            beh = con.execute(
                "SELECT AVG(CASE WHEN reason_end = 'fwdbtn' THEN 1.0 ELSE 0.0 END), "
                "AVG(CASE WHEN shuffle THEN 1.0 ELSE 0.0 END) "
                "FROM history WHERE track_uri LIKE 'spotify:track:%'" + clause
            ).fetchone()
            skip_rate = float(beh[0]) if beh and beh[0] is not None else 0.0
            shuffle = float(beh[1]) if beh and beh[1] is not None else 0.0
        except Exception:
            skip_rate, shuffle = 0.0, 0.0

        # Mainstream (catalog popularity).
        avg_pop = None
        try:
            p = con.execute(
                "SELECT AVG(f.popularity) FROM history h JOIN track_features f "
                "ON split_part(h.track_uri, ':', 3) = f.track_id "
                "WHERE h.track_uri LIKE 'spotify:track:%' AND f.popularity IS NOT NULL" + hclause
            ).fetchone()[0]
            avg_pop = float(p) if p is not None else None
        except Exception:
            avg_pop = None

        def skip_label(s):
            return "Restless" if s >= 0.4 else "Selective" if s >= 0.2 else "Locked in"

        def shuffle_label(s):
            return "Shuffler" if s >= 0.6 else "A bit of both" if s >= 0.35 else "Curator"

        # Explorer/Loyalist uses Chapter 6's discoveryWord thresholds; position is
        # scaled (share rarely exceeds ~0.5) so the marker sits under the label.
        def discovery_label(s):
            return "Explorer" if s >= 0.45 else "Open to new music" if s >= 0.25 else "Loyalist"

        personality = [
            {
                "label": discovery_label(new_artist_share),
                "left": "Loyalist",
                "right": "Explorer",
                "position": round(min(1.0, new_artist_share / 0.5), 3),
                "icon": "explore",
            },
            {
                "label": chrono["label"] or "Balanced",
                "left": "Early bird",
                "right": "Night owl",
                "position": round(chrono["position"], 3),
                "icon": "bedtime",
            },
            {
                "label": skip_label(skip_rate),
                "left": "Restless",
                "right": "Focused",
                "position": round(1 - skip_rate, 3),
                "icon": "center_focus_strong",
            },
            {
                "label": shuffle_label(shuffle),
                "left": "Curator",
                "right": "Shuffler",
                "position": round(shuffle, 3),
                "icon": "shuffle",
            },
        ]
        if avg_pop is not None:
            personality.insert(
                1,
                {
                    "label": "Mainstream" if avg_pop >= 0.5 else "Underground",
                    "left": "Underground",
                    "right": "Mainstream",
                    "position": round(avg_pop, 3),
                    "icon": "trending_up",
                },
            )

        return {"personality": personality}

    res = await run_in_threadpool(query)
    if not res:
        return {"status": "ok", "year": yr, "personality": []}
    return {"status": "ok", "year": yr, **res}
