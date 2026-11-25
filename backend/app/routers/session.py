"""Session lifecycle and health."""

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from app.db import SESSION_HEADER, delete_session, validate_ticket
from app.schemas.upload import Health, SessionDeleted
from app.services.catalog import catalog_available

router = APIRouter()


@router.get("/api/health", response_model=Health)
async def health():
    """Liveness probe (used by the Docker healthcheck). No session required."""
    return Health(catalog=catalog_available())


@router.delete("/api/session", response_model=SessionDeleted)
async def delete_current_session(request: Request):
    """Permanently delete the caller's uploaded history and cached covers.

    The browser should then forget its ticket and mint a new one.
    """
    ticket = validate_ticket(request.headers.get(SESSION_HEADER))
    deleted = await run_in_threadpool(delete_session, ticket)
    return SessionDeleted(deleted=deleted)
