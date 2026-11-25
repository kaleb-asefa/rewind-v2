"""Your sound: audio-feature profile and the detail chapter (tempo, key, danceability)."""

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con, has_history
from app.routers.explore._common import ADJUSTED_ENERGY, FEATURES_JOIN, parse_year, year_clause
from app.schemas.explore import Audio, SoundDetail
from app.services.catalog import catalog_available, ensure_track_features
from app.services.metrics import tz_offset_minutes

router = APIRouter()


@router.get("/api/metrics/audio", response_model=Audio)
async def get_audio(
    year: str = "all",
    con: Con = Depends(get_con),
):
    """Audio-feature profile for the "Your Sound" chapter, from the enriched
    track_features slice: play-weighted average mood/energy/etc., per-track
    valence/energy for the mood map, and catalog coverage. Empty when the
    track_features slice is missing (unenriched session).
    """
    yr = parse_year(year)

    # De-inflate that loudness bias for the affected genres only, keyed on the
    # PRIMARY artist genre (a global shift would wrongly flatten real pop/latin/EDM).

    def query():
        ensure_track_features(con)
        off = tz_offset_minutes(con)
        join = FEATURES_JOIN + year_clause(yr, off, "h.")
        try:
            agg = con.execute(
                "SELECT AVG(" + ADJUSTED_ENERGY + "), AVG(f.valence), AVG(f.danceability), "
                "AVG(f.acousticness), AVG(f.instrumentalness), AVG(f.tempo), "
                # Same definition as /api/metrics/sound-detail's key.major_share —
                # both chapters show this number, so a NULL mode must be skipped
                # here too, not silently folded in as "minor".
                "AVG(CASE WHEN f.mode = 1 THEN 1.0 ELSE 0.0 END) "
                "FILTER (WHERE f.mode IS NOT NULL), COUNT(*) " + join
            ).fetchone()
        except Exception:
            return None
        if not agg or not agg[7]:
            return None
        energy, valence, dance, acoustic, instr, tempo, major, matched = agg

        try:
            trows = con.execute(
                "SELECT any_value(h.track_name), any_value(f.valence), any_value("
                + ADJUSTED_ENERGY
                + "), COUNT(*) AS plays "
                + join
                + " AND h.track_name IS NOT NULL "
                "AND f.valence IS NOT NULL AND f.energy IS NOT NULL "
                "GROUP BY f.track_id ORDER BY plays DESC, f.track_id LIMIT 24"
            ).fetchall()
        except Exception:
            trows = []

        try:
            total = con.execute(
                "SELECT COUNT(*) FROM history WHERE track_uri LIKE 'spotify:track:%'"
                + year_clause(yr, off)
            ).fetchone()[0]
        except Exception:
            total = 0

        return {
            "avg": {
                "energy": round(energy or 0, 3),
                "valence": round(valence or 0, 3),
                "danceability": round(dance or 0, 3),
                "acousticness": round(acoustic or 0, 3),
                "vocal": round(1 - (instr or 0), 3),
            },
            "tempo_avg": round(tempo or 0),
            "mode": {"major": round(major or 0, 3)},
            "tracks": [
                {
                    "name": r[0],
                    "valence": round(r[1], 3),
                    "energy": round(r[2], 3),
                    "plays": int(r[3]),
                }
                for r in trows
            ],
            "matched": int(matched),
            "total": int(total),
        }

    res = await run_in_threadpool(query)
    if not res:
        history_exists = await run_in_threadpool(has_history, con)
        return {
            "status": "ok",
            "year": yr,
            "avg": None,
            "tracks": [],
            "coverage": 0.0,
            "matched": 0,
            "total": 0,
            "catalog_missing": not catalog_available(),
            "has_history": history_exists,
        }
    total = res["total"]
    res["coverage"] = round(res["matched"] / total, 4) if total else 0.0
    return {"status": "ok", "year": yr, **res}


@router.get("/api/metrics/sound-detail", response_model=SoundDetail)
async def get_sound_detail(year: str = "all", con: Con = Depends(get_con)):
    """Audio-detail spread and standouts for "The Detail In Your Sound": tempo
    distribution, major/minor (bright vs moody) split, most danceable tracks, and
    a high-vs-low energy (workout vs wind-down) split. From the enriched
    track_features slice; empty when unenriched → the frontend keeps its sample.
    """
    yr = parse_year(year)

    def query():
        ensure_track_features(con)
        off = tz_offset_minutes(con)
        join = FEATURES_JOIN + year_clause(yr, off, "h.")

        # Tempo buckets (BPM → plain speed labels).
        try:
            row = con.execute(
                "SELECT "
                "COUNT(*) FILTER (WHERE f.tempo < 90), "
                "COUNT(*) FILTER (WHERE f.tempo >= 90 AND f.tempo < 110), "
                "COUNT(*) FILTER (WHERE f.tempo >= 110 AND f.tempo < 130), "
                "COUNT(*) FILTER (WHERE f.tempo >= 130 AND f.tempo < 150), "
                "COUNT(*) FILTER (WHERE f.tempo >= 150), "
                "COUNT(*) FILTER (WHERE f.tempo IS NOT NULL) " + join
            ).fetchone()
        except Exception:
            return None
        if not row or not row[5]:
            return None
        labels = ["Slow", "Relaxed", "Steady", "Upbeat", "Fast"]
        buckets = [{"label": labels[i], "plays": int(row[i] or 0)} for i in range(5)]

        # Major / minor (bright vs moody).
        major_share = None
        try:
            m = con.execute(
                "SELECT AVG(CASE WHEN f.mode = 1 THEN 1.0 ELSE 0.0 END) "
                + join
                + " AND f.mode IS NOT NULL"
            ).fetchone()[0]
            major_share = round(float(m), 3) if m is not None else None
        except Exception:
            major_share = None

        # Most danceable tracks the user actually plays.
        danceable = []
        try:
            drows = con.execute(
                "SELECT split_part(h.track_uri, ':', 3) AS id, any_value(h.track_name), "
                "any_value(h.artist_name), any_value(f.danceability) AS dnc, COUNT(*) AS plays "
                + join
                + " AND h.track_name IS NOT NULL AND f.danceability IS NOT NULL "
                "GROUP BY id HAVING COUNT(*) >= 5 ORDER BY dnc DESC, plays DESC, id LIMIT 4"
            ).fetchall()
            danceable = [
                {
                    "name": r[1],
                    "artist": r[2] or "",
                    "id": r[0],
                    "danceability": round(float(r[3]), 3),
                }
                for r in drows
            ]
        except Exception:
            danceable = []

        # Workout (above-midpoint energy) vs wind-down, genre-corrected.
        energy_split = None
        try:
            w = con.execute(
                f"SELECT AVG((({ADJUSTED_ENERGY}) >= 0.5)::INTEGER) "
                + join
                + " AND f.energy IS NOT NULL"
            ).fetchone()[0]
            if w is not None:
                workout = round(float(w), 3)
                energy_split = {"workout": workout, "wind_down": round(1 - workout, 3)}
        except Exception:
            energy_split = None

        return {
            "tempo": {"buckets": buckets},
            "key": {"major_share": major_share} if major_share is not None else None,
            "danceable": danceable,
            "energy_split": energy_split,
        }

    res = await run_in_threadpool(query)
    if not res:
        return {
            "status": "ok",
            "year": yr,
            "tempo": {"buckets": []},
            "key": None,
            "danceable": [],
            "energy_split": None,
        }
    return {"status": "ok", "year": yr, **res}
