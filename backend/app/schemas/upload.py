"""Upload, cover-image and session endpoints."""

from typing import Literal

from app.schemas import Model, Ok


class Enrichment(Model):
    status: Literal["ok", "skipped", "error"]
    reason: str | None = None
    matched: int = 0
    total: int = 0
    coverage: float = 0.0


class UploadResult(Ok):
    message: str
    files_processed: int
    total_rows: int
    enrichment: Enrichment


class ImageResult(Ok):
    image_url: str | None


class ImagesResult(Ok):
    images: dict[str, str | None]


class SessionDeleted(Ok):
    deleted: bool


class Health(Ok):
    catalog: bool
