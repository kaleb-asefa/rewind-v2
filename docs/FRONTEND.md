# Rewind — Frontend (v2)

A Vite + React 19 + TypeScript (strict) single-page app in `frontend/`.

## Stack

| Concern | Choice |
|---|---|
| Routing | React Router. Each page is a lazy chunk: `/`, `/upload`, `/overview`, `/charts`, `/explore`. |
| Data | TanStack Query through `useApi(path, query)` (`src/api/queries.ts`). |
| API types | Generated from the backend's OpenAPI schema with `npm run gen:api`, written to `src/api/schema.d.ts`. |
| Styling | Tailwind v4. The v1 design tokens live in `src/styles/tokens.css` and are mapped in `index.css`. |
| Charts | Hand-built React and SVG components; d3 is used only for maths. The share deck draws on a canvas. |
| Fonts and icons | Self-hosted with `@fontsource` and `material-symbols`. No CDNs. |
| Quality | oxlint, Prettier, Vitest + Testing Library, Playwright (`e2e/`). |

## Key ideas

- **Every request is session-scoped.** `api/session.ts` keeps the guest ticket in
  `localStorage` and an openapi-fetch middleware sends it on every request. An upload
  gets a fresh ticket. It only becomes active once the upload succeeds, and then the
  old session is deleted on the server.
- **Query keys carry all state.** `['api', ticket, path, params]` is the whole key, so
  a year switch or tab change selects a different cache entry. A slow response for an
  old selection can't overwrite a newer one; v1 needed hand-written request tokens for
  that.
- **Covers.** `covers/coverCache.ts` resolves `(kind, id)` to an image URL with v1's
  batching:
  - batches of 8 ids, 3 requests in flight at most;
  - failed ids retried after 1.5 s, 4 s and 9 s;
  - stops after three rounds that resolve nothing.

  Use `coverRef(item, kind)` to choose the id, because some albums borrow a track's art.
  Components use `<CoverImage item kind>`.
- **Explore year filter.** `features/explore/yearFilter*` holds a single context. Every
  chapter calls `useExploreApi`, which adds `year` to the query.
- **Animation.** `useRafLoop` runs only while the chart is playing or still settling,
  and only while it is on screen. The bar race is a pure reducer (`climb/raceState.ts`).
- **Empty states are honest.** v1's fake numbers are gone. With no upload, a year with
  no plays, or no catalog, a chapter says so (`ChapterEmpty`).

## Layout

```
src/
  api/          client, session, queries, upload, generated schema
  app/          router, layout (nav, theme, footer), error pages
  components/   Card, MetricCard, PillTabs, FloatingTooltip, Skeleton, Icon, …
  covers/       cover cache + hooks + <CoverImage>
  features/
    landing/  upload/  overview/  charts/ (+ share/)  explore/ (+ chapters/, climb/)
  lib/          format helpers, shared hooks
  styles/       tokens.css (theme variables), components.css (v1 classes), index.css
```

## Commands

```bash
npm run dev          # http://localhost:5173 (proxies /api to :8000; set REWIND_API to change)
npm run build        # type-checks, then writes dist/
npm test             # Vitest
npm run e2e          # Playwright (starts its own backend on :8010 and Vite on :5180)
npm run lint && npm run typecheck && npm run format:check
npm run gen:api      # after a backend response-model change (see API_CONTRACT.md)
```
