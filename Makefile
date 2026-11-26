# Rewind v2 — common tasks. Run `make` for the list.
.PHONY: help dev api web test lint types build docker

# 8010, not 8000: the v1 app (Docker) commonly still holds 8000.
API_PORT ?= 8010
WEB_PORT ?= 5173

# Fail loudly if something else (e.g. the v1 app) already holds the API port;
# otherwise the web app would silently talk to that other server.
define check_api_port
	@python3 -c "import socket,sys; s=socket.socket(); sys.exit(0 if s.connect_ex(('127.0.0.1',$(API_PORT))) else 1)" \
	  || { echo "Port $(API_PORT) is already in use by another server. Free it or run: make $@ API_PORT=8020"; exit 1; }
endef

help: ## Show this list
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | sed -E 's/:[^#]*## / — /'

api: ## Backend dev server (API_PORT, default 8010)
	$(check_api_port)
	@# Plain uvicorn, not `fastapi dev`: the FastAPI CLI opens /dev/tty itself and,
	@# next to Vite (which reads the terminal for its key shortcuts), hangs at startup.
	cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port $(API_PORT)

web: ## Frontend dev server (WEB_PORT, default 5173; proxies /api)
	cd frontend && REWIND_API=http://127.0.0.1:$(API_PORT) npx vite --port $(WEB_PORT)

dev: ## Backend + frontend together, e.g. `make dev API_PORT=8020` (Ctrl-C stops both)
	$(check_api_port)
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
