"""Per-session DuckDB storage.

Each browser holds a random ticket (``X-Rewind-Session``) that names its own DuckDB
file under ``settings.sessions_dir``. One root connection per ticket is kept in a
bounded LRU; every request gets its own cursor (DuckDB's thread-safe unit), so
handlers running in the threadpool never share a cursor.
"""

import asyncio
import logging
import re
import threading
import time
from collections import OrderedDict
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

import duckdb
from fastapi import FastAPI, HTTPException, Request

from app.config import settings

log = logging.getLogger(__name__)

Con = duckdb.DuckDBPyConnection

# The ticket names a file on disk, so it is a path-traversal sink: only a real
# UUID shape ever reaches the filesystem.
_TICKET_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)
SESSION_HEADER = "X-Rewind-Session"


def validate_ticket(ticket: str | None) -> str:
    if not ticket or not _TICKET_RE.fullmatch(ticket):
        raise HTTPException(status_code=400, detail="Missing or invalid session.")
    return ticket.lower()


def session_db_path(ticket: str) -> Path:
    """Validate the ticket and map it to its DuckDB file."""
    return Path(settings.sessions_dir) / f"{validate_ticket(ticket)}.duckdb"


class _ConnectionCache:
    """Thread-safe LRU of one root DuckDB connection per ticket.

    Evicted connections are simply dropped, not closed: a request may still hold a
    cursor on them, and DuckDB frees the database once the last cursor goes away.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._roots: OrderedDict[str, Con] = OrderedDict()

    def cursor(self, ticket: str) -> Con:
        path = session_db_path(ticket)
        ticket = path.stem
        with self._lock:
            root = self._roots.get(ticket)
            if root is None:
                path.parent.mkdir(parents=True, exist_ok=True)
                root = duckdb.connect(str(path))
                self._roots[ticket] = root
                while len(self._roots) > settings.engine_cache_max:
                    self._roots.popitem(last=False)
            else:
                self._roots.move_to_end(ticket)
            return root.cursor()

    def close(self, ticket: str) -> None:
        with self._lock:
            root = self._roots.pop(ticket, None)
        if root is not None:
            try:
                root.close()
            except duckdb.Error:
                log.warning("closing session %s failed", ticket, exc_info=True)

    def close_all(self) -> None:
        with self._lock:
            roots = list(self._roots.items())
            self._roots.clear()
        for ticket, root in roots:
            try:
                root.close()
            except duckdb.Error:
                log.warning("closing session %s failed", ticket, exc_info=True)


connections = _ConnectionCache()

# Per-session memo for values derived from history that are expensive to recompute
# on every request (e.g. the timezone offset). Cleared whenever history changes.
_memo: dict[tuple[str, str], object] = {}
_memo_lock = threading.Lock()


def memo_get(ticket: str, key: str) -> object | None:
    with _memo_lock:
        return _memo.get((ticket, key))


def memo_set(ticket: str, key: str, value: object) -> None:
    with _memo_lock:
        _memo[(ticket, key)] = value


def invalidate(ticket: str) -> None:
    """Forget memoized values after the session's history changed."""
    with _memo_lock:
        for k in [k for k in _memo if k[0] == ticket]:
            del _memo[k]


def ticket_of(con: Con) -> str | None:
    """The ticket whose file this connection is attached to (for memo keys)."""
    try:
        row = con.execute(
            "SELECT path FROM duckdb_databases() WHERE database_name = current_database()"
        ).fetchone()
    except duckdb.Error:
        return None
    return Path(row[0]).stem if row and row[0] else None


def delete_session(ticket: str) -> bool:
    """Close and delete a session's database. Returns True if a file was removed."""
    path = session_db_path(ticket)
    ticket = path.stem
    connections.close(ticket)
    invalidate(ticket)
    removed = False
    for p in (path, path.with_name(path.name + ".wal")):
        try:
            p.unlink()
            removed = True
        except FileNotFoundError:
            pass
    return removed


def scalar(con: Con, sql: str, params: list | None = None):
    """First column of the first row, or None when the query returns no rows."""
    row = con.execute(sql, params or []).fetchone()
    return row[0] if row else None


def has_table(con: Con, name: str) -> bool:
    return bool(
        con.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name = ?", [name]
        ).fetchone()
    )


def has_history(con: Con) -> bool:
    """True once the session has at least one real play."""
    if not has_table(con, "history"):
        return False
    return bool(con.execute("SELECT 1 FROM history WHERE ms_played > 0 LIMIT 1").fetchone())


def cleanup_stale_sessions() -> int:
    """Delete session files idle longer than the TTL. Returns how many were removed."""
    cutoff = time.time() - settings.session_ttl_hours * 3600
    removed = 0
    for path in Path(settings.sessions_dir).glob("*.duckdb"):
        try:
            if path.stat().st_mtime >= cutoff:
                continue
            if delete_session(path.stem):
                removed += 1
        except HTTPException:
            continue  # not a ticket-shaped file; leave it alone
        except OSError:
            log.warning("could not remove stale session %s", path, exc_info=True)
    return removed


async def _cleanup_loop() -> None:
    while True:
        await asyncio.sleep(settings.cleanup_interval_min * 60)
        removed = await asyncio.to_thread(cleanup_stale_sessions)
        if removed:
            log.info("removed %d stale session(s)", removed)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Run the TTL cleanup task; close every cached connection on shutdown."""
    task = asyncio.create_task(_cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        connections.close_all()


def get_con(request: Request) -> Iterator[Con]:
    """FastAPI dependency: a cursor on the caller's session database.

    Reading the session also refreshes its file mtime, so the TTL counts from the
    last visit rather than the last upload.
    """
    ticket = validate_ticket(request.headers.get(SESSION_HEADER))
    request.state.session_id = ticket
    con = connections.cursor(ticket)
    with suppress(OSError):
        session_db_path(ticket).touch(exist_ok=True)
    try:
        yield con
    finally:
        con.close()
