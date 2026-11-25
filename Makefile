# Rewind v2 — common tasks. Run `make` for the list.
.PHONY: help dev api web test lint types build docker

help: ## Show this list
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | sed -E 's/:[^#]*## / — /'

api: ## Backend dev server on :8000 (auto-reload)
	cd backend && uv run fastapi dev app/main.py --port 8000

web: ## Frontend dev server on :5173 (proxies /api → :8000)
	cd frontend && npm run dev

dev: ## Backend + frontend together (Ctrl-C stops both)
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
