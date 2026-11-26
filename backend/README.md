# Rewind — Backend

FastAPI + DuckDB service that ingests Spotify **Extended Streaming History** exports and
serves the metrics behind the Rewind dashboard. Each browser gets its own private DuckDB
file, keyed by the `X-Rewind-Session` header.

## Run

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8010   # http://127.0.0.1:8010, docs at /docs
```

Settings come from `REWIND_*` environment variables (see `.env.example` and
`app/config.py`). By default the catalog is read from `../data/metadata/catalog_sorted.parquet`;
without it the app still works, but audio features, genres and eras stay empty.

## Test & lint

```bash
uv run pytest            # self-contained: synthetic exports, no data/ needed
uv run ruff check . && uv run ruff format --check .
uv run mypy
```

## Layout

| Path | What lives there |
|---|---|
| `app/main.py` | App factory: routers, CORS, 400-on-bad-params handler, optional SPA serving (`REWIND_FRONTEND_DIST`) |
| `app/config.py` | Typed settings (`settings`), read once from `REWIND_*` env vars |
| `app/db.py` | Per-session DuckDB connections (`get_con` dependency), session delete, TTL cleanup, per-session memo |
| `app/schemas/` | Pydantic response models — the typed API contract (drives OpenAPI → frontend types) |
| `app/routers/session.py` | `GET /api/health`, `DELETE /api/session` |
| `app/routers/upload.py` | `POST /api/upload`, `GET /api/image(s)` |
| `app/routers/overview.py` | Overview page metrics |
| `app/routers/explore/` | One module per Explore chapter + `charts.py`; shared SQL in `_common.py` |
| `app/services/` | `catalog` (enrichment), `covers` (which id holds the art), `images` (oEmbed lookups + the server-wide cover cache, with a rate-limit pause), `metrics` (pure computation) |
| `tests/` | `fixtures.py` generates deterministic synthetic exports; `conftest.py` isolates storage/network |
| `scripts/export_openapi.py` | Writes `frontend/openapi.json` for TypeScript type generation |
| `scripts/contract_snapshot.py` | Captures/diffs every API response between two running servers |

## Rules of the road

- Every endpoint declares `response_model=`; after changing a model run
  `uv run python scripts/export_openapi.py` and regenerate the frontend types.
- Never interpolate user input into SQL. Only validated ints (`year`, tz `off`) and
  internal literals are inlined; everything else is a bound parameter.
- Before an upload, every metric endpoint returns `status: "ok"` with empty values.
- The 45M catalog is only scanned on upload (or lazily once per session), never per request.
