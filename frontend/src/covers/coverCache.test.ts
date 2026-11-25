import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CHUNK_SIZE,
  CONCURRENCY,
  __resetCoverCache,
  coverRef,
  getCoverUrl,
  primeCoverUrls,
  resolveCoverUrls,
  watchCover,
} from './coverCache'

type Handler = (ids: string[]) => Record<string, string | null>

function mockImages(handler: Handler) {
  const calls: string[][] = []
  let inFlight = 0
  let maxInFlight = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      const ids = (url.searchParams.get('ids') ?? '').split(',')
      calls.push(ids)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return new Response(JSON.stringify({ status: 'ok', images: handler(ids) }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  return { calls, maxInFlight: () => maxInFlight }
}

beforeEach(() => __resetCoverCache())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('coverRef', () => {
  it('prefers cover_id/cover_kind over id', () => {
    expect(coverRef({ id: null, cover_kind: 'track', cover_id: 'T1' }, 'album')).toEqual({
      kind: 'track',
      id: 'T1',
    })
    expect(coverRef({ id: 'A1' }, 'album')).toEqual({ kind: 'album', id: 'A1' })
    expect(coverRef(null, 'artist')).toEqual({ kind: 'artist', id: null })
  })
})

describe('cover cache', () => {
  it('chunks ids by 8 with at most 3 requests in flight', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `id${i}`)
    const mock = mockImages((chunk) => Object.fromEntries(chunk.map((id) => [id, `u/${id}`])))
    const urls = await resolveCoverUrls('track', ids)
    expect(Object.keys(urls)).toHaveLength(30)
    expect(mock.calls.map((c) => c.length)).toEqual([8, 8, 8, 6])
    expect(Math.max(...mock.calls.map((c) => c.length))).toBeLessThanOrEqual(CHUNK_SIZE)
    expect(mock.maxInFlight()).toBeLessThanOrEqual(CONCURRENCY)
    // cached: no second request
    await resolveCoverUrls('track', ids)
    expect(mock.calls).toHaveLength(4)
  })

  it('primes from inline image_url without a request', async () => {
    const mock = mockImages(() => ({}))
    primeCoverUrls('album', [{ id: null, cover_kind: 'track', cover_id: 'T9', image_url: 'u/T9' }])
    expect(getCoverUrl('track', 'T9')).toBe('u/T9')
    await resolveCoverUrls('track', ['T9'])
    expect(mock.calls).toHaveLength(0)
  })

  it('batches same-tick watches and retries misses with backoff', async () => {
    vi.useFakeTimers()
    let warm = false
    const mock = mockImages((chunk) =>
      Object.fromEntries(chunk.map((id) => [id, warm ? `u/${id}` : null])),
    )
    const release = [watchCover('artist', 'a'), watchCover('artist', 'b')]
    await vi.advanceTimersByTimeAsync(50)
    expect(mock.calls).toEqual([['a', 'b']]) // one batched call
    expect(getCoverUrl('artist', 'a')).toBeNull()

    warm = true // backend finished warming
    await vi.advanceTimersByTimeAsync(1600) // first retry at 1.5s
    expect(getCoverUrl('artist', 'a')).toBe('u/a')
    expect(mock.calls).toHaveLength(2)
    release.forEach((r) => r())
  })

  it('stops retrying after 3 idle rounds', async () => {
    vi.useFakeTimers()
    const mock = mockImages(() => ({}))
    const release = watchCover('track', 'never')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mock.calls).toHaveLength(1 + 3) // first try + 3 idle retry rounds
    release()
  })
})
