"""Pydantic response models — the typed API contract.

These drive the OpenAPI schema the frontend generates its TypeScript types from,
so every endpoint declares ``response_model=``. Shapes mirror the v1 API exactly,
except that optional sub-objects are ``null`` when absent (v1 sent ``{}``).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict

CoverKind = Literal["artist", "album", "track"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Ok(Model):
    status: Literal["ok"] = "ok"


class YearScoped(Ok):
    """Explore responses echo the year filter (``null`` = all time)."""

    year: int | None = None


class CoverRef(Model):
    """Fields shared by items that can show cover art.

    ``id`` is the entity's own Spotify id (may be ``null`` for albums/artists the
    catalog doesn't know). ``cover_kind``/``cover_id`` say which id actually
    resolves to artwork; ``image_url`` is the cached URL if already warmed.
    """

    id: str | None = None
    cover_kind: CoverKind | None = None
    cover_id: str | None = None
    image_url: str | None = None
