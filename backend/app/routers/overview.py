"""Overview-page metrics: totals, top artist/album/track, songs, active day, heatmap.

Before any upload every endpoint answers ``status: ok`` with zero / ``null``
values (the frontend shows its empty state), never a 4xx.
"""

from typing import Any

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con, has_table, scalar
from app.routers.explore._common import local_ts
from app.schemas.overview import (
    ActiveDay,
    Heatmap,
    TopAlbum,
    TopArtist,
    TopTrack,
    TotalSongs,
    TotalTime,
)
from app.services import covers
from app.services.metrics import (
    WEEKDAY_NAMES,
    heatmap_level,
    heatmap_thresholds,
    tz_offset_minutes,
)

router = APIRouter()


def _minutes(ms: float | None) -> float:
    return round((ms or 0) / 60000, 2)


@router.get("/api/metrics/total-time", response_model=TotalTime)
async def get_total_time(con: Con = Depends(get_con)):
    def query() -> float:
        if not has_table(con, "history"):
            return 0
        return scalar(con, "SELECT COALESCE(SUM(ms_played), 0) FROM history") or 0

    return {"total_minutes": _minutes(await run_in_threadpool(query))}


@router.get("/api/metrics/top-artist", response_model=TopArtist)
async def get_top_artist(con: Con = Depends(get_con)):
    def query() -> dict[str, Any]:
        if not has_table(con, "history"):
            return {}
        row = con.execute(
            "SELECT artist_name, COUNT(*) AS streams, COALESCE(SUM(ms_played), 0) AS ms "
            "FROM history WHERE artist_name IS NOT NULL "
            "GROUP BY artist_name ORDER BY streams DESC LIMIT 1"
        ).fetchone()
        if not row:
            return {}
        name, streams, ms = row
        refs = covers.artist_cover_refs(con)
        artist_id, kind, cover_id = refs.get(covers.norm_artist_key(name), (None, None, None))
        if not kind:
            artist_id, kind, cover_id = refs.get(name.strip().upper(), (None, None, None))
        return {
            "artist_name": name,
            "total_streams": streams,
            "total_minutes": _minutes(ms),
            "artist_id": artist_id,
            "cover_kind": kind or "artist",
            "cover_id": cover_id or artist_id,
        }

    res = await run_in_threadpool(query)
    empty = {"artist_name": None, "artist_id": None, "cover_kind": None, "cover_id": None}
    return {**empty, "total_streams": 0, "total_minutes": 0, **res}


@router.get("/api/metrics/top-album", response_model=TopAlbum)
async def get_top_album(con: Con = Depends(get_con)):
    def query() -> dict[str, Any]:
        if not has_table(con, "history"):
            return {}
        row = con.execute(
            "SELECT album_name, artist_name, COUNT(*) AS streams, "
            "COALESCE(SUM(ms_played), 0) AS ms FROM history WHERE album_name IS NOT NULL "
            "GROUP BY album_name, artist_name ORDER BY ms DESC LIMIT 1"
        ).fetchone()
        if not row:
            return {}
        album, artist, streams, ms = row
        # Identity-based: history.track_uri → track_features.album_id, with a
        # representative track id as the fallback cover (see covers.py).
        album_id, kind, cover_id = covers.album_cover_refs(con).get(
            (album, artist), (None, None, None)
        )
        return {
            "album_name": album,
            "artist_name": artist,
            "total_streams": streams,
            "total_minutes": _minutes(ms),
            "album_id": album_id,
            "cover_kind": kind,
            "cover_id": cover_id,
        }

    res = await run_in_threadpool(query)
    empty = {"album_name": None, "artist_name": None, "album_id": None}
    return {
        **empty,
        "cover_kind": None,
        "cover_id": None,
        "total_streams": 0,
        "total_minutes": 0,
        **res,
    }


@router.get("/api/metrics/top-track", response_model=TopTrack)
async def get_top_track(con: Con = Depends(get_con)):
    def query() -> dict[str, Any]:
        if not has_table(con, "history"):
            return {}
        row = con.execute(
            "SELECT track_name, artist_name, COUNT(*) AS streams, "
            "COALESCE(SUM(ms_played), 0) AS ms, "
            "MAX(replace(track_uri, 'spotify:track:', '')) "
            "FILTER (WHERE track_uri LIKE 'spotify:track:%') AS id "
            "FROM history WHERE track_name IS NOT NULL "
            "GROUP BY track_name, artist_name ORDER BY streams DESC LIMIT 1"
        ).fetchone()
        if not row:
            return {}
        name, artist, streams, ms, track_id = row
        return {
            "track_name": name,
            "artist_name": artist,
            "total_streams": streams,
            "total_minutes": _minutes(ms),
            "track_id": track_id,
        }

    res = await run_in_threadpool(query)
    empty = {"track_name": None, "artist_name": None, "track_id": None}
    return {**empty, "total_streams": 0, "total_minutes": 0, **res}


