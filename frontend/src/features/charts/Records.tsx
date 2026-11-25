import { Link } from 'react-router'

import { useApi } from '@/api/queries'
import type { CoverKind } from '@/api/types'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { PillTabs } from '@/components/PillTabs'
import { SkeletonBlock } from '@/components/Skeleton'
import { CoverImage } from '@/covers/CoverImage'

import { fmtDay, fmtMinutesShort, rangeOptions, rankClass } from './chartConfig'

interface Row {
  rank: number
  id: string | null
  name: string | null
  value: string
  badge: string
  sub: React.ReactNode
}

function RecordList({
  title,
  icon,
  rows,
  kind,
}: {
  title: string
  icon: string
  rows: Row[]
  kind: CoverKind
}) {
  return (
    <Card className="rounded-2xl p-gutter">
      <div className="mb-4 flex items-center gap-2">
        <Icon name={icon} className="text-primary" />
        <h3 className="text-headline-md text-on-surface">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-2 text-body-sm text-on-surface-variant">
          Nothing qualifies in this range yet.
        </p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r) => (
            <li
              key={`${r.rank}-${r.id ?? r.name}`}
              className="chart-row flex items-center gap-3 rounded-lg px-2 py-2"
            >
              <div className={`w-6 shrink-0 text-right font-mono font-bold ${rankClass(r.rank)}`}>
                {r.rank}
              </div>
              <CoverImage
                item={{ id: r.id }}
                kind={kind}
                className={`h-10 w-10 ${kind === 'artist' ? 'rounded-full' : 'rounded-md'}`}
                fallbackIcon={kind === 'artist' ? 'artist' : 'music_note'}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-on-surface">{r.name}</div>
                <div className="truncate text-[11px] text-on-surface-variant">{r.sub}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-bold leading-none tabular-nums text-primary">{r.value}</div>
                <div className="mt-0.5 text-[10px] text-on-surface-variant">{r.badge}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

const dim = (s: string) => <span className="opacity-70">{s}</span>

/** "Records" — top-10 superlatives, with their own range selector. */
export function Records({
  range,
  onRange,
  years,
}: {
  range: string
  onRange: (r: string) => void
  years: readonly number[]
}) {
  const query = useApi('/api/metrics/superlatives', { range, limit: 10 }, { keepPrevious: true })
  const d = query.data
  const empty =
    d &&
    !d.obsession.length &&
    !d.binges.length &&
    !d.most_skipped.length &&
    !d.never_skipped.length

  return (
    <section aria-labelledby="records-title" className="space-y-4 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="records-title" className="text-headline-md text-on-surface">
          Records
        </h2>
        <PillTabs
          label="Records range"
          options={rangeOptions(d?.years ?? years)}
          value={range}
          onChange={onRange}
          className="max-w-full gap-1 overflow-x-auto"
        />
      </div>
      {query.isPending ? (
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <Card className="rounded-2xl p-8 text-center text-error">{query.error.message}</Card>
      ) : empty ? (
        <Card className="rounded-2xl p-8 text-center">
          <Icon name="emoji_events" className="text-3xl text-on-surface-variant opacity-40" />
          <p className="mt-2 text-body-lg text-on-surface-variant">
            Nothing to show yet —{' '}
            <Link to="/upload" className="text-primary hover:underline">
              upload your Spotify history
            </Link>
            .
          </p>
        </Card>
      ) : (
        d && (
          <div
            className={`grid grid-cols-1 gap-gutter transition-opacity lg:grid-cols-2 ${query.isPlaceholderData ? 'opacity-60' : ''}`}
          >
            <RecordList
              title="Obsession of the day"
              icon="local_fire_department"
              kind="track"
              rows={d.obsession.map((it) => ({
                rank: it.rank,
                id: it.id,
                name: it.name,
                value: `×${it.count}`,
                badge: 'in a day',
                sub: (
                  <>
                    {it.artist ?? ''}
                    {it.date && <> · {dim(fmtDay(it.date))}</>}
                  </>
                ),
              }))}
            />
            <RecordList
              title="Biggest binges"
              icon="headphones"
              kind="artist"
              rows={d.binges.map((it) => ({
                rank: it.rank,
                id: it.id,
                name: it.name,
                value: fmtMinutesShort(it.minutes),
                badge: 'in one sitting',
                sub: (
                  <>
                    {it.artist_pct}% of the session · {dim(fmtDay(it.date))}
                  </>
                ),
              }))}
            />
            <RecordList
              title="Most skipped"
              icon="skip_next"
              kind="track"
              rows={d.most_skipped.map((it) => ({
                rank: it.rank,
                id: it.id,
                name: it.name,
                value: `${it.skip_pct}%`,
                badge: 'skipped',
                sub: (
                  <>
                    {it.artist ?? ''} · {dim(`${it.plays} plays`)}
                  </>
                ),
              }))}
            />
            <RecordList
              title="Never skipped"
              icon="favorite"
              kind="track"
              rows={d.never_skipped.map((it) => ({
                rank: it.rank,
                id: it.id,
                name: it.name,
                value: it.plays.toLocaleString(),
                badge: 'never skipped',
                sub: it.artist ?? '',
              }))}
            />
          </div>
        )
      )}
    </section>
  )
}
