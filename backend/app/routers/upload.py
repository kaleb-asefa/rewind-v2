"""Upload & image endpoints: ingest history JSON, enrich against the catalog,
and serve cached cover art."""

import asyncio
import contextlib
import logging
import os
import tempfile
from typing import IO, Any, BinaryIO, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from app.config import settings
from app.db import Con, connections, get_con, invalidate, scalar
from app.schemas.upload import ImageResult, ImagesResult, UploadResult
from app.services import catalog, covers, images

log = logging.getLogger(__name__)
router = APIRouter()

ImageKind = Literal["artist", "album", "track"]

# Each enrichment scans the shared catalog and uses up to the DuckDB memory limit;
# bound how many run at once so concurrent guest uploads can't exhaust RAM.
_enrich_semaphore: asyncio.Semaphore | None = None


def _semaphore() -> asyncio.Semaphore:
    global _enrich_semaphore
    if _enrich_semaphore is None:
        _enrich_semaphore = asyncio.Semaphore(settings.max_concurrent_enrich)
    return _enrich_semaphore


_COPY_CHUNK_BYTES = 1024 * 1024
MAX_BATCH_IDS = 200


def _too_large_detail() -> str:
    # Report bytes below 1 MB; integer MB would render a confusing "0 MB limit".
    limit = settings.max_upload_bytes
    mb = limit / (1024 * 1024)
    size = f"{mb:.0f} MB" if mb >= 1 else f"{limit} bytes"
    return f"Upload exceeds the {size} limit."


async def enforce_upload_size_limit(request: Request, call_next):
    """Reject an oversized upload before Starlette spools its body to disk.

    Content-Length is client-supplied (and absent on chunked requests), so this
    only catches the cheap, honest case; ``_process_upload`` enforces the cap
    again on the bytes actually received.
    """
    if request.url.path == "/api/upload":
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > settings.max_upload_bytes:
            return JSONResponse(status_code=413, content={"detail": _too_large_detail()})
    return await call_next(request)


def _copy_within_budget(src: BinaryIO, dst: IO[bytes], budget: int) -> int:
    """Stream ``src`` into ``dst`` in chunks, aborting once the byte budget is spent.

    Returns the budget left so it can be threaded across a multi-file upload,
    bounding the request as a whole rather than each file individually.
    """
    while True:
        chunk = src.read(_COPY_CHUNK_BYTES)
        if not chunk:
            return budget
        budget -= len(chunk)
        if budget < 0:
            raise HTTPException(status_code=413, detail=_too_large_detail())
        dst.write(chunk)


# Spotify export field → history column, with its DuckDB type.
MAPPING = [
    ("ts", "ts", "TIMESTAMP"),
    ("username", "username", "VARCHAR"),
    ("platform", "platform", "VARCHAR"),
    ("ms_played", "ms_played", "BIGINT"),
    ("conn_country", "conn_country", "VARCHAR"),
    ("master_metadata_track_name", "track_name", "VARCHAR"),
    ("master_metadata_album_artist_name", "artist_name", "VARCHAR"),
    ("master_metadata_album_album_name", "album_name", "VARCHAR"),
    ("spotify_track_uri", "track_uri", "VARCHAR"),
    ("episode_name", "episode_name", "VARCHAR"),
    ("episode_show_name", "episode_show_name", "VARCHAR"),
    ("spotify_episode_uri", "episode_uri", "VARCHAR"),
    ("reason_start", "reason_start", "VARCHAR"),
    ("reason_end", "reason_end", "VARCHAR"),
    ("shuffle", "shuffle", "BOOLEAN"),
    ("skipped", "skipped", "BOOLEAN"),
    ("offline", "offline", "BOOLEAN"),
    ("offline_timestamp", "offline_timestamp", "TIMESTAMP"),
    ("incognito_mode", "incognito_mode", "BOOLEAN"),
]


def _process_upload(con: Con, upload_list: list[UploadFile]) -> dict[str, Any]:
    temp_paths: list[str] = []
    budget = settings.max_upload_bytes
    try:
        for f in upload_list:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".json") as temp_file:
                # Record the path before writing so an aborted copy is still cleaned up.
                temp_paths.append(temp_file.name)
                budget = _copy_within_budget(f.file, temp_file, budget)

        col_defs = ", ".join(f"{target} {dtype}" for _, target, dtype in MAPPING)
        con.execute(f"CREATE TABLE IF NOT EXISTS history ({col_defs})")

        existing_cols = {
            row[0]
            for row in con.execute(
                "DESCRIBE SELECT * FROM read_json_auto(?, union_by_name=True)", [temp_paths]
            ).fetchall()
        }
        select_clause = ",\n            ".join(
            f"TRY_CAST({src} AS {dtype}) AS {target}"
            if src in existing_cols
            else f"CAST(NULL AS {dtype}) AS {target}"
            for src, target, dtype in MAPPING
        )
        con.execute(
            f"INSERT INTO history SELECT {select_clause} "
            "FROM read_json_auto(?, union_by_name=True)",
            [temp_paths],
        )
        total_rows = scalar(con, "SELECT count(*) FROM history") or 0
        return {
            "message": f"Successfully ingested {len(upload_list)} file(s).",
            "files_processed": len(upload_list),
            "total_rows": total_rows,
        }
    finally:
        for path in temp_paths:
            with contextlib.suppress(OSError):
                os.remove(path)