@router.get("/api/metrics/heatmap", response_model=Heatmap)
async def get_heatmap(year: int | None = None, con: Con = Depends(get_con)):
    """Daily listening activity for a GitHub-style calendar heatmap.

    Returns every year present in the history plus, for the requested year
    (default / out of range: the most recent), one entry per active day with its
    stream count, minutes, an adaptive intensity level and that day's top track.
    """

    def query() -> dict[str, Any]:
        if not has_table(con, "history"):
            return {"years": [], "year": None, "days": []}
        off = tz_offset_minutes(con)
        lts = local_ts(off)
        years = [
            r[0]
            for r in con.execute(
                f"SELECT DISTINCT EXTRACT(year FROM {lts})::INTEGER AS y "
                "FROM history WHERE ts IS NOT NULL ORDER BY y"
            ).fetchall()
        ]
        if not years:
            return {"years": [], "year": None, "days": []}
        target = year if year in years else years[-1]

        daily = con.execute(
            f"SELECT CAST({lts} AS DATE) AS day, COUNT(*) AS streams, "
            "COALESCE(SUM(ms_played), 0) AS ms FROM history "
            f"WHERE ts IS NOT NULL AND EXTRACT(year FROM {lts}) = ? "
            "GROUP BY day ORDER BY day",
            [target],
        ).fetchall()
        top_map = {
            str(r[0]): (r[1], r[2])
            for r in con.execute(
                "SELECT day, track_name, artist_name FROM ("
                f"  SELECT CAST({lts} AS DATE) AS day, track_name, artist_name, "
                "         ROW_NUMBER() OVER (PARTITION BY CAST("
                f"{lts} AS DATE) ORDER BY COUNT(*) DESC, SUM(ms_played) DESC) AS rn "
                "  FROM history WHERE ts IS NOT NULL AND track_name IS NOT NULL "
                f"        AND EXTRACT(year FROM {lts}) = ? "
                "  GROUP BY day, track_name, artist_name"
                ") t WHERE rn = 1",
                [target],
            ).fetchall()
        }

        counts = [row[1] for row in daily]
        thresholds = heatmap_thresholds(counts)
        days = []
        for day, streams, ms in daily:
            top = top_map.get(str(day))
            days.append(
                {
                    "date": str(day),
                    "streams": streams,
                    "minutes": _minutes(ms),
                    "level": heatmap_level(streams, thresholds),
                    "top_track": top[0] if top else None,
                    "top_artist": top[1] if top else None,
                }
            )
        return {
            "years": years,
            "year": target,
            "active_days": len(days),
            "total_streams": sum(counts),
            "total_minutes": _minutes(sum(r[2] for r in daily)),
            "max_streams": max(counts) if counts else 0,
            "days": days,
        }

    return await run_in_threadpool(query)


@router.get("/api/metrics/total-songs", response_model=TotalSongs)
async def get_total_songs(con: Con = Depends(get_con)):
    """Number of distinct Spotify tracks in the listening history."""

    def query() -> int:
        if not has_table(con, "history"):
            return 0
        row = con.execute(
            "SELECT COUNT(DISTINCT track_uri) FROM history WHERE track_uri LIKE 'spotify:track:%'"
        ).fetchone()
        return int(row[0]) if row and row[0] else 0

    return {"total_songs": await run_in_threadpool(query)}


@router.get("/api/metrics/active-day", response_model=ActiveDay)
async def get_active_day(con: Con = Depends(get_con)):
    """Weekday with the most listening, plus average listening per that weekday."""

    def query() -> list[tuple]:
        if not has_table(con, "history"):
            return []
        lts = local_ts(tz_offset_minutes(con))
        return con.execute(
            f"SELECT EXTRACT(isodow FROM {lts}) AS dow, COALESCE(SUM(ms_played), 0) AS ms, "
            f"COUNT(DISTINCT CAST({lts} AS DATE)) AS days "
            "FROM history WHERE ts IS NOT NULL GROUP BY dow ORDER BY ms DESC"
        ).fetchall()

    rows = await run_in_threadpool(query)
    if not rows:
        return {"weekday": None, "average_minutes": 0, "total_minutes": 0}
    dow, ms, days = rows[0]
    return {
        "weekday": WEEKDAY_NAMES.get(int(dow)),
        "average_minutes": _minutes(ms / days if days else 0),
        "total_minutes": _minutes(ms),
    }
