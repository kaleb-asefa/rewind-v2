"""How you listen: shuffle, skips, binges, attention, loops."""

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con
from app.routers.explore._common import parse_year, year_clause
from app.schemas.explore import Behavior
from app.services.catalog import ensure_track_features
from app.services.metrics import tz_offset_minutes

router = APIRouter()


@router.get("/api/metrics/behavior", response_model=Behavior)
async def get_behavior(year: str = "all", con: Con = Depends(get_con)):
    """Listening-habit profile for the "How You Listen" chapter, from history only
    (100% coverage, no catalog dependency). shuffle=None when history is missing so
    the frontend keeps its sample fallback.

    "Skip" is defined as pressing next (reason_end = 'fwdbtn') — a deliberate action,
    more reliable than the coarse `skipped` flag or a raw <30s cutoff.
    """
    yr = parse_year(year)

    _MUSIC = "FROM history WHERE track_uri LIKE 'spotify:track:%'"

    def query():
        ensure_track_features(con)
        off = tz_offset_minutes(con)
        clause = year_clause(yr, off)

        try:
            row = con.execute(
                "SELECT "
                "AVG(CASE WHEN shuffle THEN 1.0 ELSE 0.0 END) AS shuffle, "
                "AVG(CASE WHEN reason_end = 'fwdbtn' THEN 1.0 ELSE 0.0 END) AS skip_rate, "
                "AVG(CASE WHEN COALESCE(reason_end, '') = 'trackdone' THEN 1.0 ELSE 0.0 END) AS finished, "
                "AVG(CASE WHEN COALESCE(reason_end, '') <> 'trackdone' AND ms_played < 30000 THEN 1.0 ELSE 0.0 END) AS under30, "
                "AVG(CASE WHEN COALESCE(reason_end, '') <> 'trackdone' AND ms_played >= 30000 THEN 1.0 ELSE 0.0 END) AS partial, "
                "COUNT(*) AS n " + _MUSIC + clause
            ).fetchone()
        except Exception:
            return None
        if not row or not row[5]:
            return None
        shuffle, skip_rate, finished, under30, partial, _n = row

        # Longest binge: cluster plays into sessions (gap > 30 min starts a new one),
        # then take the longest session's wall-clock span in minutes.
        longest_binge = 0
        try:
            b = con.execute(
                "WITH o AS ("
                "  SELECT ts, LAG(ts) OVER (ORDER BY ts) AS prev FROM history "
                f" WHERE ts IS NOT NULL{clause}"
                "), m AS ("
                "  SELECT ts, CASE WHEN prev IS NULL OR date_diff('minute', prev, ts) > 30 THEN 1 ELSE 0 END AS ns FROM o"
                "), s AS ("
                "  SELECT ts, SUM(ns) OVER (ORDER BY ts) AS sid FROM m"
                ") SELECT COALESCE(MAX(dur), 0) FROM ("
                "  SELECT date_diff('second', MIN(ts), MAX(ts)) / 60.0 AS dur FROM s GROUP BY sid"
                ")"
            ).fetchone()[0]
            longest_binge = round(b or 0)
        except Exception:
            longest_binge = 0

        # Loops: tracks played back-to-back (same track as the previous play). Only
        # count repeats that were actually listened to (>=30s) so auto-repeat skips
        # don't masquerade as favourites.
        loops = []
        try:
            lrows = con.execute(
                "WITH o AS ("
                "  SELECT ts, track_uri, track_name, artist_name, ms_played, "
                "         LAG(track_uri) OVER (ORDER BY ts) AS prev_uri "
                "  FROM history WHERE track_uri LIKE 'spotify:track:%' AND ts IS NOT NULL"
                f"{clause}"
                ") SELECT split_part(track_uri, ':', 3) AS id, any_value(track_name), "
                "any_value(artist_name), COUNT(*) AS loops "
                "FROM o WHERE track_uri = prev_uri AND ms_played >= 30000 "
                "GROUP BY track_uri HAVING COUNT(*) >= 2 ORDER BY loops DESC, track_uri LIMIT 4"
            ).fetchall()
            loops = [
                {"name": r[1], "artist": r[2] or "", "count": int(r[3]), "id": r[0]}
                for r in lrows
                if r[1]
            ]
        except Exception:
            loops = []

        return {
            "shuffle": round(shuffle or 0, 3),
            "skip_rate": round(skip_rate or 0, 3),
            "longest_binge_min": longest_binge,
            "attention": {
                "under30": round(under30 or 0, 3),
                "partial": round(partial or 0, 3),
                "finished": round(finished or 0, 3),
            },
            "loops": loops,
        }

    res = await run_in_threadpool(query)
    if not res:
        return {
            "status": "ok",
            "year": yr,
            "shuffle": None,
            "skip_rate": None,
            "longest_binge_min": 0,
            "attention": {"under30": 0, "partial": 0, "finished": 0},
            "loops": [],
        }
    return {"status": "ok", "year": yr, **res}
