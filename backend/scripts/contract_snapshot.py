"""Snapshot every API response from a running Rewind server, or diff two snapshots.

Used during the v2 backend cleanup to prove the refactor keeps the API contract:
capture a baseline from the original backend, capture again from the new one,
and diff.

    # capture (uploads the given files into a fresh session first)
    uv run python scripts/contract_snapshot.py capture http://127.0.0.1:8001 out/old \
        ../data/samples/*.json
    # diff
    uv run python scripts/contract_snapshot.py diff out/old out/new

`image_url` values are ignored by the diff: covers are warmed in the background
from a live third-party service, so they legitimately differ run to run.
`{}` and `null` compare equal (v2 returns `null` for absent optional objects).
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

import httpx

YEAR_SCOPED = [
    "/api/metrics/rhythm",
    "/api/metrics/audio",
    "/api/metrics/taste",
    "/api/metrics/behavior",
    "/api/metrics/discovery",
    "/api/metrics/listening-life",
    "/api/metrics/over-time",
    "/api/metrics/evolution",
    "/api/metrics/sound-detail",
    "/api/metrics/deep-cuts",
    "/api/metrics/wrapped",
    "/api/metrics/artist-rank?limit=8",
    "/api/metrics/track-rank?limit=8",
    "/api/metrics/bar-race?entity=artist&limit=12",
    "/api/metrics/bar-race?entity=track&limit=12",
    "/api/metrics/bar-race?entity=album&limit=12",
]

STATIC = [
    "/api/metrics/total-time",
    "/api/metrics/top-artist",
    "/api/metrics/top-album",
    "/api/metrics/top-track",
    "/api/metrics/total-songs",
    "/api/metrics/active-day",
    "/api/metrics/heatmap",
    "/api/metrics/years",
]

CHARTS = [
    f"/api/metrics/chart?entity={e}&sort={s}&limit=100&range={r}"
    for e in ("artist", "track", "album", "genre")
    for s in ("minutes", "streams")
    for r in ("all", "6m")
] + [f"/api/metrics/superlatives?range={r}&limit=10" for r in ("all", "6m", "4w")]


def _with(path: str, key: str, value: str) -> str:
    return f"{path}{'&' if '?' in path else '?'}{key}={value}"


def _fname(path: str) -> str:
    return (
        path.replace("/api/metrics/", "").replace("?", "__").replace("&", "_").replace("=", "-")
        + ".json"
    )


def capture(base: str, out: Path, files: list[str]) -> None:
    out.mkdir(parents=True, exist_ok=True)
    ticket = str(uuid.uuid4())
    headers = {"X-Rewind-Session": ticket}
    with httpx.Client(base_url=base, headers=headers, timeout=600) as client:
        # Empty-session responses first (before any upload).
        empty = out / "_empty"
        empty.mkdir(exist_ok=True)
        for path in STATIC + YEAR_SCOPED[:2]:
            r = client.get(path)
            (empty / _fname(path)).write_text(
                json.dumps({"code": r.status_code, "body": r.json()}, indent=1, sort_keys=True)
            )

        upload = [
            ("files", (Path(f).name, Path(f).read_bytes(), "application/json")) for f in files
        ]
        r = client.post("/api/upload", files=upload)
        r.raise_for_status()
        print("upload:", {k: v for k, v in r.json().items() if k != "message"})

        years = [y["year"] for y in client.get("/api/metrics/years").json()["years"]]
        pick = years[len(years) // 2] if years else None
        paths = list(STATIC) + list(CHARTS)
        paths += [_with(p, "year", "all") for p in YEAR_SCOPED]
        if pick:
            paths += [_with(p, "year", str(pick)) for p in YEAR_SCOPED]
            paths += [f"/api/metrics/chart?entity=artist&sort=minutes&limit=100&range={pick}"]
            paths += [f"/api/metrics/heatmap?year={pick}"]
        for path in paths:
            r = client.get(path)
            (out / _fname(path)).write_text(
                json.dumps({"code": r.status_code, "body": r.json()}, indent=1, sort_keys=True)
            )
        print(f"captured {len(paths)} responses into {out}")


def _norm(v):
    if isinstance(v, dict):
        if not v:
            return None
        return {k: _norm(x) for k, x in v.items() if k != "image_url"}
    if isinstance(v, list):
        return [_norm(x) for x in v]
    return v


def _walk(a, b, path: str, out: list[str]) -> None:
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                out.append(f"{path}.{k}: added")
            elif k not in b:
                out.append(f"{path}.{k}: REMOVED")
            else:
                _walk(a[k], b[k], f"{path}.{k}", out)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f"{path}: len {len(a)} -> {len(b)}")
        for i, (x, y) in enumerate(zip(a, b, strict=False)):
            _walk(x, y, f"{path}[{i}]", out)
    elif a != b:
        out.append(f"{path}: {json.dumps(a)[:80]} -> {json.dumps(b)[:80]}")


def diff(old: Path, new: Path) -> int:
    changed = 0
    for f in sorted(old.rglob("*.json")):
        rel = f.relative_to(old)
        g = new / rel
        if not g.exists():
            print(f"MISSING in new: {rel}")
            changed += 1
            continue
        lines: list[str] = []
        _walk(_norm(json.loads(f.read_text())), _norm(json.loads(g.read_text())), "", lines)
        if lines:
            changed += 1
            print(f"== {rel} ({len(lines)} differences)")
            for line in lines[:15]:
                print("   ", line)
            if len(lines) > 15:
                print(f"    … {len(lines) - 15} more")
    print(f"{changed} file(s) differ")
    return 1 if changed else 0


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    if cmd == "capture":
        capture(args[0], Path(args[1]), args[2:])
    elif cmd == "diff":
        sys.exit(diff(Path(args[0]), Path(args[1])))
    else:
        sys.exit(__doc__)
