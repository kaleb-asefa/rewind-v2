"""Session lifecycle, health, security of file serving, and the typed contract."""

import functools

from fastapi.testclient import TestClient as _TestClient

from app.config import settings
from app.db import session_db_path
from app.main import app, create_app
from tests.conftest import TEST_TICKET

TestClient = functools.partial(_TestClient, headers={"X-Rewind-Session": TEST_TICKET})


def _upload(client, exports):
    path, _ = exports["small"]
    with open(path, "rb") as f:
        res = client.post("/api/upload", files={"file": (path.name, f, "application/json")})
    assert res.status_code == 200
    return res.json()


def test_health_needs_no_session():
    with _TestClient(app) as client:
        res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "catalog": False}


def test_delete_session_removes_data(exports):
    with TestClient(app) as client:
        _upload(client, exports)
        assert session_db_path(TEST_TICKET).exists()
        assert client.get("/api/metrics/total-time").json()["total_minutes"] > 0

        res = client.delete("/api/session")
        assert res.status_code == 200
        assert res.json() == {"status": "ok", "deleted": True}
        assert not session_db_path(TEST_TICKET).with_suffix(".duckdb.wal").exists()

        # The ticket now reads as a brand-new, empty session.
        assert client.get("/api/metrics/total-time").json()["total_minutes"] == 0


def test_delete_session_requires_valid_ticket():
    with _TestClient(app) as client:
        assert client.delete("/api/session").status_code == 400
        res = client.delete("/api/session", headers={"X-Rewind-Session": "../etc"})
        assert res.status_code == 400


def test_empty_session_overview_is_ok_not_400():
    """Before any upload every overview endpoint is an honest empty state."""
    with TestClient(app) as client:
        for path in (
            "total-time",
            "top-artist",
            "top-album",
            "top-track",
            "total-songs",
            "active-day",
            "heatmap",
            "years",
        ):
            res = client.get(f"/api/metrics/{path}")
            assert res.status_code == 200, path
            assert res.json()["status"] == "ok", path
        assert client.get("/api/metrics/top-artist").json()["artist_name"] is None


def test_repo_files_are_never_served():
    """v1 served any file under the repo root (incl. backend/.env and session
    databases). The API must not expose the filesystem at all."""
    with TestClient(app) as client:
        for path in (
            "/backend/.env",
            "/backend/app/main.py",
            "/.git/config",
            f"/data/sessions/{TEST_TICKET}.duckdb",
            "/index.html",
            "/src/js/api.js",
        ):
            assert client.get(path).status_code == 404, path


def test_frontend_dist_serves_spa_only(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>Rewind</title>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    (dist / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("nope")
    monkeypatch.setattr(settings, "frontend_dist", dist)
    spa = create_app()
    with _TestClient(spa) as client:
        assert "Rewind" in client.get("/").text
        assert "Rewind" in client.get("/explore").text  # client-side route
        assert client.get("/assets/app.js").text == "console.log(1)"
        assert client.get("/favicon.svg").status_code == 200
        assert "nope" not in client.get("/../secret.txt").text
        assert client.get("/api/nope").status_code == 404


def test_invalid_params_are_400_with_short_detail():
    with TestClient(app) as client:
        res = client.get("/api/metrics/bar-race?entity=bogus")
        assert res.status_code == 400
        assert res.json() == {"detail": "Invalid entity."}
        assert client.get("/api/metrics/artist-rank?limit=999").status_code == 400


def test_every_endpoint_has_a_typed_response():
    schema = app.openapi()
    for path, ops in schema["paths"].items():
        for method, op in ops.items():
            content = op["responses"]["200"]["content"]["application/json"]["schema"]
            assert "$ref" in content, f"{method.upper()} {path} has no response model"
