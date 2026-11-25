"""Deterministic synthetic Spotify Extended Streaming History exports.

The tests used to read real personal exports from ``data/`` (gitignored, so they
broke on every fresh clone). This generator produces the same *kinds* of patterns
the metrics care about, reproducibly:

- several years of plays, with summer months and New Year's Eve edges
- a Zipf-ish favourite skew (clear top artist / album / track)
- explicit skips (``reason_end='fwdbtn'``), finishes, partial listens, shuffle
- back-to-back repeats (loops), long binges, multi-session days
- tracks that return after a >60-day gap (rediscoveries), rising artists
- accent/case variants of one artist ("Giveon" / "GIVĒON") and a CJK name
- podcast episodes (no track fields) and zero-length plays
"""

import hashlib
import json
import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

_B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def spotify_id(seed: str) -> str:
    """A stable, realistic-looking 22-char base62 Spotify id for ``seed``."""
    n = int.from_bytes(hashlib.sha256(seed.encode()).digest(), "big")
    out = []
    for _ in range(22):
        n, r = divmod(n, 62)
        out.append(_B62[r])
    return "".join(out)


@dataclass(frozen=True)
class Track:
    id: str
    name: str
    artist: str
    album: str
    duration_ms: int


_ARTISTS = [
    "Giveon",
    "The Weeknd",
    "SZA",
    "Drake",
    "Beyoncé",
    "Frank Ocean",
    "Tems",
    "Burna Boy",
    "Wizkid",
    "Daniel Caesar",
    "Kendrick Lamar",
    "Rema",
    "Ayra Starr",
    "Mahmoud Ahmed",
    "宇多田ヒカル",
    "Billie Eilish",
    "Tyler, The Creator",
    "Lana Del Rey",
    "Brent Faiyaz",
    "Steve Lacy",
    "Childish Gambino",
    "Asake",
    "Omah Lay",
    "Jorja Smith",
]

# The export spells some artists differently across tracks; the app merges them.
_VARIANTS = {"Giveon": "GIVĒON"}


def _catalog(rng: random.Random) -> list[Track]:
    tracks = []
    for a_idx, artist in enumerate(_ARTISTS):
        for album_no in range(2):
            album = f"{artist} Album {album_no + 1}"
            for t in range(5):
                name = f"{artist} Song {album_no * 5 + t + 1}"
                credited = (
                    _VARIANTS.get(artist, artist)
                    if (album_no == 1 and artist in _VARIANTS)
                    else artist
                )
                tracks.append(
                    Track(
                        id=spotify_id(f"{artist}/{album}/{name}"),
                        name=name,
                        artist=credited,
                        album=album,
                        duration_ms=rng.randint(150_000, 260_000) + a_idx * 100,
                    )
                )
    return tracks


def _weights(n: int) -> list[float]:
    return [1 / (i + 1) ** 0.9 for i in range(n)]


def generate_history(
    start: datetime, end: datetime, seed: int, density: float = 0.55
) -> list[dict]:
    """Plays between ``start`` and ``end`` (UTC), deterministic for a given seed."""
    rng = random.Random(seed)
    tracks = _catalog(random.Random(1234))  # same catalog for every export
    by_artist: dict[str, list[Track]] = {}
    for t in tracks:
        by_artist.setdefault(t.artist.replace("GIVĒON", "Giveon"), []).append(t)
    artists = list(by_artist)
    artist_w = _weights(len(artists))
    plays: list[dict] = []

    day = start
    span_days = max(1, (end - start).days)
    while day < end:
        progress = (day - start).days / span_days
        if rng.random() < density:
            # One rising artist gets heavier toward the end of every export.
            weights = list(artist_w)
            weights[11] *= 1 + 6 * progress
            for _session in range(rng.choice((1, 1, 2, 3))):
                ts = day + timedelta(
                    hours=rng.choice((7, 9, 13, 18, 21, 23)), minutes=rng.randint(0, 59)
                )
                shuffle = rng.random() < 0.5
                prev: Track | None = None
                for _ in range(rng.randint(4, 22)):
                    if prev and rng.random() < 0.08:
                        track = prev  # loop: same track back-to-back
                    else:
                        artist = rng.choices(artists, weights)[0]
                        pool = by_artist[artist]
                        track = rng.choices(pool, _weights(len(pool)))[0]
                    roll = rng.random()
                    if roll < 0.18:
                        reason_end, ms = "fwdbtn", rng.randint(2_000, 25_000)
                    elif roll < 0.26:
                        reason_end, ms = "endplay", rng.randint(31_000, track.duration_ms - 5_000)
                    else:
                        reason_end, ms = "trackdone", track.duration_ms
                    plays.append(_row(ts, track, ms, reason_end, shuffle))
                    ts += timedelta(milliseconds=ms + rng.randint(500, 4_000))
                    prev = track
                if rng.random() < 0.1:  # a podcast episode now and then
                    plays.append(_episode(ts, rng))
        day += timedelta(days=1)

    plays.append(
        _row(start + timedelta(hours=1), tracks[0], 0, "fwdbtn", False)
    )  # zero-length play
    plays.sort(key=lambda p: p["ts"])
    return plays


def _row(ts: datetime, t: Track, ms: int, reason_end: str, shuffle: bool) -> dict:
    return {
        "ts": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platform": "android",
        "ms_played": ms,
        "conn_country": "US",
        "ip_addr": "0.0.0.0",
        "master_metadata_track_name": t.name,
        "master_metadata_album_artist_name": t.artist,
        "master_metadata_album_album_name": t.album,
        "spotify_track_uri": f"spotify:track:{t.id}",
        "episode_name": None,
        "episode_show_name": None,
        "spotify_episode_uri": None,
        "reason_start": "trackdone",
        "reason_end": reason_end,
        "shuffle": shuffle,
        "skipped": reason_end == "fwdbtn",
        "offline": False,
        "offline_timestamp": None,
        "incognito_mode": False,
    }


def _episode(ts: datetime, rng: random.Random) -> dict:
    n = rng.randint(1, 40)
    return {
        "ts": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platform": "android",
        "ms_played": rng.randint(60_000, 1_800_000),
        "conn_country": "US",
        "master_metadata_track_name": None,
        "master_metadata_album_artist_name": None,
        "master_metadata_album_album_name": None,
        "spotify_track_uri": None,
        "episode_name": f"Episode {n}",
        "episode_show_name": "A Podcast",
        "spotify_episode_uri": f"spotify:episode:{spotify_id(str(n))}",
        "reason_start": "clickrow",
        "reason_end": "endplay",
        "shuffle": False,
        "skipped": False,
        "offline": False,
        "offline_timestamp": None,
        "incognito_mode": False,
    }


def _utc(y: int, m: int, d: int) -> datetime:
    return datetime(y, m, d, tzinfo=UTC)


# Two exports, mirroring how Spotify splits a real one: a short recent file and a
# long multi-year file. Both overlap 2025, like the real data the tests grew up on.
SMALL = ("Streaming_History_Audio_2025_1.json", _utc(2025, 1, 1), _utc(2025, 4, 1), 11)
MULTI = ("Streaming_History_Audio_2022-2025_0.json", _utc(2022, 1, 1), _utc(2025, 1, 1), 22)


def write_export(directory: Path, spec: tuple) -> tuple[Path, int]:
    name, start, end, seed = spec
    rows = generate_history(start, end, seed)
    path = directory / name
    path.write_text(json.dumps(rows))
    return path, len(rows)
