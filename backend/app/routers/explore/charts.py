"""Charts page: numbered leaderboards and superlative records."""

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con
from app.routers.explore._common import attach_image_urls, distinct_years, year_clause
from app.schemas.explore import Chart, Superlatives
from app.services import covers
from app.services.covers import norm_artist_key
from app.services.metrics import tz_offset_minutes, umbrella_genre

router = APIRouter()

# ── Charts: numbered leaderboards ─────────────────────────────────────────────
_CHART_SPECS = {
    "artist": {
        "select": "artist_name AS name, NULL AS artist, NULL AS id",
        "group": "artist_name",
        "where": "artist_name IS NOT NULL",
    },
    "track": {
        "select": (
            "any_value(track_name) AS name, any_value(artist_name) AS artist, "
            "split_part(track_uri, ':', 3) AS id"
        ),
        "group": "split_part(track_uri, ':', 3)",
        "where": "track_uri LIKE 'spotify:track:%' AND track_name IS NOT NULL",
    },
    "album": {
        "select": "album_name AS name, artist_name AS artist, NULL AS id",
        "group": "album_name, artist_name",
        "where": "album_name IS NOT NULL",
    },
}


def _chart_range_clause(rng: str, off: int) -> str:
    """History WHERE fragment for a range. `off`/year are internal ints → safe to inline."""
    if rng == "all":
        return ""
    if rng == "4w":
        return " AND ts >= (SELECT max(ts) FROM history) - to_days(28)"
    if rng == "6m":
        return " AND ts >= (SELECT max(ts) FROM history) - to_months(6)"
    return year_clause(int(rng), off)


def _chart_rank_history(con, entity, order_col, clause, limit):
    spec = _CHART_SPECS[entity]
    limit_sql = f" LIMIT {int(limit)}" if limit else ""
    if entity == "artist":
        # Merge stylized name variants (e.g. "Giveon" / "GIVĒON") under a
        # diacritic-insensitive key; show the most-played spelling.
        rows = con.execute(
            "SELECT arg_max(name, vms) AS name, akey, "
            "SUM(vms) AS ms, SUM(vstreams) AS streams FROM ("
            "SELECT artist_name AS name, strip_accents(upper(trim(artist_name))) AS akey, "
            "SUM(ms_played) AS vms, COUNT(*) AS vstreams "
            f"FROM history WHERE artist_name IS NOT NULL{clause} GROUP BY name, akey) "
            f"GROUP BY akey ORDER BY {order_col} DESC, 1, 2{limit_sql}"
        ).fetchall()
        return [
            {
                "name": r[0],
                "key": r[1],
                "artist": None,
                "id": None,
                "ms": int(r[2] or 0),
                "streams": int(r[3]),
            }
            for r in rows
        ]

    rows = con.execute(
        f"SELECT {spec['select']}, SUM(ms_played) AS ms, COUNT(*) AS streams "
        f"FROM history WHERE {spec['where']}{clause} "
        f"GROUP BY {spec['group']} ORDER BY {order_col} DESC, 1, 2, 3{limit_sql}"
    ).fetchall()
    out = []
    for r in rows:
        item = {
            "name": r[0],
            "artist": r[1],
            "id": r[2],
            "ms": int(r[3] or 0),
            "streams": int(r[4]),
        }
        item["key"] = item["id"] if entity == "track" else (item["name"], item["artist"])
        out.append(item)
    return out


def _chart_rank_genre(con, order_col, clause):
    join = (
        "FROM history h JOIN track_features f "
        "ON split_part(h.track_uri, ':', 3) = f.track_id "
        "WHERE h.track_uri LIKE 'spotify:track:%' "
        "AND f.artist_genres IS NOT NULL AND f.artist_genres <> ''"
    )
    rows = con.execute(
        "SELECT lower(split_part(f.artist_genres, ',', 1)) AS g, "
        f"SUM(h.ms_played) AS ms, COUNT(*) AS streams {join}{clause} GROUP BY g"
    ).fetchall()
    buckets: dict = {}
    for raw, ms, streams in rows:
        label = umbrella_genre(raw)
        if not label:
            continue
        b = buckets.setdefault(label, [0, 0])
        b[0] += int(ms or 0)
        b[1] += int(streams or 0)
    idx = 0 if order_col == "ms" else 1
    ranked = sorted(buckets.items(), key=lambda kv: (-kv[1][idx], kv[0]))
    return [
        {"name": name, "key": name, "artist": None, "id": None, "ms": v[0], "streams": v[1]}
        for name, v in ranked
    ]


def _chart_attach_ids(con, entity, items):
    """Fill artist_id / album_id from track_features or fallback so covers can lazy-load."""
    if entity in ("track", "genre"):
        return
    try:
        if entity == "artist":
            covers.attach_artist_cover_refs(con, items, name_key="name")
        else:  # album
            covers.attach_album_cover_refs(con, items)
    except Exception:
        pass


