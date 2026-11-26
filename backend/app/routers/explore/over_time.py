"""Over time: per-year highlights, music age, time machine, nostalgia."""

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con
from app.routers.explore._common import artist_id_lookup, parse_year, period_label, year_clause
from app.schemas.explore import OverTime
from app.services.metrics import tz_offset_minutes

router = APIRouter()


@router.get("/api/metrics/over-time", response_model=OverTime)
async def get_over_time(year: str = "all", con: Con = Depends(get_con)):
    """Year-by-year highlights plus release-year context for the "Your Music,
    Over Time" chapter. Per-year top artist / top track / song-of-summer come
    from history; music age, oldest/newest tracks and the nostalgia trend need
    the enriched track_features slice and stay empty when unenriched.

    With a year selected the highlights narrow to that year and the nostalgia
    trend switches from year-by-year to month-by-month inside it.
    """
    yr = parse_year(year)

    def query():
        off = tz_offset_minutes(con)
        music = "WHERE track_uri LIKE 'spotify:track:%' AND ts IS NOT NULL" + year_clause(yr, off)

        # --- Per-year top artist (history only) ---
        try:
            artist_rows = con.execute(
                f"""
                SELECT year, artist_name FROM (
                    SELECT year, artist_name,
                           ROW_NUMBER() OVER (PARTITION BY year ORDER BY c DESC, artist_name) AS rn
                    FROM (
                        SELECT EXTRACT(year FROM ts + to_minutes({off}))::INTEGER AS year,
                               artist_name, COUNT(*) AS c
                        FROM history {music} AND artist_name IS NOT NULL
                        GROUP BY year, artist_name
                    )
                ) WHERE rn = 1
                """
            ).fetchall()
        except Exception:
            return None

        # --- Per-year top track / song of summer (history only) ---
        def top_tracks(summer_only):
            months = (
                f" AND EXTRACT(month FROM ts + to_minutes({off})) IN (6, 7, 8)"
                if summer_only
                else ""
            )
            return con.execute(
                f"""
                SELECT year, id, track_name, artist_name FROM (
                    SELECT year, id, track_name, artist_name,
                           ROW_NUMBER() OVER (PARTITION BY year ORDER BY c DESC, id) AS rn
                    FROM (
                        SELECT EXTRACT(year FROM ts + to_minutes({off}))::INTEGER AS year,
                               split_part(track_uri, ':', 3) AS id,
                               any_value(track_name) AS track_name,
                               any_value(artist_name) AS artist_name,
                               COUNT(*) AS c
                        FROM history {music} AND track_name IS NOT NULL{months}
                        GROUP BY year, id
                    )
                ) WHERE rn = 1
                """
            ).fetchall()

        try:
            track_rows = top_tracks(False)
            summer_rows = top_tracks(True)
        except Exception:
            track_rows = []
            summer_rows = []

        artist_by_year = {int(r[0]): r[1] for r in artist_rows}
        track_by_year = {int(r[0]): {"id": r[1], "name": r[2], "artist": r[3]} for r in track_rows}
        summer_by_year = {
            int(r[0]): {"id": r[1], "name": r[2], "artist": r[3]} for r in summer_rows
        }

        artist_id = artist_id_lookup(con)

        years = []
        for y in sorted(track_by_year):
            track = track_by_year[y]
            summer = summer_by_year.get(y) or track
            artist_name = artist_by_year.get(y)
            years.append(
                {
                    "year": y,
                    "top_artist": {"name": artist_name, "id": artist_id(artist_name)},
                    "top_track": {
                        "name": track["name"],
                        "artist": track["artist"],
                        "id": track["id"],
                    },
                    "summer_track": {
                        "name": summer["name"],
                        "artist": summer["artist"],
                        "id": summer["id"],
                    },
                }
            )

        if not years:
            return None

        join = (
            "FROM history h JOIN track_features f "
            "ON split_part(h.track_uri, ':', 3) = f.track_id "
            "WHERE h.track_uri LIKE 'spotify:track:%' AND h.ts IS NOT NULL "
            "AND f.release_year IS NOT NULL AND CAST(f.release_year AS INTEGER) > 1900"
            + year_clause(yr, off, "h.")
        )

        # --- Music age: fresh (<=1yr old when played) vs catalog + average year ---
        music_age = None
        try:
            row = con.execute(
                f"SELECT AVG((CAST(f.release_year AS INTEGER) >= "
                f"EXTRACT(year FROM h.ts + to_minutes({off})) - 1)::INTEGER), "
                f"AVG(CAST(f.release_year AS DOUBLE)) {join}"
            ).fetchone()
            if row and row[0] is not None:
                music_age = {
                    "fresh_share": round(float(row[0]), 3),
                    "avg_year": round(row[1]) if row[1] else None,
                }
        except Exception:
            music_age = None

        # --- Time machine: oldest & newest track played ---
        time_machine = None
        try:

            def extreme(order):
                r = con.execute(
                    f"SELECT split_part(h.track_uri, ':', 3) AS id, any_value(h.track_name), "
                    f"any_value(h.artist_name), CAST(any_value(f.release_year) AS INTEGER) AS year, "
                    f"COUNT(*) AS plays {join} AND h.track_name IS NOT NULL "
                    f"GROUP BY id ORDER BY year {order}, plays DESC, id LIMIT 1"
                ).fetchone()
                if not r:
                    return None
                return {"id": r[0], "name": r[1], "artist": r[2] or "", "year": int(r[3])}

            oldest = extreme("ASC")
            newest = extreme("DESC")
            if oldest or newest:
                time_machine = {"oldest": oldest, "newest": newest}
        except Exception:
            time_machine = None

        # --- Nostalgia: average release year of what you played, per period ---
        nostalgia = []
        try:
            part = "month" if yr is not None else "year"
            rows = con.execute(
                f"SELECT EXTRACT({part} FROM h.ts + to_minutes({off}))::INTEGER AS period, "
                f"AVG(CAST(f.release_year AS DOUBLE)) {join} GROUP BY period ORDER BY period"
            ).fetchall()
            nostalgia = [
                {"period": period_label(int(r[0]), yr), "avg_year": round(r[1])}
                for r in rows
                if r[1]
            ]
        except Exception:
            nostalgia = []

        return {
            "years": years,
            "music_age": music_age,
            "time_machine": time_machine,
            "nostalgia": nostalgia,
        }

    res = await run_in_threadpool(query)
    if not res:
        return {
            "status": "ok",
            "year": yr,
            "years": [],
            "music_age": None,
            "time_machine": None,
            "nostalgia": [],
        }
    return {"status": "ok", "year": yr, **res}
