"""Evolution: genre shares, mood and mainstream trends, day vs night."""

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con
from app.routers.explore._common import (
    ADJUSTED_ENERGY,
    FEATURES_JOIN,
    parse_year,
    period_label,
    year_clause,
)
from app.schemas.explore import Evolution
from app.services.metrics import tz_offset_minutes, umbrella_genre

router = APIRouter()


@router.get("/api/metrics/evolution", response_model=Evolution)
async def get_evolution(year: str = "all", con: Con = Depends(get_con)):
    """Taste-shift trends for the "How Your Taste Changes" chapter, from the
    enriched track_features slice: genre mix per year, average positivity and
    popularity per year, and a morning-vs-late-night energy compare. Empty when
    unenriched → the frontend keeps its sample fallback.

    With a year selected every trend switches from year-by-year to month-by-month
    inside that year; the response shape is unchanged (periods stay strings).
    """
    yr = parse_year(year)

    # Same primary-genre energy de-inflation the audio chapter uses, so the
    # day-vs-night words read on the corrected scale.

    def query():
        off = tz_offset_minutes(con)
        join = FEATURES_JOIN + year_clause(yr, off, "h.")
        part = "month" if yr is not None else "year"
        year_expr = f"EXTRACT({part} FROM h.ts + to_minutes({off}))::INTEGER"

        # --- Genre mix per period (raw primary genre, folded to umbrellas here) ---
        try:
            rows = con.execute(
                f"SELECT {year_expr} AS year, "
                "lower(split_part(f.artist_genres, ',', 1)) AS g, COUNT(*) AS plays "
                + join
                + " AND f.artist_genres IS NOT NULL AND f.artist_genres <> '' "
                "GROUP BY year, g"
            ).fetchall()
        except Exception:
            return None
        if not rows:
            return None

        per_year: dict[int, dict[str, int]] = {}
        totals: dict[str, int] = {}
        for year, raw, plays in rows:
            label = umbrella_genre(raw)
            if not label:
                continue
            y = int(year)
            per_year.setdefault(y, {})
            per_year[y][label] = per_year[y].get(label, 0) + int(plays)
            totals[label] = totals.get(label, 0) + int(plays)
        if not per_year:
            return None

        periods = sorted(per_year)
        top = [name for name, _ in sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:5]]
        top_set = set(top)
        year_totals = {y: sum(per_year[y].values()) for y in periods}

        genres = []
        for name in top:
            genres.append(
                {
                    "name": name,
                    "shares": [
                        round(per_year[y].get(name, 0) / year_totals[y], 4)
                        if year_totals[y]
                        else 0.0
                        for y in periods
                    ],
                }
            )
        # Fold everything outside the top 5 into a single "Other" band.
        other_shares = []
        has_other = False
        for y in periods:
            other = sum(p for g, p in per_year[y].items() if g not in top_set)
            if other:
                has_other = True
            other_shares.append(round(other / year_totals[y], 4) if year_totals[y] else 0.0)
        if has_other:
            genres.append({"name": "Other", "shares": other_shares})

        genre_evolution = {
            "periods": [period_label(y, yr) for y in periods],
            "genres": genres,
        }

        # --- Mood (avg positivity) & mainstream (avg popularity) per period ---
        def yearly(expr, cond):
            try:
                return con.execute(
                    f"SELECT {year_expr} AS year, AVG({expr}) {join} AND {cond} "
                    "GROUP BY year ORDER BY year"
                ).fetchall()
            except Exception:
                return []

        mood_trend = [
            {"period": period_label(int(r[0]), yr), "valence": round(float(r[1]), 3)}
            for r in yearly("f.valence", "f.valence IS NOT NULL")
            if r[1] is not None
        ]
        mainstream_trend = [
            {"period": period_label(int(r[0]), yr), "popularity": round(float(r[1]), 3)}
            for r in yearly("f.popularity", "f.popularity IS NOT NULL")
            if r[1] is not None
        ]

        # --- Day vs night energy (5-11am vs 9pm-3am), genre-corrected ---
        def bucket_energy(hours_sql):
            try:
                row = con.execute(
                    f"SELECT AVG({ADJUSTED_ENERGY}) {join} AND f.energy IS NOT NULL "
                    f"AND EXTRACT(hour FROM h.ts + to_minutes({off})) IN ({hours_sql})"
                ).fetchone()
            except Exception:
                return None
            return round(float(row[0]), 3) if row and row[0] is not None else None

        morning = bucket_energy("5, 6, 7, 8, 9, 10, 11")
        night = bucket_energy("21, 22, 23, 0, 1, 2, 3")
        day_night: dict[str, dict[str, float]] = {}
        if morning is not None:
            day_night["morning"] = {"energy": morning}
        if night is not None:
            day_night["night"] = {"energy": night}

        return {
            "genre_evolution": genre_evolution,
            "mood_trend": mood_trend,
            "day_night": day_night or None,
            "mainstream_trend": mainstream_trend,
        }

    res = await run_in_threadpool(query)
    if not res:
        return {
            "status": "ok",
            "year": yr,
            "genre_evolution": {"periods": [], "genres": []},
            "mood_trend": [],
            "day_night": None,
            "mainstream_trend": [],
        }
    return {"status": "ok", "year": yr, **res}
