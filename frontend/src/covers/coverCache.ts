/**
 * Cover-art cache (framework-free), ported from v1's api.js with the same
 * behaviour:
 *
 * - resolved URLs are remembered per `kind:id` for the life of the page, so a
 *   cover is never requested twice across components, re-renders or routes;
 * - ids requested in the same tick are batched per kind into `/api/images`
 *   calls of 8 ids, at most 3 in flight (cold covers cost the backend an oEmbed
 *   round-trip each, so one huge request would time out and resolve nothing);
 * - ids that don't resolve yet are retried with backoff (1.5s … 40s), batched
 *   by kind, for as long as rounds keep making progress, then stop after 5
 *   rounds that resolve nothing (genuine art-less ids stop costing requests);
 * - only ids some mounted component still wants are retried.
 *
 * React reads it through `useCoverUrl` (useSyncExternalStore).
 */
import { api, withTimeout } from '@/api/client'
import type { CoverCarrier, CoverKind } from '@/api/types'

export const CHUNK_SIZE = 8
export const CONCURRENCY = 3
export const BATCH_TIMEOUT_MS = 20_000
// Long enough to outlast a Spotify rate-limit pause (the backend waits out its
// Retry-After, typically 30–60 s) before giving up on a cover.
export const RETRY_DELAYS = [1500, 4000, 9000, 20000, 40000] as const
export const MAX_IDLE_ROUNDS = RETRY_DELAYS.length

export interface CoverRef {
  kind: CoverKind
  id: string | null
}

const keyOf = (kind: CoverKind, id: string) => `${kind}:${id}`

const cache = new Map<string, string>() // hits only; misses stay absent so they retry
const listeners = new Map<string, Set<() => void>>()
const wanted = new Map<string, number>() // refcount of mounted consumers per key
const queued = new Map<CoverKind, Set<string>>()
const inflight = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let idleRounds = 0

/**
 * Which Spotify id actually carries an item's art. Albums the catalog doesn't
 * know have `id: null` but ship `cover_kind: "track"` + `cover_id`: a track's
 * thumbnail *is* its album cover. Always resolve art through this.
 */
export function coverRef(item: CoverCarrier | null | undefined, defaultKind: CoverKind): CoverRef {
  if (!item) return { kind: defaultKind, id: null }
  const id = item.cover_id || item.id || null
  const kind = (item.cover_id && item.cover_kind) || defaultKind
  return { kind, id }
}

export function getCoverUrl(kind: CoverKind, id: string | null | undefined): string | null {
  return id ? (cache.get(keyOf(kind, id)) ?? null) : null
}

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l())
}

function store(kind: CoverKind, id: string, url: string) {
  const key = keyOf(kind, id)
  if (cache.get(key) === url) return
  cache.set(key, url)
  notify(key)
}

/** Seed the cache from URLs a metric response already carried (`image_url`). */
export function primeCoverUrls(defaultKind: CoverKind, items: readonly CoverCarrier[] | undefined) {
  for (const it of items ?? []) {
    const ref = coverRef(it, defaultKind)
    if (ref.id && it.image_url && !cache.has(keyOf(ref.kind, ref.id))) {
      store(ref.kind, ref.id, it.image_url)
    }
  }
}

async function fetchChunk(kind: CoverKind, ids: string[]): Promise<Record<string, string | null>> {
  const { data } = await api.GET('/api/images', {
    params: { query: { kind, ids: ids.join(',') } },
    signal: withTimeout(undefined, BATCH_TIMEOUT_MS),
  })
  return data?.images ?? {}
}

/** Resolve ids into the cache: chunked, bounded concurrency, never throws. */
async function resolve(kind: CoverKind, ids: Iterable<string>): Promise<void> {
  const need: string[] = []
  for (const id of new Set(ids)) {
    const key = keyOf(kind, id)
    if (id && !cache.has(key) && !inflight.has(key)) need.push(id)
  }
  if (!need.length) return
  need.forEach((id) => inflight.add(keyOf(kind, id)))

  const chunks: string[][] = []
  for (let i = 0; i < need.length; i += CHUNK_SIZE) chunks.push(need.slice(i, i + CHUNK_SIZE))

  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++]!
      try {
        const images = await fetchChunk(kind, chunk)
        for (const id of chunk) {
          const url = images[id]
          if (url) store(kind, id, url) // reveals progressively, chunk by chunk
        }
      } catch {
        // transient — left uncached so a retry round picks it up
      } finally {
        chunk.forEach((id) => inflight.delete(keyOf(kind, id)))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker))
}

