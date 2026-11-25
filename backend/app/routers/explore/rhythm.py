"""When you listen: hour/weekday/month distributions, streaks, chronotype."""

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from app.db import Con, get_con
from app.routers.explore._common import parse_year, year_clause
from app.schemas.explore import Rhythm
from app.services.metrics import WEEKDAY_NAMES, chronotype, listening_streaks, tz_offset_minutes

router = APIRouter()


@router.get("/api/metrics/rhythm", response_model=Rhythm)
async def get_rhythm(
    year: str = "all",
    con: Con = Depends(get_con),
):
    """Temporal listening patterns for the "When You Listen" chapter: plays by
    hour of day, weekday and month of year, plus daily streaks and a chronotype
    score. Timestamps are shifted from UTC into the user's local time (derived
    from their dominant conn_country) so hours read as wall-clock.
    """
    yr = parse_year(year)

    def query():
        off = tz_offset_minutes(con)
        clause = year_clause(yr, off)

        def fetch(sql, params=None):
            try:
                return (
                    con.execute(sql, params).fetchall() if params else con.execute(sql).fetchall()
                )
            except Exception:
                return []

        hourly = [0] * 24
        for h, c in fetch(
            "SELECT EXTRACT(hour FROM ts + to_minutes(?))::INTEGER AS h, COUNT(*) "
            f"FROM history WHERE ts IS NOT NULL{clause} GROUP BY h",
            [off],
        ):
            if h is not None and 0 <= int(h) <= 23:
                hourly[int(h)] = int(c)

        weekday = [0] * 7  # Mon..Sun
        for d, c in fetch(
            "SELECT EXTRACT(isodow FROM ts + to_minutes(?))::INTEGER AS d, COUNT(*) "
            f"FROM history WHERE ts IS NOT NULL{clause} GROUP BY d",
            [off],
        ):
            if d is not None and 1 <= int(d) <= 7:
                weekday[int(d) - 1] = int(c)

        monthly = [0] * 12  # Jan..Dec
        for m, c in fetch(
            "SELECT EXTRACT(month FROM ts + to_minutes(?))::INTEGER AS m, COUNT(*) "
            f"FROM history WHERE ts IS NOT NULL{clause} GROUP BY m",
            [off],
        ):
            if m is not None and 1 <= int(m) <= 12:
                monthly[int(m) - 1] = int(c)

        day_rows = fetch(
            "SELECT DISTINCT CAST(ts + to_minutes(?) AS DATE) AS day FROM history "
            f"WHERE ts IS NOT NULL{clause} ORDER BY day",
            [off],
        )
        days = [r[0] for r in day_rows]

        return hourly, weekday, monthly, days

    hourly, weekday, monthly, days = await run_in_threadpool(query)

    total_streams = sum(hourly)
    peak_hour = max(range(24), key=lambda i: hourly[i]) if total_streams else None
    busiest_idx = max(range(7), key=lambda i: weekday[i]) if sum(weekday) else None
    busiest_weekday = WEEKDAY_NAMES.get(busiest_idx + 1) if busiest_idx is not None else None

    return {
        "status": "ok",
        "year": yr,
        "hourly": hourly,
        "peak_hour": peak_hour,
        "weekday": weekday,
        "busiest_weekday": busiest_weekday,
        "monthly": monthly,
        "chronotype": chronotype(hourly),
        "streak": listening_streaks(days),
        "total_streams": total_streams,
    }
