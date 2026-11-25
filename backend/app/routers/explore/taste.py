"""Your taste: genres, mainstream score, eras, hidden gems."""

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con, has_history
from app.routers.explore._common import FEATURES_JOIN, parse_year, year_clause
from app.schemas.explore import Taste
from app.services.catalog import catalog_available, ensure_track_features
from app.services.metrics import tz_offset_minutes, umbrella_genre

router = APIRouter()


@router.get("/api/metrics/taste", response_model=Taste)
async def get_taste(year: str = "all", con: Con = Depends(get_con)):
    """Genre / era / popularity profile for the "Your Taste" chapter, from the
    enriched track_features slice. Empty genres when unenriched → the frontend
    keeps its sample fallback.
    """
    yr = parse_year(year)

    def query():
        ensure_track_features(con)
        off = tz_offset_minutes(con)
        join = FEATURES_JOIN + year_clause(yr, off, "h.")

        # Primary genre → plays, then fold into umbrella buckets in Python.
        try:
            grows = con.execute(
                "SELECT lower(split_part(f.artist_genres, ',', 1)) AS g, COUNT(*) AS plays "
                + join
                + " AND f.artist_genres IS NOT NULL AND f.artist_genres <> '' "
                "GROUP BY g"
            ).fetchall()
        except Exception:
            return None

        buckets: dict[str, int] = {}
        for raw, plays in grows:
            label = umbrella_genre(raw)
            if label:
                buckets[label] = buckets.get(label, 0) + int(plays)
        if not buckets:
            return None
        ranked = sorted(buckets.items(), key=lambda kv: kv[1], reverse=True)
        total_genre_plays = sum(buckets.values()) or 1
        genres = [{"name": name, "plays": plays} for name, plays in ranked[:6]]
        # Count only genres with a real presence (>=1% of plays) so the diversity
        # word doesn't inflate on a long tail of one-off tags.
        distinct_genres = sum(1 for _, p in buckets.items() if p / total_genre_plays >= 0.01)

        try:
            mainstream = con.execute(
                "SELECT AVG(f.popularity) " + join + " AND f.popularity IS NOT NULL"
            ).fetchone()[0]
        except Exception:
            mainstream = None

        eras = []
        avg_year = None
        try:
            erows = con.execute(
                "SELECT CAST(floor(CAST(f.release_year AS INTEGER) / 10) * 10 AS INTEGER) AS decade, "
                "COUNT(*) AS plays "
                + join
                + " AND f.release_year IS NOT NULL AND CAST(f.release_year AS INTEGER) > 1900 "
                "GROUP BY decade ORDER BY decade"
            ).fetchall()
            eras = [{"decade": int(d), "plays": int(p)} for d, p in erows]
            ay = con.execute(
                "SELECT AVG(CAST(f.release_year AS DOUBLE)) "
                + join
                + " AND f.release_year IS NOT NULL AND CAST(f.release_year AS INTEGER) > 1900"
            ).fetchone()[0]
            avg_year = round(ay) if ay else None
        except Exception:
            eras = []

        # Hidden gems = low global popularity but high personal plays.
        gems = []
        try:
            gemrows = con.execute(
                "SELECT f.track_id, any_value(h.track_name), any_value(h.artist_name), COUNT(*) AS plays "
                + join
                + " AND f.popularity IS NOT NULL AND f.popularity < 0.4 "
                "AND h.track_name IS NOT NULL "
                "GROUP BY f.track_id HAVING COUNT(*) >= 5 ORDER BY plays DESC, f.track_id LIMIT 4"
            ).fetchall()
            gems = [
                {"name": r[1], "artist": r[2] or "", "plays": int(r[3]), "id": r[0]}
                for r in gemrows
            ]
        except Exception:
            gems = []

        return {
            "genres": genres,
            "mainstream": round(mainstream, 3) if mainstream is not None else None,
            "distinct_genres": distinct_genres,
            "eras": eras,
            "avg_year": avg_year,
            "gems": gems,
        }

    res = await run_in_threadpool(query)
    if not res:
        history_exists = await run_in_threadpool(has_history, con)
        return {
            "status": "ok",
            "year": yr,
            "genres": [],
            "mainstream": None,
            "distinct_genres": 0,
            "eras": [],
            "avg_year": None,
            "gems": [],
            "catalog_missing": not catalog_available(),
            "has_history": history_exists,
        }
    return {"status": "ok", "year": yr, **res}
