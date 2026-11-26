"""Cover-art cache: fetch Spotify oEmbed thumbnails on demand and cache them.

oEmbed needs no API key. A track's cover is its album cover; artist/album return
their own images. Results (including genuine misses, stored as '') live in ONE
cache shared by every session (``cover_store()``): a cover is public per-song data,
so it is fetched from Spotify once per server, not once per upload.

Spotify rate-limits oEmbed (HTTP 429). On a 429 all outbound lookups pause for the
``Retry-After`` the server asks for; ids hit by it are reported as transient (never
cached as misses), and the client retries them later.

Functions take a DB-API connection (``store``) so they work on the shared SQLite
store in production and on a throwaway connection in tests.
"""

import contextlib
import json
import logging
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings

OEMBED_URL = "https://open.spotify.com/oembed"
_VALID_KINDS = {"artist", "album", "track"}
_MAX_WORKERS = 4  # concurrent oEmbed fetches per batch (gentle on Spotify's rate limit)

# On-demand batch (/api/images) retry: tight so an HTTP call never hangs long.
# Cached covers skip this entirely; only transient misses are retried.
_BATCH_RETRIES = 2  # extra passes after the first, for ids that hit a transient error
_BATCH_BACKOFF = 0.5  # base seconds between passes; scales up per attempt

# Background pre-warm retry: patient (off the request path) so a rate-limited
# burst eventually fills in. Genuine art-less ids are cached on pass 1, not retried.
_PREWARM_PASSES = 3
_PREWARM_BACKOFF = 2.0


def _ensure_table(raw_con):
    raw_con.execute(
        """
        CREATE TABLE IF NOT EXISTS images (
            kind        VARCHAR,
            spotify_id  VARCHAR,
            image_url   VARCHAR,
            fetched_at  TIMESTAMP,
            PRIMARY KEY (kind, spotify_id)
        )
        """
    )


log = logging.getLogger(__name__)


@contextlib.contextmanager
def cover_store() -> Iterator[sqlite3.Connection]:
    """The server-wide cover cache (SQLite, safe across threads and processes)."""
    path = Path(settings.covers_db)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=15)
    try:
        con.execute("PRAGMA journal_mode=WAL")
        _ensure_table(con)
        yield con
        con.commit()
    finally:
        con.close()


class RateLimited(Exception):
    """Spotify asked us to slow down; nothing was fetched."""


# While Spotify rate-limits us, no outbound lookups at all (shared by all threads).
_cooldown_lock = threading.Lock()
_cooldown_until = 0.0
_DEFAULT_COOLDOWN = 30.0
_MAX_COOLDOWN = 300.0


def _start_cooldown(retry_after: str | None) -> None:
    global _cooldown_until
    try:
        seconds = float(retry_after) if retry_after else _DEFAULT_COOLDOWN
    except ValueError:
        seconds = _DEFAULT_COOLDOWN
    seconds = max(1.0, min(seconds, _MAX_COOLDOWN))
    with _cooldown_lock:
        if time.monotonic() + seconds > _cooldown_until:
            _cooldown_until = time.monotonic() + seconds
            log.warning("Spotify oEmbed rate limit: pausing cover lookups for %.0fs", seconds)


def cooling_down() -> bool:
    with _cooldown_lock:
        return time.monotonic() < _cooldown_until


