"""Ranked trajectories: year filter options, rank climb (artist/track) and bar race."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con
from app.routers.explore._common import (
    attach_image_urls,
    canonical_artist_id_map,
    canonical_artist_rows,
    distinct_years,
    local_ts,
    parse_year,
    track_id_map,
    year_clause,
)
from app.schemas.explore import ArtistRank, BarRace, TrackRank, YearOption, Years
from app.services import covers
from app.services.catalog import ensure_track_features
from app.services.covers import norm_artist_key
from app.services.metrics import compute_bar_race, smoothed_rank_frames, tz_offset_minutes

router = APIRouter()

MAX_SERIES = 50  # rank climb / bar race lines; the UI shows ≤12


def _frames(full_months: list[str]) -> dict[str, Any]:
    return {
        "start_month": full_months[0] if full_months else None,
        "end_month": full_months[-1] if full_months else None,
        "total_months": len(full_months),
        "months": full_months,
    }


@router.get("/api/metrics/years", response_model=Years)
async def get_years(con: Con = Depends(get_con)):
    """Year options for the explore-page filter. Empty list (never a 500) when the
    session has no history yet — the frontend then shows "All time" alone."""

    def query():
        return distinct_years(con, tz_offset_minutes(con))

    years = await run_in_threadpool(query)
    return Years(years=[YearOption(year=y) for y in years])


@router.get("/api/metrics/artist-rank", response_model=ArtistRank)
async def get_artist_rank(
    limit: int = Query(10, ge=1, le=MAX_SERIES),
    year: str = "all",
    con: Con = Depends(get_con),
):
    """Weekly EWMA-smoothed artist ranks for the rank-climb chart."""
    yr = parse_year(year)

    def query():
        ensure_track_features(con)
        off = tz_offset_minutes(con)
        try:
            weekly = canonical_artist_rows(con, "week", yr, off)
        except Exception:
            weekly = []
        full_months, featured = smoothed_rank_frames(weekly, key_len=1, limit=limit)
        data = [
            {
                "rank": idx,
                "artist_name": f["key"][0],
                "id": None,
                "total_streams": f["total_streams"],
                "total_minutes": round(f["total_ms"] / 60000, 2),
                "monthly_ranks": f["monthly_ranks"],
            }
            for idx, f in enumerate(featured, start=1)
        ]
        covers.attach_artist_cover_refs(con, data, name_key="artist_name")
        attach_image_urls(con, "artist", data)
        return {**_frames(full_months), "data": data}

    return {"year": yr, **await run_in_threadpool(query)}


@router.get("/api/metrics/track-rank", response_model=TrackRank)
async def get_track_rank(
    limit: int = Query(10, ge=1, le=MAX_SERIES),
    year: str = "all",
    con: Con = Depends(get_con),
):
    """Weekly EWMA-smoothed track ranks for the rank-climb chart."""
    yr = parse_year(year)

    def query():
        ensure_track_features(con)
        off = tz_offset_minutes(con)
        week = f"date_trunc('week', {local_ts(off)})"
        try:
            weekly = con.execute(
                f"""
                SELECT {week} AS period, track_name, artist_name,
                       SUM(ms_played) AS ms, COUNT(*) AS streams
                FROM history
                WHERE track_name IS NOT NULL AND ts IS NOT NULL{year_clause(yr, off)}
                GROUP BY {week}, track_name, artist_name
                ORDER BY period ASC, ms DESC, streams DESC
                """
            ).fetchall()
        except Exception:
            weekly = []

        full_months, featured = smoothed_rank_frames(weekly, key_len=2, limit=limit)
        ids = track_id_map(con)
        data = [
            {
                "rank": idx,
                "track_name": f["key"][0],
                "artist_name": f["key"][1],
                "id": ids.get(f["key"]),
                "total_streams": f["total_streams"],
                "total_minutes": round(f["total_ms"] / 60000, 2),
                "monthly_ranks": f["monthly_ranks"],
            }
            for idx, f in enumerate(featured, start=1)
        ]
        attach_image_urls(con, "track", data)
        return {**_frames(full_months), "data": data}

    return {"year": yr, **await run_in_threadpool(query)}


_RACE_SPECS = {
    "track": ("track_name, artist_name", "track_name"),
    "album": ("album_name, artist_name", "album_name"),
}


@router.get("/api/metrics/bar-race", response_model=BarRace)
async def get_bar_race(
    entity: Literal["artist", "track", "album"] = "artist",
    limit: int = Query(12, ge=1, le=MAX_SERIES),
    year: str = "all",
    con: Con = Depends(get_con),
):
    """Cumulative-listening bar race frames (monthly) for artist / track / album."""
    yr = parse_year(year)

    def query():
        ensure_track_features(con)
        off = tz_offset_minutes(con)
        month = f"date_trunc('month', {local_ts(off)})"
        try:
            if entity == "artist":
                # compute_bar_race ignores the trailing streams column.
                rows = canonical_artist_rows(con, "month", yr, off)
                key_len = 1
            else:
                cols, name_col = _RACE_SPECS[entity]
                rows = con.execute(
                    f"""
                    SELECT {month} AS month, {cols}, SUM(ms_played) AS ms
                    FROM history
                    WHERE {name_col} IS NOT NULL AND ts IS NOT NULL{year_clause(yr, off)}
                    GROUP BY {month}, {cols}
                    """
                ).fetchall()
                key_len = 2
        except Exception:
            rows, key_len = [], 1 if entity == "artist" else 2

        full_months, featured = compute_bar_race(rows, key_len, limit)

        artist_ids = canonical_artist_id_map(con) if entity == "artist" else {}
        track_ids = track_id_map(con) if entity == "track" else {}
        data: list[dict[str, Any]] = []
        for idx, f in enumerate(featured, start=1):
            if entity == "artist":
                item_id = artist_ids.get(norm_artist_key(f["key"][0]))
            elif entity == "track":
                item_id = track_ids.get(f["key"])
            else:
                item_id = None  # albums resolve below (identity-based, see covers)
            item = {
                "rank": idx,
                "name": f["key"][0],
                "id": item_id,
                "total_minutes": round(f["total_ms"] / 60000, 2),
                "cumulative_minutes": [round(v / 60000, 2) for v in f["cumulative_ms"]],
            }
            if key_len == 2:
                item["artist_name"] = f["key"][1]
            data.append(item)

        if entity == "album":
            covers.attach_album_cover_refs(con, data, name_key="name", artist_key="artist_name")
        elif entity == "artist":
            covers.attach_artist_cover_refs(con, data, name_key="name")
        attach_image_urls(con, entity, data)
        return {**_frames(full_months), "data": data}

    return {"entity": entity, "year": yr, **await run_in_threadpool(query)}
