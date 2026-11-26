# Rewind v2

Private analytics for a user's full Spotify Extended Streaming History. No accounts: each
browser gets a guest session ticket and its own DuckDB file, deleted after 48 h idle.

## Stack

- **Backend** (`backend/`): Python 3.13, FastAPI, DuckDB, Pydantic v2 / pydantic-settings,
  managed with **uv**. Tooling: ruff, mypy, pytest.
- **Frontend** (`frontend/`): React 19 + TypeScript (strict), Vite, React Router, TanStack
  Query, openapi-fetch, Tailwind v4, d3 (maths only, rendering is hand-built SVG/canvas).
  Tooling: oxlint, Prettier, Vitest + Testing Library, Playwright (`e2e/`). Node 22.
- **Data**: optional 45M-track catalog at `data/metadata/catalog_sorted.parquet` (read-only,
  enriches audio features/genres). Covers come from Spotify oEmbed, cached server-wide in SQLite.
- **Deploy**: one Docker image serves the API and the built SPA (`Dockerfile`, `docker-compose.yml`).

Deeper docs: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/FRONTEND.md](docs/FRONTEND.md),
[backend/README.md](backend/README.md), [docs/API_CONTRACT.md](docs/API_CONTRACT.md),
[docs/UI_GUIDELINES.md](docs/UI_GUIDELINES.md). `docs/archive/v1/` is the old app; ignore it.

## Running

```bash
make dev                 # API on :8010 + Vite on :5173 (proxies /api). Ctrl-C stops both.
make api / make web      # each half alone
make test                # backend pytest + frontend vitest
make lint                # ruff check + format check + mypy, oxlint + tsc
make types               # regenerate frontend API types from backend OpenAPI
cd frontend && npm run e2e            # Playwright (own backend on :8011, Vite on :5180)
cd frontend && npm run format         # Prettier
cd backend && uv run ruff format .    # ruff formatter
cd backend && uv run python scripts/make_sample_export.py sample   # synthetic export to upload
```

- The API defaults to **8010**, not 8000 (the v1 app often holds 8000). Override with
  `make dev API_PORT=8020`. `make api` refuses to start if the port is taken.
- Run the API with plain `uvicorn --reload`, never `fastapi dev`: it grabs `/dev/tty` and
  hangs next to Vite.
- Backend settings are `REWIND_*` env vars (`backend/.env.example`, `app/config.py`).
  Set `REWIND_COVERS_ENABLED=false` for offline/hermetic runs.

CI (`.github/workflows/ci.yml`) runs all of the above plus drift checks on
`frontend/openapi.json` and `frontend/src/api/schema.d.ts`. Run `make lint && make test`
before calling work done.

## Code style

### General
- Comments explain **why** (a reason, trade-off or workaround), not what.
- Don't over-engineer: no options or abstractions for a single caller. Extract shared code
  once there are real duplicates.
- Every behaviour change ships with a test. Fixes get a regression test.
- Ties in any ranked list need a stable, deterministic tie-breaker.

### Backend
- ruff (line length 100, rules `E F W I B UP SIM RUF`) and mypy must pass. Long SQL strings
  may stay unwrapped (E501 is off).
- Layout: `app/main.py` only wires the app. Endpoints go in `app/routers/` (one module per
  Explore chapter under `routers/explore/`, shared SQL in `_common.py`). Response models in
  `app/schemas/`. Framework-free computation in `app/services/metrics.py`.
- Every endpoint declares `response_model=`. Routes are `async` and run DuckDB/file/network
  work inside `run_in_threadpool`.
- SQL-first: let DuckDB aggregate; Python shapes the result.
- **Never interpolate user input into SQL.** Use bound parameters. Only validated ints
  (`year`, tz offset) and internal literals may be inlined. Whitelist enum-like params and
  reject others with a 400.
- Join on ids, never on names. If a name must be the key, canonicalize it
  (`strip_accents(upper(trim(...)))`) and pick the display spelling with `arg_max`.
- Bad query params return **400** `{"detail": "..."}`, never 422. Empty data is not an error:
  metric endpoints return `status: "ok"` with zeros/empty arrays/`null`. Optional objects are
  `null`, never `{}`.
- The catalog is scanned only on upload (or once lazily per session), never per request.

### Frontend
- Prettier: no semicolons, single quotes, width 100, trailing commas. oxlint must be clean.
- TypeScript is strict with `noUncheckedIndexedAccess`; no `any` escapes.
- Named exports (`export function Foo`), function components only. Import app code via the
  `@/` alias; siblings via `./`. Type-only imports use `import type`.
- Feature code lives in `src/features/<page>/`; shared UI in `src/components/`; helpers in
  `src/lib/`.
- All API calls go through `useApi` (`src/api/queries.ts`) and the generated types in
  `src/api/schema.d.ts`. Never hand-edit `schema.d.ts`. Query keys carry all state.
- Covers via `<CoverImage>` / `coverRef(item, kind)`, never ad-hoc fetches.
- No CDNs: fonts and icons are self-hosted. No `dangerouslySetInnerHTML`.
- Empty states are honest: no fake or sample numbers.
- UI copy follows [docs/UI_GUIDELINES.md](docs/UI_GUIDELINES.md): short, factual, no hype,
  each fact in one place (card title ≤ 4 words, helper line ≤ 8 words).

### Changing the API contract
1. Change the Pydantic model, endpoint and tests.
2. `make types` (exports `frontend/openapi.json`, regenerates `schema.d.ts`).
3. Fix the resulting TS errors and commit backend + frontend together.

## Git rules

- **Do not add a `Co-Authored-By: Claude ...` trailer to commits**, and do not add a
  "Generated with Claude Code" line to PR descriptions. Commits are authored by the user only.
- Conventional Commits with a scope: `fix(covers): ...`, `feat(frontend): ...`,
  `refactor(...)`, `test: ...`, `chore: ...`. Subject is lowercase, imperative, no period.
- For non-trivial changes, the body explains the root cause, what changed, and how it was
  verified.
- Commit as you go, without waiting to be asked. Each time a self-contained piece of work
  is done and passing lint and tests (a finished component, a working fix, a refactor that
  stands on its own), commit it. Prefer several small, focused commits over one big one at
  the end, and don't commit half-finished or broken work just to checkpoint.
- Never commit `data/`, `.env`, or session/DuckDB files.
