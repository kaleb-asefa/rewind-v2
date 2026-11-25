# Rewind v2 — common tasks. Run `make` for the list.
.PHONY: help dev api web test lint types build docker

API_PORT ?= 8000
WEB_PORT ?= 5173

help: ## Show this list
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | sed -E 's/:[^#]*## / — /'

api: ## Backend dev server (API_PORT, default 8000)
	cd backend && uv run fastapi dev app/main.py --port $(API_PORT)

web: ## Frontend dev server (WEB_PORT, default 5173; proxies /api)
	cd frontend && REWIND_API=http://127.0.0.1:$(API_PORT) npx vite --port $(WEB_PORT)

dev: ## Backend + frontend together, e.g. `make dev API_PORT=8010` (Ctrl-C stops both)
	@trap 'kill 0' INT TERM; $(MAKE) api & $(MAKE) web & wait

test: ## All tests (backend pytest + frontend vitest)
	cd backend && uv run pytest -q
	cd frontend && npm test -- --run

lint: ## Lint + typecheck both halves
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy
	cd frontend && npm run lint && npm run typecheck

types: ## Regenerate frontend API types from the backend's OpenAPI schema
	cd backend && uv run python scripts/export_openapi.py
	cd frontend && npm run gen:api

build: ## Production frontend build (frontend/dist)
	cd frontend && npm run build

docker: ## Build and run the production container on :80
	docker compose up --build
