# syntax=docker/dockerfile:1
# Rewind v2 — one image: FastAPI API + the built React SPA (served from dist only).

# ── 1. Frontend build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ── 2. Runtime ────────────────────────────────────────────────────────────────
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    REWIND_SESSIONS_DIR=/data/sessions \
    REWIND_CATALOG_PATH=/data/metadata/catalog_sorted.parquet \
    REWIND_COVERS_DB=/data/cache/covers.sqlite3 \
    REWIND_FRONTEND_DIST=/app/frontend/dist

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/app ./app
COPY --from=web /web/dist /app/frontend/dist

RUN useradd --system --uid 10001 rewind && mkdir -p /data/sessions /data/metadata /data/cache \
    && chown -R rewind /data
USER rewind
ENV PATH="/app/backend/.venv/bin:$PATH"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health').read()" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