# Cover pre-warm: the id sets every chart lands on (bar race, rank climb, charts
# leaderboard, taste gems, deep cuts, …) are the top artists/tracks/albums by
# listening. The long tail is warmed on demand by the /api/images path instead.
_PREWARM_LIMIT = 50


def _collect_prewarm_sets(con: Con) -> dict[str, list[str]]:
    """Top artist / track / album spotify ids to warm the cover cache for.

    Tracks come straight from ``track_uri``; artist/album ids come from the
    enriched ``track_features`` slice (absent without a catalog, in which case
    those kinds are skipped). Albums and artists the catalog doesn't know fall
    back to a representative track id, so those go in the track set too.
    """
    sets: dict[str, list[str]] = {
        "track": [
            r[0]
            for r in con.execute(
                "SELECT split_part(track_uri, ':', 3) AS id, SUM(ms_played) AS ms "
                "FROM history WHERE track_uri LIKE 'spotify:track:%' "
                f"GROUP BY id ORDER BY ms DESC LIMIT {_PREWARM_LIMIT}"
            ).fetchall()
        ]
    }
    for kind, col in (("artist", "artist_id"), ("album", "album_id")):
        try:
            sets[kind] = [
                r[0]
                for r in con.execute(
                    f"SELECT f.{col} AS id, SUM(h.ms_played) AS ms "
                    "FROM history h JOIN track_features f "
                    "ON split_part(h.track_uri, ':', 3) = f.track_id "
                    f"WHERE f.{col} IS NOT NULL "
                    f"GROUP BY id ORDER BY ms DESC LIMIT {_PREWARM_LIMIT}"
                ).fetchall()
            ]
        except Exception:
            sets[kind] = []  # no track_features (no catalog) — skip this kind

    fallbacks = covers.album_fallback_track_ids(
        con, _PREWARM_LIMIT
    ) + covers.artist_fallback_track_ids(con, _PREWARM_LIMIT)
    if fallbacks:
        sets["track"] = list(dict.fromkeys(sets["track"] + fallbacks))
    return sets


def _warm_covers(ticket: str, sets_by_kind: dict[str, list[str]]) -> None:
    """Background job: warm the cover cache on a fresh cursor after the response
    is sent. Best-effort — failures are logged, never raised."""
    try:
        con = connections.cursor(ticket)
        try:
            images.prewarm_session_covers(con, sets_by_kind)
        finally:
            con.close()
    except Exception:
        log.warning("cover pre-warm failed for session %s", ticket, exc_info=True)


@router.post("/api/upload", response_model=UploadResult)
async def upload(
    background_tasks: BackgroundTasks,
    request: Request,
    file: UploadFile | None = File(None),
    files: list[UploadFile] | None = File(None),
    con: Con = Depends(get_con),
):
    """Ingest one or more Spotify Extended Streaming History JSON files, then
    enrich them against the catalog and warm the cover cache in the background."""
    upload_list = [f for f in [*(files or []), file] if f is not None]
    if not upload_list:
        raise HTTPException(status_code=400, detail="No files provided for upload.")
    if len(upload_list) > settings.max_upload_files:
        raise HTTPException(
            status_code=413,
            detail=f"Too many files: {len(upload_list)} (limit {settings.max_upload_files}).",
        )
    for f in upload_list:
        if not (f.filename or "").endswith(".json"):
            raise HTTPException(
                status_code=400, detail=f"File '{f.filename}' is not a supported JSON file."
            )

    ticket: str = request.state.session_id
    try:
        result = await run_in_threadpool(_process_upload, con, upload_list)
    except HTTPException:
        raise
    except Exception as e:
        log.exception("ingest failed for session %s", ticket)
        raise HTTPException(
            status_code=500,
            detail="Could not read these files. Make sure they are Spotify Extended "
            "Streaming History JSON exports.",
        ) from e
    finally:
        invalidate(ticket)  # history changed: drop memoized per-session values

    try:
        async with _semaphore():
            result["enrichment"] = await run_in_threadpool(catalog.enrich_session, con)
    except Exception:
        # Best-effort: ingestion already succeeded.
        log.exception("catalog enrichment failed for session %s", ticket)
        result["enrichment"] = {"status": "error", "reason": "enrichment_failed"}

    try:
        prewarm_sets = await run_in_threadpool(_collect_prewarm_sets, con)
        background_tasks.add_task(_warm_covers, ticket, prewarm_sets)
    except Exception:
        log.warning("could not schedule cover pre-warm for %s", ticket, exc_info=True)

    return result


@router.get("/api/image", response_model=ImageResult)
async def get_image(kind: ImageKind, id: str, con: Con = Depends(get_con)):
    """Return a cached Spotify cover URL for an artist/album/track id (fetching
    it from oEmbed on a cache miss)."""
    url = await run_in_threadpool(images.get_or_fetch, con, kind, id)
    return {"image_url": url}


@router.get("/api/images", response_model=ImagesResult)
async def get_images(kind: ImageKind, ids: str, con: Con = Depends(get_con)):
    """Batch-resolve cover URLs for up to 200 comma-separated ids in one call.
    Cache misses are fetched concurrently, so a chart's covers land together."""
    id_list = [i for i in ids.split(",") if i][:MAX_BATCH_IDS]
    result = await run_in_threadpool(images.get_or_fetch_many, con, kind, id_list)
    return {"images": result}
