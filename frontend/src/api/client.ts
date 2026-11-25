/**
 * Typed API client.
 *
 * `api` is an openapi-fetch client generated from the backend's OpenAPI schema
 * (src/api/schema.d.ts — regenerate with `npm run gen:api`), so paths, params
 * and response shapes are all checked at compile time. Every request carries the
 * session ticket. `apiGet` adds a timeout and turns failures into `ApiError`.
 */
import createClient from 'openapi-fetch'

import type { paths } from './schema'
import { SESSION_HEADER, getSessionTicket } from './session'

// fetch is looked up per call (not captured at import) so tests can stub it.
export const api = createClient<paths>({
  // Same origin: Vite proxies /api in dev; FastAPI serves the SPA in production.
  baseUrl: typeof window === 'undefined' ? '' : window.location.origin,
  fetch: (req) => globalThis.fetch(req),
})

api.use({
  onRequest({ request }) {
    request.headers.set(SESSION_HEADER, getSessionTicket())
    return request
  },
})

export class ApiError extends Error {
  readonly status: number
  readonly timedOut: boolean

  constructor(message: string, status: number, timedOut = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.timedOut = timedOut
  }
}

/** Every GET path in the API. */
export type GetPath = {
  [P in keyof paths]: paths[P] extends { get: object } ? P : never
}[keyof paths]

type GetOp<P extends GetPath> = paths[P] extends { get: infer Op } ? Op : never

/** Query parameters accepted by a GET path. */
export type QueryOf<P extends GetPath> =
  GetOp<P> extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never

/** The 200 JSON body returned by a GET path. */
export type DataOf<P extends GetPath> =
  GetOp<P> extends { responses: { 200: { content: { 'application/json': infer D } } } } ? D : never

export const DEFAULT_TIMEOUT_MS = 10_000

function detailOf(error: unknown, status: number): string {
  if (error && typeof error === 'object' && 'detail' in error) {
    const { detail } = error as { detail: unknown }
    if (typeof detail === 'string') return detail
  }
  return `Server returned status ${status}`
}

/** Normalize any thrown fetch failure into an ApiError. */
export function toApiError(err: unknown, timeoutMs: number): ApiError {
  if (err instanceof ApiError) return err
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new ApiError(
      `Server took too long to respond (limit ${Math.round(timeoutMs / 1000)}s).`,
      408,
      true,
    )
  }
  if (err instanceof DOMException && err.name === 'AbortError') throw err // caller cancelled
  return new ApiError('Backend server is offline or unreachable.', 0)
}

export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/** GET a typed endpoint; throws ApiError on any failure. */
export async function apiGet<P extends GetPath>(
  path: P,
  query?: QueryOf<P>,
  { signal, timeoutMs = DEFAULT_TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<DataOf<P>> {
  let result: { data?: unknown; error?: unknown; response: Response }
  try {
    // The generic path/params pairing is enforced by apiGet's own signature;
    // openapi-fetch's overloads can't follow a generic P, hence the cast.
    const get = api.GET as unknown as (
      p: string,
      init: { params: { query?: object }; signal: AbortSignal },
    ) => Promise<{ data?: unknown; error?: unknown; response: Response }>
    result = await get(path, {
      params: { query: query as object | undefined },
      signal: withTimeout(signal, timeoutMs),
    })
  } catch (err) {
    throw toApiError(err, timeoutMs)
  }
  if (!result.response.ok) {
    throw new ApiError(detailOf(result.error, result.response.status), result.response.status)
  }
  return result.data as DataOf<P>
}
