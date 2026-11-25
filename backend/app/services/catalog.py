"""Catalog enrichment: build a per-session ``track_features`` slice.

On upload we join the session's ``history`` against the read-only 45M-track catalog
(``catalog_sorted.parquet``) and materialize only the matched rows. All later dashboard
queries read that tiny table, so the multi-GB catalog is scanned once per upload, never
in a request path. The scan is memory-capped and streamed (spills to disk, never RAM).
"""

import re
import threading
from pathlib import Path
from typing import Any

from app.config import settings
from app.db import Con, has_table, scalar

# Only one catalog scan at a time per process: each one may use ~memory_limit RAM.
# Upload additionally bounds concurrency with its own async semaphore.
_scan_lock = threading.BoundedSemaphore(1)

_MEMORY_RE = re.compile(r"^\d+(\.\d+)?\s*[KMGT]i?B$", re.IGNORECASE)


def catalog_available() -> bool:
    return Path(settings.catalog_path).exists()


def _apply_guardrails(con: Con) -> None:
    # SET does not accept bound parameters, so validate before inlining.
    mem = settings.duckdb_memory_limit.strip()
    if not _MEMORY_RE.fullmatch(mem):
        raise ValueError(f"Invalid REWIND_DUCKDB_MEMORY_LIMIT: {mem!r}")
    con.execute(f"SET memory_limit='{mem}'")
    con.execute(f"SET threads={int(settings.duckdb_threads)}")
    if settings.duckdb_temp_dir:
        temp = Path(settings.duckdb_temp_dir)
        temp.mkdir(parents=True, exist_ok=True)
        quoted = str(temp).replace("'", "''")
        con.execute(f"SET temp_directory='{quoted}'")


def enrich_session(con: Con) -> dict[str, Any]:
    """Build/refresh ``track_features`` in the session DB from the catalog.

    Returns a status dict with match/coverage counts. A missing catalog is not an error.
    """
    if not catalog_available():
        return {
            "status": "skipped",
            "reason": "catalog_missing",
            "matched": 0,
            "total": 0,
            "coverage": 0.0,
        }

    with _scan_lock:
        _apply_guardrails(con)
        # Tiny build side (user's distinct track_ids) probing the streamed 45M catalog.
        con.execute(
            """
            CREATE OR REPLACE TABLE track_features AS
            SELECT c.*
            FROM read_parquet(?) AS c
            SEMI JOIN (
                SELECT DISTINCT replace(track_uri, 'spotify:track:', '') AS track_id
                FROM history
                WHERE track_uri LIKE 'spotify:track:%'
            ) AS h ON c.track_id = h.track_id
            """,
            [str(settings.catalog_path)],
        )

    matched = scalar(con, "SELECT count(*) FROM track_features") or 0
    total = scalar(
        con,
        """
        SELECT count(DISTINCT replace(track_uri, 'spotify:track:', ''))
        FROM history
        WHERE track_uri LIKE 'spotify:track:%'
        """,
    )
    total = total or 0

    return {
        "status": "ok",
        "matched": matched,
        "total": total,
        "coverage": round(matched / total, 4) if total else 0.0,
    }


def ensure_track_features(con: Con) -> None:
    """Lazily enrich a session that has history but no ``track_features`` yet
    (e.g. it was uploaded while the catalog was unavailable)."""
    if not catalog_available() or not has_table(con, "history"):
        return
    if has_table(con, "track_features"):
        return
    enrich_session(con)
