import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router'

import { fetchApi, useApi } from '@/api/queries'
import type { CoverKind, Schemas } from '@/api/types'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { SkeletonBlock } from '@/components/Skeleton'
import { CoverImage } from '@/covers/CoverImage'
import { coverRef, preloadCovers, primeCoverUrls } from '@/covers/coverCache'

import { ENTITIES, fmtMinutesShort, rankClass, type Entity, type Sort } from './chartConfig'

type Item = Schemas['ChartItem']

interface Props {
  entity: Entity
  sort: Sort
  range: string
  depth: number
  search: string
  years: readonly number[]
  onYears: (years: number[]) => void
}

function Cover({ item, entity, big }: { item: Item; entity: Entity; big?: boolean }) {
  const cfg = ENTITIES[entity]
  const size = big ? 'h-16 w-16 sm:h-20 sm:w-20' : 'h-11 w-11'
  const shape = cfg.round ? 'rounded-full' : 'rounded-md'
  if (!cfg.cover) {
    return (
      <div className={`${size} ${shape} flex shrink-0 items-center justify-center bg-primary/15`}>
        <Icon name="category" className="text-primary" />
      </div>
    )
  }
  return (
    <CoverImage
      item={item}
      kind={cfg.cover}
      className={`${size} ${shape}`}
      fallbackIcon={cfg.icon}
    />
  )
}

