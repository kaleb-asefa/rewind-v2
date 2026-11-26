"""The cover cache is shared by every session and backs off when Spotify rate-limits."""

import functools
import io
import urllib.error

from fastapi.testclient import TestClient as _TestClient

from app.main import app
from app.services import images

A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

# The real fetcher (conftest stubs it per test to keep tests offline).
REAL_FETCH = images._fetch_thumbnail


def client_for(ticket):
    return functools.partial(_TestClient, headers={"X-Rewind-Session": ticket})(app)


def test_a_cover_is_fetched_once_for_all_sessions(monkeypatch):
    calls: list[str] = []

    def fake_fetch(kind, sid):
        calls.append(sid)
        return f"https://img/{kind}/{sid}.jpg"

    monkeypatch.setattr(images, "_fetch_thumbnail", fake_fetch)
    with client_for(A) as a, client_for(B) as b:
        assert a.get("/api/images?kind=track&ids=T1,T2").json()["images"] == {
            "T1": "https://img/track/T1.jpg",
            "T2": "https://img/track/T2.jpg",
        }
        # A different guest (new upload = new ticket) reuses the cache.
        assert (
            b.get("/api/images?kind=track&ids=T1").json()["images"]["T1"]
            == "https://img/track/T1.jpg"
        )
    assert sorted(calls) == ["T1", "T2"]


def test_rate_limit_pauses_lookups_and_is_not_cached(monkeypatch):
    monkeypatch.setattr(images, "_BATCH_BACKOFF", 0)
    monkeypatch.setattr(images.settings, "covers_enabled", True)
    requests: list[str] = []

    def too_many(req, timeout):
        requests.append(req.full_url)
        raise urllib.error.HTTPError(
            req.full_url, 429, "Too Many Requests", {"Retry-After": "60"}, io.BytesIO()
        )

    monkeypatch.setattr(images.urllib.request, "urlopen", too_many)
    monkeypatch.setattr(images, "_fetch_thumbnail", REAL_FETCH)
    with client_for(A) as a:
        res = a.get("/api/images?kind=track&ids=X1,X2,X3").json()["images"]
        assert res == {"X1": None, "X2": None, "X3": None}
        first = len(requests)
        assert images.cooling_down()
        # While cooling down: no outbound requests at all, and nothing cached as a miss.
        a.get("/api/images?kind=track&ids=X1,X2,X3")
        assert len(requests) == first
    with images.cover_store() as store:
        assert store.execute("SELECT COUNT(*) FROM images").fetchone()[0] == 0


def test_unknown_id_is_a_cacheable_miss(monkeypatch):
    monkeypatch.setattr(images.settings, "covers_enabled", True)

    def not_found(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 404, "Not Found", {}, io.BytesIO())

    monkeypatch.setattr(images.urllib.request, "urlopen", not_found)
    monkeypatch.setattr(images, "_fetch_thumbnail", REAL_FETCH)
    with client_for(A) as a:
        assert a.get("/api/images?kind=track&ids=GONE").json()["images"] == {"GONE": None}
    with images.cover_store() as store:
        assert store.execute(
            "SELECT image_url FROM images WHERE spotify_id = 'GONE'"
        ).fetchone() == ("",)
