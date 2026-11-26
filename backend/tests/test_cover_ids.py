"""A song released under several Spotify ids must resolve to the one played most.

Regression: the bar race / rank climb / top-track card took MAX(track_uri),
an arbitrary release (often one with no cover art), while the charts used the
id actually played — so the same song showed art in one view and not another.
"""

import functools
import json

from fastapi.testclient import TestClient as _TestClient

from app.main import app
from tests.conftest import TEST_TICKET

TestClient = functools.partial(_TestClient, headers={"X-Rewind-Session": TEST_TICKET})

PLAYED_MOST = "4iZ4pt7kvcaH6Yo8UoZ4s2"  # sorts lower than OTHER — MAX() would pick OTHER
OTHER = "75on2JOaUTVhYyCKrNNClY"


def _play(ts: str, uri_id: str, track="Snooze", artist="SZA") -> dict:
    return {
        "ts": ts,
        "ms_played": 200_000,
        "conn_country": "US",
        "master_metadata_track_name": track,
        "master_metadata_album_artist_name": artist,
        "master_metadata_album_album_name": "SOS",
        "spotify_track_uri": f"spotify:track:{uri_id}",
        "reason_end": "trackdone",
        "shuffle": False,
        "skipped": False,
    }


def test_same_song_under_two_ids_uses_the_most_played(tmp_path):
    plays = [
        _play(f"2024-0{m}-0{d}T12:00:00Z", PLAYED_MOST) for m in range(1, 4) for d in range(1, 6)
    ]
    plays += [_play("2024-02-10T12:00:00Z", OTHER), _play("2024-03-10T12:00:00Z", OTHER)]
    plays += [_play("2024-01-02T13:00:00Z", "1" * 22, track="Other Song", artist="Someone")]
    f = tmp_path / "h.json"
    f.write_text(json.dumps(plays))
    with TestClient(app) as client, open(f, "rb") as fh:
        assert (
            client.post(
                "/api/upload", files={"file": ("h.json", fh, "application/json")}
            ).status_code
            == 200
        )

        race = client.get("/api/metrics/bar-race?entity=track&limit=12").json()["data"]
        snooze = next(r for r in race if r["name"] == "Snooze")
        assert snooze["id"] == PLAYED_MOST

        rank = client.get("/api/metrics/track-rank?limit=8").json()["data"]
        assert next(r for r in rank if r["track_name"] == "Snooze")["id"] == PLAYED_MOST

        top = client.get("/api/metrics/top-track").json()
        assert top["track_name"] == "Snooze" and top["track_id"] == PLAYED_MOST

        chart = client.get("/api/metrics/chart?entity=track&limit=10").json()["items"]
        assert chart[0]["id"] == PLAYED_MOST  # all views agree
