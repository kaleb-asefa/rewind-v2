"""Explore-page (deep dive) and Charts-page endpoints.

Every Explore metric takes an optional ``year`` filter (``all`` = every play ever,
or a 4-digit year); ``/api/metrics/years`` lists the years a session has data for.
The Charts endpoints use their own ``range`` (``all|YYYY|4w|6m``).
"""

from fastapi import APIRouter

from app.routers.explore import (
    charts,
    deep_cuts,
    discovery,
    evolution,
    habits,
    life,
    over_time,
    ranks,
    rhythm,
    sound,
    taste,
    wrapped,
)

router = APIRouter()
for _module in (
    ranks,
    rhythm,
    sound,
    taste,
    habits,
    discovery,
    life,
    over_time,
    evolution,
    deep_cuts,
    wrapped,
    charts,
):
    router.include_router(_module.router)