function Movement({ move }: { move: number | 'new' | null }) {
  if (move === 'new')
    return <span className="text-[10px] font-bold tracking-wide text-primary">NEW</span>
  if (move == null || move === 0) return null
  const up = move > 0
  return (
    <span
      className={`text-[10px] font-bold tabular-nums ${up ? 'text-primary' : 'text-error'}`}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(move)} from last year`}
    >
      {up ? '▲' : '▼'}
      {Math.abs(move)}
    </span>
  )
}

export function Leaderboard({ entity, sort, range, depth, search, years, onYears }: Props) {
  const cfg = ENTITIES[entity]
  const query = useApi(
    '/api/metrics/chart',
    { entity, sort, limit: 100, range },
    { keepPrevious: true },
  )
  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const queryClient = useQueryClient()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.data?.years.length && query.data.years.join() !== years.join())
      onYears(query.data.years)
  }, [query.data, years, onYears])

  useEffect(() => {
    if (cfg.cover) primeCoverUrls(cfg.cover, items)
  }, [cfg.cover, items])

  // Idle prefetch of the views the user is likely to open next (other years,
  // other entities) and their covers, so switching feels instant.
  useEffect(() => {
    if (!query.data) return
    const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 500))
    const cancel = window.cancelIdleCallback ?? clearTimeout
    const handle = idle(async () => {
      const views: [Entity, string][] = [
        ...['all', ...years.map(String)]
          .filter((r) => r !== range)
          .map((r) => [entity, r] as [Entity, string]),
        ...(Object.keys(ENTITIES) as Entity[])
          .filter((e) => e !== entity)
          .map((e) => [e, range] as [Entity, string]),
      ]
      for (const [e, r] of views) {
        const kind = ENTITIES[e].cover
        let data: { items: Item[] }
        try {
          data = await fetchApi(queryClient, '/api/metrics/chart', {
            entity: e,
            sort,
            limit: 100,
            range: r,
          })
        } catch {
          continue // prefetch is best-effort
        }
        if (!kind) continue
        primeCoverUrls(kind, data.items)
        const byKind = new Map<CoverKind, string[]>()
        for (const it of data.items.slice(
          0,
          Math.min(data.items.length, Math.max(depth, 20), 50),
        )) {
          const ref = coverRef(it, kind)
          if (ref.id) byKind.set(ref.kind, [...(byKind.get(ref.kind) ?? []), ref.id])
        }
        for (const [k, ids] of byKind) await preloadCovers(k, ids)
      }
    })
    return () => cancel(handle as number)
  }, [query.data, entity, sort, range, depth, years, queryClient])

  const q = search.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return null
    const ranks = new Set<number>()
    items.forEach((it, i) => {
      if (`${it.name} ${it.artist ?? ''}`.toLowerCase().includes(q)) ranks.add(i + 1)
    })
    return ranks
  }, [items, q])
  const firstMatch = matches && matches.size ? Math.min(...matches) : null
  const visible = Math.min(Math.max(depth, firstMatch ?? 0), items.length)
  const shown = items.slice(0, visible)
  const maxVal = items[0]?.[sort] ?? 0
  const isYear = /^\d{4}$/.test(range)
  const moveOf = (it: Item, rank: number) =>
    isYear ? (it.prev_rank == null ? 'new' : it.prev_rank - rank) : null

  useEffect(() => {
    if (!firstMatch) return
    listRef.current
      ?.querySelector(`[data-rank="${firstMatch}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [firstMatch])

  const stat = (it: Item) =>
    sort === 'minutes' ? fmtMinutesShort(it.minutes) : `${it.streams.toLocaleString()} streams`
  const subStat = (it: Item) =>
    sort === 'minutes' ? `${it.streams.toLocaleString()} streams` : fmtMinutesShort(it.minutes)
  const noun = cfg.label.toLowerCase()

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
        <SkeletonBlock className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <Card className="rounded-2xl p-10 text-center">
        <p className="text-body-lg text-error">{query.error.message}</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-3 font-bold text-primary underline"
        >
          Try again
        </button>
      </Card>
    )
  }

  if (!items.length) {
    return (
      <Card className="rounded-2xl p-10 text-center">
        <Icon name="leaderboard" className="text-4xl text-on-surface-variant opacity-40" />
        <p className="mt-3 text-body-lg text-on-surface-variant">
          {entity === 'genre' && query.data
            ? 'No genre data for this range — genres need the music catalog.'
            : 'No data yet — upload your Spotify history to build your charts.'}
        </p>
        <Link
          to="/upload"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-label-bold uppercase tracking-wider text-on-primary transition hover:brightness-110"
        >
          <Icon name="upload" className="text-lg" /> Upload data
        </Link>
      </Card>
    )
  }

  return (
    <div className={`space-y-6 transition-opacity ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
      {q && (
        <div
          role="status"
          className="glass-card flex items-center gap-3 rounded-full px-5 py-3 text-body-sm"
        >
          {firstMatch ? (
            <>
              <Icon name="leaderboard" className="text-primary" />
              <span>
                <b>
                  {items[firstMatch - 1]!.name}
                  {items[firstMatch - 1]!.artist ? ` · ${items[firstMatch - 1]!.artist}` : ''}
                </b>{' '}
                — <span className="font-bold text-primary">#{firstMatch}</span> of your top {noun}
                {matches!.size > 1 && (
                  <span className="opacity-60"> ({matches!.size} matches)</span>
                )}
              </span>
            </>
          ) : (
            <>
              <Icon name="search_off" className="text-on-surface-variant" />
              <span>
                No match for “{search.trim()}” in your top {noun}.
              </span>
            </>
          )}
        </div>
      )}

      {shown.length >= 3 && (
        <div className="grid grid-cols-3 items-end gap-3 sm:gap-4">
          {[1, 0, 2].map((idx) => {
            const it = shown[idx]!
            const rank = idx + 1
            return (
              <div
                key={rank}
                className={`glass-card flex flex-col items-center rounded-2xl p-4 text-center ${rank === 1 ? 'ring-1 ring-primary/40 sm:-mt-6' : ''}`}
              >
                <div className={`font-mono text-headline-md font-bold ${rankClass(rank)}`}>
                  {rank}
                </div>
                <div className="my-3">
                  <Cover item={it} entity={entity} big />
                </div>
                <div className="w-full truncate font-semibold text-on-surface">{it.name}</div>
                {cfg.hasArtist && it.artist && (
                  <div className="w-full truncate text-[11px] text-on-surface-variant">
                    {it.artist}
                  </div>
                )}
                <div className="mt-1 font-bold tabular-nums text-primary">{stat(it)}</div>
              </div>
            )
          })}
        </div>
      )}

      <Card
        ref={listRef}
        className="divide-y divide-[var(--card-border)] overflow-hidden rounded-2xl"
      >
        <ol aria-label={`Top ${noun}`}>
          {shown.map((it, i) => {
            const rank = i + 1
            const share = maxVal > 0 ? Math.max(3, Math.round((it[sort] / maxVal) * 100)) : 0
            return (
              <li
                key={`${it.name}|${it.artist ?? ''}|${it.id ?? ''}`}
                data-rank={rank}
                className={`chart-row flex items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-5 ${matches?.has(rank) ? 'chart-row--match' : ''}`}
              >
                <div
                  className={`w-7 shrink-0 text-right font-mono text-body-lg font-bold sm:w-9 ${rankClass(rank)}`}
                >
                  {rank}
                </div>
                <Cover item={it} entity={entity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-on-surface">{it.name}</span>
                    <Movement move={moveOf(it, rank)} />
                  </div>
                  {cfg.hasArtist && it.artist && (
                    <div className="truncate text-[12px] text-on-surface-variant">{it.artist}</div>
                  )}
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums text-on-surface">{stat(it)}</div>
                  <div className="text-[11px] tabular-nums text-on-surface-variant">
                    {subStat(it)}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </Card>
    </div>
  )
}
