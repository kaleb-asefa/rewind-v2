"""Shared test setup: isolated session storage, no catalog, no network.

Every test gets a fresh sessions dir and a fixed ticket. ``session_con()`` opens
a cursor on that ticket's database for tests that inspect or seed it directly.
"""

import contextlib
from collections.abc import Iterator
from pathlib import Path

import pytest

from app import db
from app.config import settings
from app.services import images
from tests.fixtures import MULTI, SMALL, write_export

TEST_TICKET = "00000000-0000-4000-8000-000000000000"


@pytest.fixture(scope="session")
def exports(tmp_path_factory) -> dict[str, tuple[Path, int]]:
    """The two synthetic exports, generated once per test run."""
    d = tmp_path_factory.mktemp("exports")
    return {"small": write_export(d, SMALL), "multi": write_export(d, MULTI)}


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "sessions_dir", tmp_path)
    # Default: no catalog, so uploads skip enrichment (fast). Catalog tests override.
    monkeypatch.setattr(settings, "catalog_path", tmp_path / "no_catalog.parquet")
    monkeypatch.setattr(settings, "tz_offset_hours", None)
    # Never touch the network: covers come from Spotify oEmbed over HTTP.
    monkeypatch.setattr(images, "_fetch_thumbnail", lambda kind, sid: None)
    db.connections.close_all()
    db._memo.clear()
    yield
    db.connections.close_all()
    db._memo.clear()


@contextlib.contextmanager
def session_con(ticket: str = TEST_TICKET) -> Iterator[db.Con]:
    """A cursor on a session's database (closed on exit)."""
    con = db.connections.cursor(ticket)
    try:
        yield con
    finally:
        con.close()
