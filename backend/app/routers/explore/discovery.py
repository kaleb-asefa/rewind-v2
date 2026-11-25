"""Discovery & loyalty: new artists, rediscoveries, rising artists."""

import contextlib

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con
from app.routers.explore._common import parse_year, year_clause, year_where
from app.schemas.explore import Discovery
from app.services.catalog import ensure_track_features
from app.services.metrics import tz_offset_minutes

router = APIRouter()


@router.get("/api/metrics/discovery", response_model=Discovery)
async def get_discovery(year: str = "all", con: Con = Depends(get_con)):
    """Discovery and loyalty patterns from history, with no catalog dependency.

    Artists count as new for all plays in the month they first appear. A
    rediscovery is a track played again after a 60-day gap. Momentum compares
    the latest 90 days against the preceding 90-day period.
    """
    yr = parse_year(year)

    def query():
        ensure_track_features(con)
        off = tz_offset_minutes(con)
        clause = year_clause(yr, off)
        hclause = year_clause(yr, off, "h.")
        try:
            summary = con.execute(
                f"""
                WITH plays AS (
                    SELECT artist_name, ts, date_trunc('month', ts) AS month
                    FROM history
                    WHERE artist_name IS NOT NULL AND ts IS NOT NULL{clause}
                ), first_month AS (
                    SELECT artist_name, MIN(month) AS first_month
                    FROM plays GROUP BY artist_name
                ), artist_counts AS (
                    SELECT artist_name, COUNT(*) AS plays
                    FROM plays GROUP BY artist_name
                ), monthly_new AS (
                    SELECT month, COUNT(DISTINCT artist_name) AS artists
                    FROM plays JOIN first_month USING (artist_name)
                    WHERE month = first_month GROUP BY month
                )
                SELECT
                    COALESCE(AVG((month = first_month)::INTEGER), 0),
                    COALESCE((SELECT AVG(artists) FROM monthly_new), 0),
                    COALESCE(AVG((plays = 1)::INTEGER), 0),
                    COUNT(*)
                FROM plays
                JOIN first_month USING (artist_name)
                JOIN artist_counts USING (artist_name)
                """
            ).fetchone()
        except Exception:
            return None
        if not summary or not summary[3]:
            return None

        rediscoveries = []
        try:
            rows = con.execute(
                f"""
                WITH ordered AS (
                    SELECT track_uri, track_name, artist_name, ts,
                           LAG(ts) OVER (PARTITION BY track_uri ORDER BY ts) AS previous_ts
                    FROM history
                    WHERE track_uri LIKE 'spotify:track:%'
                      AND track_name IS NOT NULL AND artist_name IS NOT NULL AND ts IS NOT NULL{clause}
                ), returning_tracks AS (
                    SELECT DISTINCT track_uri
                    FROM ordered
                    WHERE date_diff('day', previous_ts, ts) >= 60
                )
                SELECT split_part(h.track_uri, ':', 3) AS id, ANY_VALUE(h.track_name),
                       ANY_VALUE(h.artist_name), COUNT(*) AS plays
                FROM history h JOIN returning_tracks r USING (track_uri)
                {year_where(hclause)}
                GROUP BY h.track_uri
                ORDER BY plays DESC, 2, 1
                LIMIT 4
                """
            ).fetchall()
            rediscoveries = [
                {"id": row[0], "name": row[1], "artist": row[2], "plays": int(row[3])}
                for row in rows
            ]
        except Exception:
            pass

        rising = []
        try:
            rows = con.execute(
                f"""
                WITH bounds AS (
                    SELECT MAX(ts) AS latest FROM history WHERE ts IS NOT NULL{clause}
                ), artist_plays AS (
                    SELECT artist_name,
                           COUNT(*) FILTER (WHERE ts > latest - INTERVAL 90 DAY) AS recent,
                           COUNT(*) FILTER (
                               WHERE ts > latest - INTERVAL 180 DAY
                                 AND ts <= latest - INTERVAL 90 DAY
                           ) AS previous
                    FROM history CROSS JOIN bounds
                    WHERE artist_name IS NOT NULL AND ts IS NOT NULL{clause}
                    GROUP BY artist_name
                )
                SELECT artist_name, ROUND((recent - previous) * 100.0 / previous)::INTEGER
                FROM artist_plays
                WHERE previous >= 2 AND recent > previous
                ORDER BY 2 DESC, recent DESC, artist_name
                LIMIT 4
                """
            ).fetchall()
            artist_ids = {}
            with contextlib.suppress(Exception):
                artist_ids = {
                    row[0]: row[1]
                    for row in con.execute(
                        "SELECT artist_name, MAX(artist_id) FROM track_features "
                        "WHERE artist_name IS NOT NULL AND artist_id IS NOT NULL "
                        "GROUP BY artist_name"
                    ).fetchall()
                }
            rising = [
                {"name": row[0], "share": int(row[1]), "id": artist_ids.get(row[0])} for row in rows
            ]
        except Exception:
            pass

        return {
            "new_artist_share": round(float(summary[0] or 0), 3),
            "new_artists_monthly": round(float(summary[1] or 0), 1),
            "one_off_share": round(float(summary[2] or 0), 3),
            "rediscoveries": rediscoveries,
            "rising": rising,
        }

    res = await run_in_threadpool(query)
    if not res:
        return {
            "status": "ok",
            "year": yr,
            "new_artist_share": 0.0,
            "new_artists_monthly": 0.0,
            "one_off_share": 0.0,
            "rediscoveries": [],
            "rising": [],
        }
    return {"status": "ok", "year": yr, **res}
