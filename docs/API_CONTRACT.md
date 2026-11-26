# Rewind — API Contract

The **source of truth is the OpenAPI schema** generated from the backend's Pydantic
response models (`backend/app/schemas/`). Browse it at `http://127.0.0.1:8010/docs` (dev), or
read the checked-in copy at `frontend/openapi.json`, from which the frontend generates
its TypeScript types (`npm run gen:api`). This page covers the rules the schema can't
express.

## Conventions

- **Session ticket.** Every `/api/**` request (except `/api/health`) sends
  `X-Rewind-Session: <uuid v4>`. The browser keeps it in `localStorage["rewind_session"]`
  and mints a new one per upload. A missing or non-UUID ticket gets a `400`.
- **Errors.** `{"detail": "<human-readable message>"}`. An invalid query parameter gets
  `400` (for example `Invalid entity.`), never FastAPI's default `422`. An upload over the caps
  gets `413`. Show `detail` as-is.
- **Empty is not an error.** Before any upload, and for a year with no plays, every
  metric endpoint returns `status: "ok"` with zeros, empty arrays, or `null`.
- **Optional objects are `null`, never `{}`.** Examples: `over-time.music_age`,
  `deep-cuts.no_skip`, `evolution.day_night`, `sound-detail.key`.
- **Year filter (Explore).** Explore metrics take `year=all|YYYY`; responses echo
  `"year": null|YYYY`. When a year is selected, trend periods switch from years to
  month labels (`"Jan"`…`"Dec"`). `/api/metrics/years` lists the options.
- **Range filter (Charts).** `chart` and `superlatives` take `range=all|YYYY|4w|6m`.
- **Local time.** Hours, weekdays, days, weeks, months and year boundaries all use the
  listener's local time. The offset comes from their dominant `conn_country`, or from
  `REWIND_TZ_OFFSET_HOURS`.
- **Covers.** Items that can show art carry `id`, `cover_kind`, `cover_id` and `image_url`.
  - Resolve art from `cover_kind` and `cover_id` when they're present, else from `id` plus
    the endpoint's kind. An album the catalog doesn't know has `id: null` and borrows a
    track cover.
  - `image_url` is set only if the cover is already cached. The cache is shared by all
    sessions, so a cover is fetched from Spotify once per server. When Spotify rate-limits
    (429), lookups pause for its `Retry-After` and the ids come back `null` without being
    cached, so a later retry gets them.
  - Track ids are always the release you played most, in every view.
  - Fill the rest through `GET /api/images?kind=&ids=`: at most 200 ids, batched by the client
    (8 per call, 3 calls in flight).
- **Ties are deterministic.** Every ranked list has a stable tie-breaker.

## Endpoints

| Area | Endpoints |
|---|---|
| Session | `GET /api/health`, `DELETE /api/session` |
| Ingest and covers | `POST /api/upload` (multipart `files[]`), `GET /api/image`, `GET /api/images` |
| Overview | `total-time`, `top-artist`, `top-album`, `top-track`, `total-songs`, `active-day`, `heatmap?year=` |
| Explore | `years`, `artist-rank`, `track-rank`, `bar-race?entity=`, `rhythm`, `audio`, `taste`, `behavior`, `discovery`, `listening-life`, `over-time`, `evolution`, `sound-detail`, `deep-cuts`, `wrapped` |
| Charts | `chart?entity=&sort=&limit=&range=`, `superlatives?range=&limit=` |

All metric paths are under `/api/metrics/`.

## Changing the contract

1. Change the Pydantic model and the endpoint, and update the tests.
2. Run `uv run python scripts/export_openapi.py`, then in `frontend/` run `npm run gen:api`.
3. Fix the TypeScript errors that show up, and commit everything together.

Adding a field is safe. Renaming or removing one breaks the frontend at compile time, which
is the point.

## Changes from v1

These are deliberate. The rest of v1 is preserved, as checked by `scripts/contract_snapshot.py`.

- Before any upload, `total-time` and `top-*` return `200` with empty values. v1 returned a `400`.
- Optional sub-objects are `null` instead of `{}`.
- Rank-climb, bar-race and discovery buckets now use local time. v1 used UTC there.
- New: `GET /api/health` and `DELETE /api/session`.
- `limit` is capped at 50 on `artist-rank`, `track-rank` and `bar-race`.
