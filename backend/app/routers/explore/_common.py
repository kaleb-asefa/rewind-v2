"""Shared helpers for the Explore + Charts endpoints: the year filter, reusable SQL
fragments, canonical artist grouping and inline cover URLs.

Safety rule for everything here: values inlined into SQL are either internal
literals or validated ints (``year``, ``off``). User text never reaches an f-string.
"""

from typing import Any

from fastapi import HTTPException

from app.db import Con
from app.services import covers, images
from app.services.metrics import ENERGY_LOUDNESS_ADJ, MONTH_ABBR

# ── Reusable SQL fragments ────────────────────────────────────────────────────

# Music plays joined to their catalog features. Callers append `AND …` filters.
FEATURES_JOIN = (
    "FROM history h JOIN track_features f "
    "ON split_part(h.track_uri, ':', 3) = f.track_id "
    "WHERE h.track_uri LIKE 'spotify:track:%'"
)

# Spotify's energy is partly a loudness proxy; de-inflate it for the most
# compressed genres, keyed on the PRIMARY artist genre (see metrics.ENERGY_LOUDNESS_ADJ).
ADJUSTED_ENERGY = (
    "CASE WHEN "
    "lower(split_part(f.artist_genres, ',', 1)) LIKE '%r&b%' "
    "OR lower(split_part(f.artist_genres, ',', 1)) LIKE '%soul%' "
    "OR lower(split_part(f.artist_genres, ',', 1)) LIKE '%hip hop%' "
    "OR lower(split_part(f.artist_genres, ',', 1)) LIKE '%rap%' "
    "OR lower(split_part(f.artist_genres, ',', 1)) LIKE '%trap%' "
    f"THEN greatest(0, f.energy - {ENERGY_LOUDNESS_ADJ}) "
    "ELSE f.energy END"
)


def local_ts(off: int, alias: str = "") -> str:
    """``ts`` shifted from UTC to the listener's wall clock (``off`` minutes)."""
    return f"({alias}ts + to_minutes({int(off)}))"


# ── Year filter ───────────────────────────────────────────────────────────────


def parse_year(year: str | None) -> int | None:
    """``'all'`` (the default) → ``None`` = every play ever; a 4-digit year → int.

    Anything else is a 400. This whitelist is the *only* reason the value is safe
    to inline into SQL further down, so never widen it to free text.
    """
    value = (year or "all").strip().lower()
    if value == "all":
        return None
    if not (value.isdigit() and len(value) == 4):
        raise HTTPException(status_code=400, detail="Invalid year filter.")
    return int(value)


def year_clause(year: int | None, off: int, alias: str = "") -> str:
    """`` AND EXTRACT(year FROM local ts) = YYYY`` fragment, or ``''`` for all time.

    Year boundaries use the listener's local time, so a play at 23:00 on New
    Year's Eve lands in the year they lived it. ``alias`` is the table prefix for
    joined queries (e.g. ``"h."``).
    """
    if year is None:
        return ""
    return f" AND EXTRACT(year FROM {local_ts(off, alias)}) = {int(year)}"


def year_where(clause: str) -> str:
    """A year clause promoted to a standalone WHERE (empty when unfiltered)."""
    return " WHERE" + clause[len(" AND") :] if clause else ""


def period_label(value: int, year: int | None) -> str:
    """Trend x-axis label: the year when unfiltered, the month inside one year."""
    if year is None:
        return str(value)
    return MONTH_ABBR[value - 1] if 1 <= value <= 12 else str(value)


def distinct_years(con: Con, off: int) -> list[int]:
    """Years this session has plays in (local time), newest first. ``[]`` before
    any upload."""
    try:
        rows = con.execute(
            f"SELECT DISTINCT EXTRACT(year FROM {local_ts(off)})::INTEGER AS y "
            "FROM history WHERE ts IS NOT NULL ORDER BY y DESC"
        ).fetchall()
    except Exception:
        return []
    return [int(r[0]) for r in rows]


# ── Canonical artists & covers ────────────────────────────────────────────────


