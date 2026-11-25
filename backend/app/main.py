"""Rewind API application factory.

Wires routers, middleware and (optionally) the built frontend. Business logic lives
in ``app.routers`` (HTTP) and ``app.services`` (computation / storage helpers).
"""

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import lifespan
from app.routers import explore, overview, session, upload

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


async def _bad_request(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Invalid query params are a 400 with a short message (the v1 contract),
    rather than FastAPI's default 422 with a validation-error tree."""
    names = sorted({str(e["loc"][-1]) for e in exc.errors() if e.get("loc")})
    detail = f"Invalid {', '.join(names)}." if names else "Invalid request."
    return JSONResponse(status_code=400, content={"detail": detail})


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """Serve the built SPA from ``dist`` only — never anything else on disk.

    Real files under ``dist/assets`` are served by StaticFiles; any other non-API
    path returns ``index.html`` so client-side routes (``/explore``) deep-link.
    """
    index = dist / "index.html"
    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")
    public = {p.name for p in dist.iterdir() if p.is_file()}

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        if path in public:  # top-level files Vite copies from public/ (favicon, …)
            return FileResponse(dist / path)
        return FileResponse(index)


def create_app() -> FastAPI:
    app = FastAPI(title="Rewind API", version="2.0.0", lifespan=lifespan)
    app.add_exception_handler(RequestValidationError, _bad_request)  # type: ignore[arg-type]

    # Registered before CORS so CORS ends up outermost and the 413 still carries
    # CORS headers (otherwise the browser reports a generic network failure).
    app.middleware("http")(upload.enforce_upload_size_limit)
    if settings.origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.origins,
            allow_credentials=False,  # auth is the X-Rewind-Session header, not cookies
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(session.router)
    app.include_router(upload.router)
    app.include_router(overview.router)
    app.include_router(explore.router)

    dist = settings.frontend_dist
    if dist and (Path(dist) / "index.html").is_file():
        _mount_frontend(app, Path(dist))
    return app


app = create_app()