@router.get("/api/metrics/chart", response_model=Chart)
async def get_chart(
    entity: str = "artist",
    sort: str = "minutes",
    limit: int = 100,
    rng: str = Query("all", alias="range"),
    con: Con = Depends(get_con),
):
    """Numbered Top-N leaderboard for artist / track / album / genre, ranked by
    minutes or streams, over all time / a year / the last 4 weeks / 6 months.
    Genres need the enriched track_features slice → empty items when unenriched.
    """
    entity = entity.lower()
    sort = sort.lower()
    if entity not in ("artist", "track", "album", "genre"):
        raise HTTPException(status_code=400, detail="Invalid entity for chart.")
    if sort not in ("minutes", "streams"):
        raise HTTPException(status_code=400, detail="Invalid sort for chart.")
    rng = rng.lower()
    if rng not in ("all", "4w", "6m") and not (rng.isdigit() and len(rng) == 4):
        raise HTTPException(status_code=400, detail="Invalid range for chart.")
    limit = max(1, min(int(limit), 200))
    order_col = "ms" if sort == "minutes" else "streams"

    def query():
        off = tz_offset_minutes(con)
        clause = _chart_range_clause(rng, off)

        try:
            if entity == "genre":
                main = _chart_rank_genre(con, order_col, clause)[:limit]
            else:
                main = _chart_rank_history(con, entity, order_col, clause, limit)
        except Exception:
            return None

        if not main:
            return {"items": [], "years": distinct_years(con, off)}

        _chart_attach_ids(con, entity, main)

        # Previous-period ranks power ▲▼ movement; only defined for a given year.
        prev_map = {}
        if rng.isdigit():
            try:
                prev_clause = _chart_range_clause(str(int(rng) - 1), off)
                prev = (
                    _chart_rank_genre(con, order_col, prev_clause)
                    if entity == "genre"
                    else _chart_rank_history(con, entity, order_col, prev_clause, 0)
                )
                for i, it in enumerate(prev, start=1):
                    prev_map[it["key"]] = i
            except Exception:
                prev_map = {}

        max_val = main[0][order_col] or 1
        items = []
        for i, it in enumerate(main, start=1):
            items.append(
                {
                    "rank": i,
                    "name": it["name"],
                    "artist": it["artist"],
                    "id": it["id"],
                    "cover_kind": it.get("cover_kind"),
                    "cover_id": it.get("cover_id"),
                    "minutes": round(it["ms"] / 60000, 2),
                    "streams": it["streams"],
                    "share": round(it[order_col] / max_val, 4),
                    "prev_rank": prev_map.get(it["key"]),
                }
            )
        attach_image_urls(con, entity, items)
        return {"items": items, "years": distinct_years(con, off)}

    res = await run_in_threadpool(query)
    base = {"status": "ok", "entity": entity, "sort": sort, "range": rng}
    if not res:
        return {**base, "items": [], "years": []}
    return {**base, **res}


# ── Superlatives: "Top-10 records" per year / all-time ────────────────────────
def _superlative_obsession(con, off, clause, limit):
    """Tracks ranked by the most plays crammed into a single day. Only ≥30s
    plays count, so a skipped auto-repeat can't masquerade as an obsession.
    """
    try:
        rows = con.execute(
            "SELECT arg_max(name, plays) AS name, arg_max(artist, plays) AS artist, id, "
            "max(plays) AS plays, "
            "arg_max(day, struct_pack(p := plays, d := -epoch(day::TIMESTAMP))) AS day FROM ("
            "SELECT split_part(track_uri, ':', 3) AS id, "
            "any_value(track_name) AS name, any_value(artist_name) AS artist, "
            f"CAST(ts + to_minutes({off}) AS DATE) AS day, COUNT(*) AS plays "
            "FROM history WHERE track_uri LIKE 'spotify:track:%' AND track_name IS NOT NULL "
            f"AND ts IS NOT NULL AND ms_played >= 30000{clause} GROUP BY id, day) "
            f"GROUP BY id ORDER BY plays DESC, name, id LIMIT {int(limit)}"
        ).fetchall()
    except Exception:
        return []
    return [
        {"rank": i, "name": r[0], "artist": r[1], "id": r[2], "count": int(r[3]), "date": str(r[4])}
        for i, r in enumerate(rows, start=1)
    ]