def canonical_artist_rows(
    con: Con, period_trunc: str, year: int | None = None, off: int = 0
) -> list[tuple]:
    """Per-period ``(period, display_name, ms, streams)`` rows with accent/case
    artist-name variants merged (Spotify exports the same artist under multiple
    spellings, e.g. 'GIVĒON' vs 'Giveon'). Grouped by a diacritic-insensitive
    key; the display name is the most-played spelling, kept identical across
    periods so the merge holds for every frame. ``period_trunc`` is an internal
    literal ('week' / 'month'), never user input. Periods are local-time.
    """
    assert period_trunc in ("week", "month")
    inner = year_clause(year, off)
    outer = year_clause(year, off, "h.")
    period = f"date_trunc('{period_trunc}', {local_ts(off, 'h.')})"
    return con.execute(
        f"""
        WITH disp AS (
            SELECT strip_accents(upper(trim(artist_name))) AS akey,
                   arg_max(artist_name, n) AS name
            FROM (
                SELECT artist_name, COUNT(*) AS n
                FROM history
                WHERE artist_name IS NOT NULL AND ts IS NOT NULL{inner}
                GROUP BY artist_name
            ) GROUP BY akey
        )
        SELECT {period} AS period,
               disp.name AS artist_name,
               SUM(h.ms_played) AS ms,
               COUNT(*) AS streams
        FROM history h
        JOIN disp ON strip_accents(upper(trim(h.artist_name))) = disp.akey
        WHERE h.artist_name IS NOT NULL AND h.ts IS NOT NULL{outer}
        GROUP BY {period}, disp.name
        ORDER BY period ASC, ms DESC, streams DESC
        """
    ).fetchall()


def canonical_artist_id_map(con: Con) -> dict[str, str]:
    """``{canonical akey: artist_id}`` for cover lookups on merged artist names."""
    refs = covers.artist_cover_refs(con)
    return {akey: info[0] for akey, info in refs.items() if info[0]}


def track_id_map(con: Con) -> dict[tuple[str, str], str]:
    """``{(track_name, artist_name): spotify track id}`` from the history itself.

    A song often exists under several ids (single, album, deluxe re-release).
    Pick the one actually played most — the same id the charts use and the
    cover pre-warm fetched — never an arbitrary ``MAX()``, which could land on a
    release with no artwork. Ties break on the id, so the choice is stable.
    """
    try:
        rows = con.execute(
            "SELECT track_name, artist_name, "
            "arg_max(id, struct_pack(n := n, id := id)) FROM ("
            "  SELECT track_name, artist_name, split_part(track_uri, ':', 3) AS id, COUNT(*) AS n"
            "  FROM history WHERE track_uri LIKE 'spotify:track:%'"
            "  GROUP BY track_name, artist_name, id"
            ") GROUP BY track_name, artist_name"
        ).fetchall()
    except Exception:
        return {}
    return {(r[0], r[1]): r[2] for r in rows}


def artist_id_lookup(con: Con):
    """``name -> spotify artist id`` (or None), identity-based and accent-insensitive.

    Resolves through the tracks actually played (history → catalog), most-played
    id first — so 'Giveon' and 'GIVĒON' find the same photo, and a name shared
    by two catalog artists picks the one you listen to.
    """
    ids = canonical_artist_id_map(con)
    return lambda name: ids.get(covers.norm_artist_key(name)) if name else None


def attach_image_urls(con: Con, kind: str, items: list[dict[str, Any]]) -> None:
    """Add a read-only, cached ``image_url`` to each item carrying a Spotify
    ``id``. None when the id is missing, un-warmed, or a genuine art-less miss.
    One batch cache read per kind; never fetches oEmbed.

    An item may override the endpoint's ``kind`` via ``cover_kind``/``cover_id``
    — an album with no catalog id borrows one of its tracks, whose thumbnail is
    the same artwork (see :mod:`app.services.covers`).
    """
    by_kind: dict[str, list[str]] = {}
    for it in items:
        cover_id = it.get("cover_id") or it.get("id")
        if cover_id:
            by_kind.setdefault(it.get("cover_kind") or kind, []).append(cover_id)
    with images.cover_store() as store:
        url_maps = {k: images.cached_urls(store, k, ids) for k, ids in by_kind.items()}
    for it in items:
        cover_id = it.get("cover_id") or it.get("id")
        url_map = url_maps.get(it.get("cover_kind") or kind, {})
        it["image_url"] = url_map.get(cover_id) if cover_id else None
