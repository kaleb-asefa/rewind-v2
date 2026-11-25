/**
 * Data fetching. Every endpoint goes through `useApi`, whose query key includes
 * the session ticket and all params. That makes stale responses impossible by
 * construction (v1 needed hand-rolled request tokens): switching the year or a
 * tab simply selects a different cache entry, and a response for an old key can
 * never paint over a newer one.
 */
import { QueryClient, keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query'

import { ApiError, apiGet, type DataOf, type GetPath, type QueryOf } from './client'
import { getSessionTicket, useSessionTicket } from './session'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data only changes on upload, which mints a new ticket (= new keys).
        staleTime: Infinity,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        // Retry transient failures once; a 4xx will not fix itself.
        retry: (count, err) =>
          count < 1 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
      },
    },
  })
}

export function apiKey<P extends GetPath>(ticket: string, path: P, query?: QueryOf<P>): QueryKey {
  return ['api', ticket, path, query ?? {}]
}

export interface UseApiOptions {
  enabled?: boolean
  timeoutMs?: number
  /** Keep showing the previous params' data while the new ones load. */
  keepPrevious?: boolean
}

export function useApi<P extends GetPath>(path: P, query?: QueryOf<P>, opts: UseApiOptions = {}) {
  const ticket = useSessionTicket()
  return useQuery<DataOf<P>, ApiError>({
    queryKey: apiKey(ticket, path, query),
    queryFn: ({ signal }) => apiGet(path, query, { signal, timeoutMs: opts.timeoutMs }),
    enabled: opts.enabled ?? true,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  })
}

/** Warm a query in the background (e.g. the tab the user is likely to open next). */
export function prefetchApi<P extends GetPath>(
  client: QueryClient,
  path: P,
  query?: QueryOf<P>,
  timeoutMs?: number,
) {
  return client.prefetchQuery({
    queryKey: apiKey(getSessionTicket(), path, query),
    queryFn: ({ signal }) => apiGet(path, query, { signal, timeoutMs }),
  })
}

/** Fetch through the cache imperatively (share deck, prefetchers). */
export function fetchApi<P extends GetPath>(
  client: QueryClient,
  path: P,
  query?: QueryOf<P>,
  timeoutMs?: number,
): Promise<DataOf<P>> {
  return client.fetchQuery({
    queryKey: apiKey(getSessionTicket(), path, query),
    queryFn: ({ signal }) => apiGet(path, query, { signal, timeoutMs }),
  })
}