def _superlative_binges(con, off, clause, limit):
    """Longest single-sitting sessions (a >30-min gap starts a new session),
    with the artist you leaned on most and their share of the session.
    """
    try:
        rows = con.execute(
            "WITH o AS ("
            "  SELECT ts, artist_name, LAG(ts) OVER (ORDER BY ts) AS prev "
            "  FROM history WHERE ts IS NOT NULL AND track_uri LIKE 'spotify:track:%'"
            + clause
            + "), m AS ("
            "  SELECT ts, artist_name, "
            "         CASE WHEN prev IS NULL OR date_diff('minute', prev, ts) > 30 THEN 1 ELSE 0 END AS ns "
            "  FROM o"
            "), s AS ("
            "  SELECT ts, artist_name, SUM(ns) OVER (ORDER BY ts) AS sid FROM m"
            "), ac AS ("
            "  SELECT sid, artist_name, COUNT(*) AS c FROM s GROUP BY sid, artist_name"
            "), top AS ("
            "  SELECT sid, arg_max(artist_name, c) AS top_artist, MAX(c) AS top_count FROM ac GROUP BY sid"
            "), sess AS ("
            "  SELECT sid, date_diff('minute', MIN(ts), MAX(ts)) AS dur, "
            f"         CAST(MIN(ts) + to_minutes({off}) AS DATE) AS day, COUNT(*) AS plays "
            "  FROM s GROUP BY sid"
            ") SELECT sess.dur, sess.day, sess.plays, top.top_artist, top.top_count "
            "FROM sess JOIN top USING (sid) WHERE sess.dur >= 20 "
            f"ORDER BY sess.dur DESC, sess.day LIMIT {int(limit)}"
        ).fetchall()
    except Exception:
        return []
    items = [
        {
            "rank": i,
            "name": r[3],
            "minutes": int(r[0]),
            "date": str(r[1]),
            "plays": int(r[2]),
            "artist_pct": round(r[4] / r[2] * 100) if r[2] else 0,
        }
        for i, r in enumerate(rows, start=1)
    ]
    _attach_binge_artist_ids(con, items)
    return items


def _attach_binge_artist_ids(con, items):
    """Set each binge's `id` to its artist photo id, matched by the artist NAME
    shown (accent-insensitive), so the cover always matches the label. A binge
    is an artist's session, so we show the artist — not a track cover. Stays
    None when unenriched or the artist isn't in the catalog.
    """
    for it in items:
        it["id"] = None
    if not items:
        return
    try:
        id_map = {
            r[0]: r[1]
            for r in con.execute(
                "SELECT strip_accents(upper(trim(artist_name))) AS akey, arg_max(artist_id, c) "
                "FROM (SELECT artist_name, artist_id, COUNT(*) AS c FROM track_features "
                "WHERE artist_id IS NOT NULL GROUP BY artist_name, artist_id) GROUP BY akey"
            ).fetchall()
        }
    except Exception:
        return
    for it in items:
        it["id"] = id_map.get(norm_artist_key(it.get("name")))


def _skip_stats(con, clause):
    """Per-track play + explicit-skip (reason_end='fwdbtn') counts."""
    try:
        return con.execute(
            "SELECT split_part(track_uri, ':', 3) AS id, any_value(track_name) AS name, "
            "any_value(artist_name) AS artist, COUNT(*) AS plays, "
            "SUM(CASE WHEN reason_end = 'fwdbtn' THEN 1 ELSE 0 END) AS skips "
            "FROM history WHERE track_uri LIKE 'spotify:track:%' AND track_name IS NOT NULL"
            + clause
            + " GROUP BY id"
        ).fetchall()
    except Exception:
        return []


def _superlative_most_skipped(skip_rows, limit):
    """Tracks you press next on most, ranked by skip rate (min 5 plays)."""
    cand = [r for r in skip_rows if r[3] >= 5 and r[4] >= 1]
    cand.sort(key=lambda r: (-r[4] / r[3], -r[3], r[1] or "", r[0]))
    return [
        {
            "rank": i,
            "name": r[1],
            "artist": r[2],
            "id": r[0],
            "plays": int(r[3]),
            "skip_pct": round(r[4] / r[3] * 100),
        }
        for i, r in enumerate(cand[:limit], start=1)
    ]


def _superlative_never_skipped(skip_rows, limit):
    """Most-played tracks you never once skipped (min 10 plays, 0 skips)."""
    cand = [r for r in skip_rows if r[3] >= 10 and r[4] == 0]
    cand.sort(key=lambda r: (-r[3], r[1] or "", r[0]))
    return [
        {"rank": i, "name": r[1], "artist": r[2], "id": r[0], "plays": int(r[3])}
        for i, r in enumerate(cand[:limit], start=1)
    ]


@router.get("/api/metrics/superlatives", response_model=Superlatives)
async def get_superlatives(
    rng: str = Query("all", alias="range"),
    limit: int = 10,
    con: Con = Depends(get_con),
):
    """History-only "records" for the Charts superlatives section, viewable
    per year or all-time: obsession, binges, most/never skipped."""
    rng = rng.lower()
    if rng not in ("all", "4w", "6m") and not (rng.isdigit() and len(rng) == 4):
        raise HTTPException(status_code=400, detail="Invalid range for superlatives.")
    limit = max(1, min(int(limit), 50))

    def query():
        off = tz_offset_minutes(con)
        clause = _chart_range_clause(rng, off)
        skip_rows = _skip_stats(con, clause)
        return {
            "obsession": _superlative_obsession(con, off, clause, limit),
            "binges": _superlative_binges(con, off, clause, limit),
            "most_skipped": _superlative_most_skipped(skip_rows, limit),
            "never_skipped": _superlative_never_skipped(skip_rows, limit),
            "years": distinct_years(con, off),
        }

    res = await run_in_threadpool(query)
    return {"status": "ok", "range": rng, **res}
