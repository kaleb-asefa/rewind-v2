/** Loads everything the share deck draws, through the shared query cache. */
import type { QueryClient } from '@tanstack/react-query'

import { fetchApi } from '@/api/queries'
import type { CoverKind } from '@/api/types'
import { coverRef, primeCoverUrls, resolveCoverUrls } from '@/covers/coverCache'

import type { DeckData, DeckItem, Recap } from './types'

const RECAP_YEARS = 3 // most recent years that get their own recap card

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch {
    return null
  }
}

async function loadRecap(qc: QueryClient, year: number): Promise<Recap | null> {
  const heat = await safe(fetchApi(qc, '/api/metrics/heatmap', { year }, 8000))
  if (!heat?.days.length || heat.year !== year) return null
  const top = async (entity: 'artist' | 'track' | 'album' | 'genre') =>
    (
      await safe(
        fetchApi(qc, '/api/metrics/chart', {
          entity,
          sort: 'minutes',
          limit: 1,
          range: String(year),
        }),
      )
    )?.items[0] ?? null
  const [artist, track, album, genre, sup] = await Promise.all([
    top('artist'),
    top('track'),
    top('album'),
    top('genre'),
    safe(fetchApi(qc, '/api/metrics/superlatives', { range: String(year), limit: 1 })),
  ])
  return {
    year,
    heat: { ...heat, year },
    artist: artist && { ...artist },
    track: track && { ...track },
    album: album && { ...album },
    genre: genre && { ...genre },
    loyal: sup?.never_skipped[0]
      ? { ...sup.never_skipped[0], name: sup.never_skipped[0].name ?? '—' }
      : null,
  }
}

export async function loadDeckData(
  qc: QueryClient,
  years: readonly number[],
): Promise<DeckData | null> {
  const chart = async (entity: 'artist' | 'track' | 'album' | 'genre') =>
    (
      (
        await safe(
          fetchApi(qc, '/api/metrics/chart', { entity, sort: 'minutes', limit: 5, range: 'all' }),
        )
      )?.items ?? []
    ).map((it) => ({ ...it }))
  const [artists, tracks, albums, genres] = await Promise.all([
    chart('artist'),
    chart('track'),
    chart('album'),
    chart('genre'),
  ])
  if (!artists.length && !tracks.length) return null
  const recapYears = [...years].sort((a, b) => b - a).slice(0, RECAP_YEARS)
  const [total, audio, recaps] = await Promise.all([
    safe(fetchApi(qc, '/api/metrics/total-time')),
    safe(fetchApi(qc, '/api/metrics/audio')),
    Promise.all(recapYears.map((y) => loadRecap(qc, y))),
  ])
  return {
    artists,
    tracks,
    albums,
    genres,
    totalMinutes: total?.total_minutes ?? 0,
    vibe: audio?.avg ? { energy: audio.avg.energy, valence: audio.avg.valence } : null,
    recaps: recaps.filter((r): r is Recap => r !== null),
  }
}

function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const img = new Image()
    // Spotify's CDN sends ACAO: *, so drawing doesn't taint the canvas.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Attach cover images to every item. Inline URLs paint first; the rest are
 * resolved through the shared cover cache. `onUpdate` repaints as they land.
 */
export async function attachCovers(d: DeckData, onUpdate: () => void): Promise<void> {
  const from = (key: 'artist' | 'track' | 'album' | 'loyal') =>
    d.recaps.map((r) => r[key]).filter((x): x is DeckItem => !!x)
  const groups: [CoverKind, DeckItem[]][] = [
    ['artist', [...d.artists, ...from('artist')]],
    ['track', [...d.tracks, ...from('track'), ...from('loyal')]],
    ['album', [...d.albums, ...from('album')]],
  ]
  await Promise.all(
    groups.map(async ([kind, items]) => {
      primeCoverUrls(kind, items)
      const inline = items.filter((it) => it.image_url)
      await Promise.all(inline.map(async (it) => (it.img = await loadImage(it.image_url))))
      if (inline.length) onUpdate()
      const missing = items.filter((it) => !it.img && coverRef(it, kind).id)
      const byKind = new Map<CoverKind, string[]>()
      for (const it of missing) {
        const r = coverRef(it, kind)
        byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r.id!])
      }
      const maps = new Map<CoverKind, Record<string, string>>()
      await Promise.all(
        Array.from(byKind, async ([k, ids]) => maps.set(k, await resolveCoverUrls(k, ids))),
      )
      await Promise.all(
        missing.map(async (it) => {
          const r = coverRef(it, kind)
          const url = maps.get(r.kind)?.[r.id!]
          if (url) it.img = await loadImage(url)
        }),
      )
      onUpdate()
    }),
  )
}