def _fetch_thumbnail(kind: str, spotify_id: str) -> str | None:
    if not settings.covers_enabled:
        return None  # offline mode (tests, air-gapped deploys): no cover art
    if cooling_down():
        raise RateLimited  # don't extend the ban by retrying during it
    page = f"https://open.spotify.com/{kind}/{spotify_id}"
    url = f"{OEMBED_URL}?url=" + urllib.parse.quote(page, safe="")
    req = urllib.request.Request(url, headers={"User-Agent": "Rewind/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.load(resp).get("thumbnail_url")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            _start_cooldown(e.headers.get("Retry-After"))
            raise RateLimited from e
        if e.code in (400, 404):
            return None  # unknown / unavailable id: a genuine, cacheable miss
        raise


def _safe_fetch(kind: str, spotify_id: str) -> tuple[bool, str | None]:
    """Fetch one thumbnail. Returns (fetched_ok, url).

    fetched_ok is False only on a transient error (network/timeout/rate-limit),
    so the caller can skip caching it and let a later load retry. A successful
    response with no image returns (True, None) — a genuine miss worth caching.
    """
    try:
        return True, _fetch_thumbnail(kind, spotify_id)
    except Exception:
        return False, None


def get_or_fetch(raw_con, kind: str, spotify_id: str) -> str | None:
    """Return a cached cover URL, fetching + caching from oEmbed on a miss."""
    if kind not in _VALID_KINDS or not spotify_id:
        return None
    _ensure_table(raw_con)

    cached = raw_con.execute(
        "SELECT image_url FROM images WHERE kind = ? AND spotify_id = ?",
        [kind, spotify_id],
    ).fetchone()
    if cached is not None:
        return cached[0] or None

    ok, url = _safe_fetch(kind, spotify_id)
    if not ok:
        return None  # transient failure — don't cache, allow a later retry

    raw_con.execute(
        """
        INSERT INTO images (kind, spotify_id, image_url, fetched_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (kind, spotify_id) DO UPDATE SET
            image_url = excluded.image_url,
            fetched_at = excluded.fetched_at
        """,
        [kind, spotify_id, url or "", datetime.now(UTC).isoformat()],
    )
    return url


def _fetch_and_store(raw_con, kind: str, pending: list[str]):
    """Concurrently fetch ``pending`` ids, persist only the definitive results,
    and return ``(resolved, transient)``.

    ``resolved`` maps each id that got a response to its url-or-None (genuine
    art-less ids resolve to None and are cached as ''). ``transient`` lists the
    ids that hit a network/timeout/rate-limit error — never cached, so a caller
    can retry them.
    """
    with ThreadPoolExecutor(max_workers=min(_MAX_WORKERS, len(pending))) as pool:
        results = list(
            zip(pending, pool.map(lambda s: _safe_fetch(kind, s), pending), strict=False)
        )
    now = datetime.now(UTC).isoformat()
    to_write = []
    resolved: dict[str, str | None] = {}
    transient: list[str] = []
    for sid, (ok, url) in results:
        if ok:  # only persist definitive results, never transient failures
            resolved[sid] = url
            to_write.append([kind, sid, url or "", now])
        else:
            transient.append(sid)
    if to_write:
        raw_con.executemany(
            "INSERT INTO images (kind, spotify_id, image_url, fetched_at) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT (kind, spotify_id) DO UPDATE SET "
            "image_url = excluded.image_url, fetched_at = excluded.fetched_at",
            to_write,
        )
    return resolved, transient


def get_or_fetch_many(raw_con, kind: str, ids: list[str]) -> dict[str, str | None]:
    """Resolve many cover URLs at once: one cache read, concurrent oEmbed fetch
    for the misses, one bulk write. Returns {spotify_id: url_or_None}.

    Cache misses that hit a transient error (rate-limit/timeout) are retried a
    couple of times with a short backoff so a cold batch returns as complete as
    possible in one HTTP call. Already-cached ids return instantly, never retried.
    """
    if kind not in _VALID_KINDS:
        return {}
    ids = [i for i in dict.fromkeys(ids) if i]  # dedupe, drop blanks, keep order
    if not ids:
        return {}
    _ensure_table(raw_con)

    placeholders = ",".join("?" * len(ids))
    cached = {
        row[0]: row[1]
        for row in raw_con.execute(
            f"SELECT spotify_id, image_url FROM images "
            f"WHERE kind = ? AND spotify_id IN ({placeholders})",
            [kind, *ids],
        ).fetchall()
    }

    fetched: dict[str, str | None] = {}
    pending = [i for i in ids if i not in cached]
    for attempt in range(_BATCH_RETRIES + 1):
        if not pending:
            break
        resolved, transient = _fetch_and_store(raw_con, kind, pending)
        fetched.update(resolved)
        if not transient or attempt == _BATCH_RETRIES:
            break
        time.sleep(_BATCH_BACKOFF * (attempt + 1))
        pending = transient

    return {i: (cached.get(i) if i in cached else fetched.get(i)) or None for i in ids}


def cached_urls(raw_con, kind: str, ids: list[str]) -> dict[str, str | None]:
    """Read-only batch cache lookup for inline cover URLs on the metric endpoints.

    Returns ``{spotify_id: url}`` for every requested id that has a cache row,
    with a genuine art-less id (stored as '') mapped to None. Never fetches from
    oEmbed and never writes — ids that aren't warmed yet are simply absent (the
    caller treats those as None). One query, no per-row lookups.
    """
    if kind not in _VALID_KINDS:
        return {}
    ids = [i for i in dict.fromkeys(ids) if i]
    if not ids:
        return {}
    placeholders = ",".join("?" * len(ids))
    try:
        rows = raw_con.execute(
            f"SELECT spotify_id, image_url FROM images "
            f"WHERE kind = ? AND spotify_id IN ({placeholders})",
            [kind, *ids],
        ).fetchall()
    except Exception:
        return {}  # images table not created yet (nothing warmed) → all null
    return {row[0]: (row[1] or None) for row in rows}


def _uncached_ids(raw_con, kind: str, ids: list[str]) -> list[str]:
    """Subset of ``ids`` with no row in the cache — i.e. still transient misses
    (a genuine art-less id is stored as '' and so counts as cached)."""
    if not ids:
        return []
    placeholders = ",".join("?" * len(ids))
    have = {
        row[0]
        for row in raw_con.execute(
            f"SELECT spotify_id FROM images WHERE kind = ? AND spotify_id IN ({placeholders})",
            [kind, *ids],
        ).fetchall()
    }
    return [i for i in ids if i not in have]


def prewarm_session_covers(raw_con, sets_by_kind: dict[str, list[str]]) -> dict:
    """Best-effort, off-request warm of the cover cache for the id sets the
    charts land on (top artists/tracks/albums).

    For each kind it calls :func:`get_or_fetch_many` and then retries only the
    transient misses (ids that came back None yet were never cached) across a few
    patient passes, so a burst that oEmbed rate-limits eventually fills in instead
    of staying blank. Genuine art-less ids are cached as '' on the first pass and
    never retried. Runs as a background job, so it stays off the request path.
    """
    _ensure_table(raw_con)
    summary: dict[str, dict] = {}
    for kind, raw_ids in sets_by_kind.items():
        if kind not in _VALID_KINDS:
            continue
        ids = [i for i in dict.fromkeys(raw_ids) if i]
        if not ids:
            continue
        remaining = ids
        for attempt in range(_PREWARM_PASSES):
            get_or_fetch_many(raw_con, kind, remaining)
            remaining = _uncached_ids(raw_con, kind, remaining)
            if not remaining or attempt == _PREWARM_PASSES - 1:
                break
            time.sleep(_PREWARM_BACKOFF)
        summary[kind] = {"requested": len(ids), "warmed": len(ids) - len(remaining)}
    return summary
