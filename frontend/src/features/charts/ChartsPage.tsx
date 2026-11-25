import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Icon } from '@/components/Icon'
import { PillTabs } from '@/components/PillTabs'

import { DEPTHS, ENTITIES, rangeLabel, rangeOptions, type Entity, type Sort } from './chartConfig'
import { Leaderboard } from './Leaderboard'
import { Records } from './Records'

const ShareDeck = lazy(() => import('./share/ShareDeck'))

const ENTITY_KEYS = Object.keys(ENTITIES) as Entity[]
const isEntity = (v: string | null): v is Entity => !!v && v in ENTITIES

/** Charts: numbered leaderboards + records. View state lives in the URL so a
 * chart can be bookmarked or shared (?entity=track&range=2024&sort=streams). */
export default function ChartsPage() {
  const [params, setParams] = useSearchParams()
  const entity: Entity = isEntity(params.get('entity'))
    ? (params.get('entity') as Entity)
    : 'artist'
  const sort: Sort = params.get('sort') === 'streams' ? 'streams' : 'minutes'
  const range = params.get('range') ?? 'all'
  const depth = Number(params.get('top')) || 10
  const recordsRange = params.get('records') ?? 'all'
  const [years, setYears] = useState<number[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sharing, setSharing] = useState(false)

  const set = useCallback(
    (key: string, value: string, fallback: string) =>
      setParams(
        (p) => {
          if (value === fallback) p.delete(key)
          else p.set(key, value)
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 140)
    return () => clearTimeout(t)
  }, [searchInput])

  return (
    <main className="relative mx-auto w-full max-w-[1440px] flex-grow space-y-6 px-container-padding-mobile pb-12 pt-24 md:px-container-padding-desktop">
      <div
        aria-hidden
        className="pointer-events-none absolute left-10 top-1/4 -z-10 h-72 w-72 rounded-full bg-primary/10 blur-[120px]"
      />

      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <PillTabs
          label="Chart type"
          variant="chart-tab"
          value={entity}
          onChange={(v) => set('entity', v, 'artist')}
          className="w-max self-start border border-hairline"
          buttonClassName="px-4 py-1.5"
          options={ENTITY_KEYS.map((e) => ({
            value: e,
            label: (
              <>
                <Icon name={ENTITIES[e].icon} className="text-sm" /> {ENTITIES[e].label}
              </>
            ),
          }))}
        />
        <div className="relative w-full self-start sm:w-72 lg:self-auto">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Find your rank…"
            aria-label={`Find a ${ENTITIES[entity].label.toLowerCase().slice(0, -1)} in your chart`}
            autoComplete="off"
            className="w-full rounded-full border border-hairline bg-surface-container-high py-2 pl-10 pr-9 text-body-sm text-on-surface transition-colors placeholder:text-on-surface-variant/60 focus:border-primary/50 focus:outline-none"
          />
          {searchInput && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchInput('')
                setSearch('')
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
            >
              <Icon name="close" className="text-lg" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <PillTabs
          label="Time range"
          value={range}
          onChange={(v) => set('range', v, 'all')}
          options={rangeOptions(years)}
          className="max-w-full gap-1 overflow-x-auto"
        />
        <div className="flex flex-wrap items-center gap-3">
          <PillTabs
            label="Rank by"
            variant="chart-sort"
            value={sort}
            onChange={(v) => set('sort', v, 'minutes')}
            className="border border-hairline"
            options={[
              { value: 'minutes', label: 'Minutes' },
              { value: 'streams', label: 'Streams' },
            ]}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-label-bold uppercase tracking-wider text-on-surface-variant">
              Top
            </span>
            <PillTabs
              label="How many"
              variant="depth-btn"
              value={depth}
              onChange={(v) => set('top', String(v), '10')}
              className="border border-hairline"
              buttonClassName="px-3 py-1.5"
              options={DEPTHS.map((d) => ({ value: d, label: d }))}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-headline-md tracking-tight text-on-surface">
            Top {ENTITIES[entity].label}
          </h1>
          <span className="text-label-bold uppercase tracking-wider text-on-surface-variant">
            {rangeLabel(range)} · by {sort}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSharing(true)}
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-body-sm font-bold text-on-primary transition-all hover:scale-105 active:scale-95"
        >
          <Icon name="ios_share" className="text-base" /> Share
        </button>
      </div>

      <Leaderboard
        entity={entity}
        sort={sort}
        range={range}
        depth={depth}
        search={search}
        years={years}
        onYears={setYears}
      />
      <Records range={recordsRange} onRange={(r) => set('records', r, 'all')} years={years} />

      {sharing && (
        <Suspense fallback={null}>
          <ShareDeck years={years} onClose={() => setSharing(false)} />
        </Suspense>
      )}
    </main>
  )
}