function pendingByKind(): Map<CoverKind, string[]> {
  const byKind = new Map<CoverKind, string[]>()
  for (const [key, count] of wanted) {
    if (count <= 0 || cache.has(key) || inflight.has(key)) continue
    const sep = key.indexOf(':')
    const kind = key.slice(0, sep) as CoverKind
    byKind.set(kind, [...(byKind.get(kind) ?? []), key.slice(sep + 1)])
  }
  return byKind
}

function scheduleRetry() {
  if (retryTimer || idleRounds >= MAX_IDLE_ROUNDS || !pendingByKind().size) return
  const delay = RETRY_DELAYS[Math.min(idleRounds, RETRY_DELAYS.length - 1)]
  retryTimer = setTimeout(async () => {
    retryTimer = null
    const byKind = pendingByKind()
    if (!byKind.size) return
    const before = cache.size
    await Promise.all(Array.from(byKind, ([kind, ids]) => resolve(kind, ids)))
    idleRounds = cache.size > before ? 0 : idleRounds + 1
    scheduleRetry()
  }, delay)
}

function flush() {
  flushTimer = null
  const batches = Array.from(queued)
  queued.clear()
  void Promise.all(batches.map(([kind, ids]) => resolve(kind, ids))).then(scheduleRetry)
}

/**
 * Declare interest in a cover. Queues it for the next batched lookup (same-tick
 * requests share calls) and keeps it in the retry set until released.
 */
export function watchCover(kind: CoverKind, id: string): () => void {
  const key = keyOf(kind, id)
  wanted.set(key, (wanted.get(key) ?? 0) + 1)
  if (!cache.has(key)) {
    if (!queued.has(kind)) queued.set(kind, new Set())
    queued.get(kind)!.add(id)
    idleRounds = 0 // new work deserves a fresh retry budget
    flushTimer ??= setTimeout(flush, 0)
  }
  return () => {
    const n = (wanted.get(key) ?? 1) - 1
    if (n <= 0) wanted.delete(key)
    else wanted.set(key, n)
  }
}

export function subscribeCover(kind: CoverKind, id: string, listener: () => void): () => void {
  const key = keyOf(kind, id)
  if (!listeners.has(key)) listeners.set(key, new Set())
  listeners.get(key)!.add(listener)
  return () => {
    const set = listeners.get(key)
    set?.delete(listener)
    if (set && !set.size) listeners.delete(key)
  }
}

/**
 * Resolve URLs for consumers that don't render <img> (the canvas share deck).
 * Returns `{id: url}` for whatever resolved; unresolved ids are absent.
 */
export async function resolveCoverUrls(
  kind: CoverKind,
  ids: readonly (string | null | undefined)[],
): Promise<Record<string, string>> {
  const clean = ids.filter((id): id is string => !!id)
  await resolve(kind, clean)
  const out: Record<string, string> = {}
  for (const id of clean) {
    const url = cache.get(keyOf(kind, id))
    if (url) out[id] = url
  }
  return out
}

const warmed = new Set<string>()
const warming = new Set<HTMLImageElement>() // hold refs so GC can't cancel the load

/** Resolve ahead of time and warm the browser's image cache (prefetch a tab). */
export async function preloadCovers(kind: CoverKind, ids: readonly (string | null | undefined)[]) {
  const urls = await resolveCoverUrls(kind, ids)
  for (const url of Object.values(urls)) {
    if (warmed.has(url)) continue
    warmed.add(url)
    const img = new Image()
    warming.add(img)
    img.decoding = 'async'
    img.onload = img.onerror = () => warming.delete(img)
    img.src = url
  }
}

/** Test hook: forget everything. */
export function __resetCoverCache() {
  cache.clear()
  listeners.clear()
  wanted.clear()
  queued.clear()
  inflight.clear()
  if (flushTimer) clearTimeout(flushTimer)
  if (retryTimer) clearTimeout(retryTimer)
  flushTimer = retryTimer = null
  idleRounds = 0
}
