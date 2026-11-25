"""Deep cuts: concentration, album commitment, top day track, never-skip favourite."""

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con
from app.routers.explore._common import parse_year, year_clause
from app.schemas.explore import DeepCuts
from app.services.metrics import tz_offset_minutes

router = APIRouter()


@router.get("/api/metrics/deep-cuts", response_model=DeepCuts)
async def get_deep_cuts(year: str = "all", con: Con = Depends(get_con)):
    """Loyalty and commitment deep cuts (history only): the top 10 artists' share
    of plays, full-album vs single listening, the track binged most in one day,
    and the heavily-played favourite you almost never skip.
    """
    yr = parse_year(year)

    def query():
        off = tz_offset_minutes(con)
        clause = year_clause(yr, off)
        music = "WHERE track_uri LIKE 'spotify:track:%' AND artist_name IS NOT NULL" + clause

        # Concentration: top 10 artists' share of music plays.
        try:
            row = con.execute(
                f"""
                WITH artist_plays AS (
                    SELECT artist_name, COUNT(*) AS plays
                    FROM history {music} GROUP BY artist_name
                ), ranked AS (
                    SELECT plays, ROW_NUMBER() OVER (ORDER BY plays DESC) AS rn
                    FROM artist_plays
                )
                SELECT COALESCE(SUM(plays) FILTER (WHERE rn <= 10), 0), COALESCE(SUM(plays), 0)
                FROM ranked
                """
            ).fetchone()
        except Exception:
            return None
        if not row or not row[1]:
            return None
        top10_share = round(row[0] / row[1], 3)

        # Album commitment: share of played albums with >= 3 distinct tracks.
        deep_share = None
        try:
            r = con.execute(
                f"""
                WITH album_tracks AS (
                    SELECT album_name, artist_name, COUNT(DISTINCT track_uri) AS distinct_tracks
                    FROM history
                    WHERE album_name IS NOT NULL AND track_uri LIKE 'spotify:track:%'{clause}
                    GROUP BY album_name, artist_name
                )
                SELECT AVG((distinct_tracks >= 3)::INTEGER) FROM album_tracks
                """
            ).fetchone()[0]
            deep_share = round(float(r), 3) if r is not None else None
        except Exception:
            deep_share = None

        # Most-played track in a single day (>= 30s plays only, so auto-repeat
        # skip-spam doesn't masquerade as a genuine binge).
        top_day_track = None
        try:
            d = con.execute(
                f"""
                SELECT CAST(ts + to_minutes({off}) AS DATE) AS day, track_uri,
                       any_value(track_name), any_value(artist_name), COUNT(*) AS plays
                FROM history
                WHERE track_uri LIKE 'spotify:track:%' AND ts IS NOT NULL
                  AND track_name IS NOT NULL AND ms_played >= 30000{clause}
                GROUP BY day, track_uri
                ORDER BY plays DESC, day, track_uri
                LIMIT 1
                """
            ).fetchone()
            if d:
                day = d[0]
                top_day_track = {
                    "name": d[2],
                    "artist": d[3] or "",
                    "id": d[1].split(":")[-1],
                    "count": int(d[4]),
                    "date": f"{day.strftime('%B')} {day.day}, {day.year}",
                }
        except Exception:
            top_day_track = None

        # The favourite you almost never skip (many plays, low fwdbtn rate).
        no_skip = None
        try:

            def pick(min_plays):
                return con.execute(
                    f"""
                    SELECT split_part(track_uri, ':', 3) AS id, any_value(track_name),
                           any_value(artist_name), COUNT(*) AS plays,
                           AVG(CASE WHEN reason_end = 'fwdbtn' THEN 1.0 ELSE 0.0 END) AS skip_rate
                    FROM history
                    WHERE track_uri LIKE 'spotify:track:%' AND track_name IS NOT NULL{clause}
                    GROUP BY track_uri HAVING COUNT(*) >= {min_plays}
                    ORDER BY skip_rate ASC, plays DESC, id LIMIT 1
                    """
                ).fetchone()

            n = pick(20) or pick(5)
            if n:
                no_skip = {
                    "name": n[1],
                    "artist": n[2] or "",
                    "id": n[0],
                    "plays": int(n[3]),
                    "skip_rate": round(float(n[4]), 3),
                }
        except Exception:
            no_skip = None

        return {
            "concentration": {"top10_share": top10_share},
            "album_commitment": {"deep_share": deep_share} if deep_share is not None else None,
            "top_day_track": top_day_track,
            "no_skip": no_skip,
        }

    res = await run_in_threadpool(query)
    if not res:
        return {
            "status": "ok",
            "year": yr,
            "concentration": None,
            "album_commitment": None,
            "top_day_track": None,
            "no_skip": None,
        }
    return {"status": "ok", "year": yr, **res}
