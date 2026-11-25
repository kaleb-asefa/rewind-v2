import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'

import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { PillTabs } from '@/components/PillTabs'
import { CoverImage } from '@/covers/CoverImage'
import { primeCoverUrls } from '@/covers/coverCache'
import { useFullscreen, useInView, useRafLoop } from '@/lib/hooks'

import { useExploreApi, useYearFilter } from '../yearFilterContext'
import { niceStep, type Speed } from './climbMath'
import { Playback } from './Playback'
import { VISIBLE_N, initialRace, raceReducer, standings } from './raceState'

type Entity = 'artist' | 'track' | 'album'
const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
]
const RACE_COLORS = Array.from({ length: 8 }, (_, i) => `var(--race-${i + 1})`)
const LEFT_PAD = 30 // rank-number gutter
const RIGHT_PAD = 130 // room for the value label
const AXIS_TOP = 18
const GAP = 8

function monthLabel(months: readonly string[], idx: number) {
  if (!months.length) return '----'
  const s = months[Math.min(Math.max(0, Math.round(idx)), months.length - 1)]!
  return `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`
}

/** Cumulative-minutes bar race; the final frame is the all-time leaderboard. */
export function BarRace() {
  const { year } = useYearFilter()
  const [entity, setEntity] = useState<Entity>('artist')
  const query = useExploreApi('/api/metrics/bar-race', { entity, limit: 12 })
  const items = useMemo(() => query.data?.data ?? [], [query.data])
  const months = useMemo(() => query.data?.months ?? [], [query.data])
  const cums = useMemo(() => items.map((it) => it.cumulative_minutes), [items])
  const [state, dispatch] = useReducer(raceReducer, initialRace)
  const [speed, setSpeed] = useState<Speed>(0.5)
  const [cardRef, isFull, toggleFull] = useFullscreen<HTMLDivElement>()
  const [viewRef, inView] = useInView<HTMLDivElement>({ once: false })
  const [width, setWidth] = useState(800)
  const [viewportH, setViewportH] = useState(800)

  useEffect(() => {
    dispatch({ type: 'load', count: items.length })
    primeCoverUrls(entity, items)
  }, [items, entity])

  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width))
    ro.observe(el)
    const onResize = () => setViewportH(window.innerHeight)
    onResize()
    window.addEventListener('resize', onResize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [viewRef])

  useRafLoop(
    useCallback((dt: number) => dispatch({ type: 'tick', dt, cums, speed }), [cums, speed]),
    inView && items.length > 0 && (state.playing || !state.settled),
  )

  // Rows grow in fullscreen so the race fills the screen.
  const lane = isFull ? Math.max(44, Math.floor((viewportH - 200) / VISIBLE_N)) : 44
  const barH = Math.round(lane * 0.6)
  const avatar = Math.round(lane * 0.78)
  const usable = Math.max(50, width - RIGHT_PAD - LEFT_PAD)
  const { values, slotOf } = standings(cums, state.progress)
  const axisMax = state.axisMax || 1
  const step = niceStep(axisMax / 6)
  const ticks: number[] = []
  for (let v = step; v <= axisMax && ticks.length < 10; v += step) ticks.push(v)
  const maxP = Math.max(0, months.length - 1)
  const watermark =
    months[Math.min(Math.max(0, Math.round(state.progress)), maxP)]?.slice(0, 4) ?? '----'

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-headline-md tracking-tight text-on-surface">
            {year ? `${year} Bar Race` : 'All-Time Bar Race'}
          </h3>
          <p className="text-body-sm text-on-surface-variant">
            Cumulative listening time — the final frame is your{' '}
            {year ? `#1 of ${year}` : 'all-time #1'}.
          </p>
        </div>
        <PillTabs
          label="Race what"
          variant="chart-tab"
          value={entity}
          onChange={setEntity}
          className="self-start border border-hairline sm:self-auto"
          buttonClassName="px-4 py-1.5"
          options={[
            {
              value: 'artist',
              label: (
                <>
                  <Icon name="artist" className="text-sm" /> Artists
                </>
              ),
            },
            {
              value: 'track',
              label: (
                <>
                  <Icon name="music_note" className="text-sm" /> Tracks
                </>
              ),
            },
            {
              value: 'album',
              label: (
                <>
                  <Icon name="album" className="text-sm" /> Albums
                </>
              ),
            },
          ]}
        />
      </div>
      <Card
        ref={cardRef}
        className={`relative overflow-hidden rounded-2xl p-4 shadow-xl md:p-6 ${query.isPlaceholderData ? 'chapter-busy' : ''}`}
      >
        <Playback
          playing={state.playing}
          onToggle={() => dispatch({ type: 'toggle', maxP })}
          onReset={() => dispatch({ type: 'reset' })}
          label={monthLabel(months, state.progress)}
          progress={state.progress}
          max={maxP}
          step={0.02}
          onScrub={(p) => dispatch({ type: 'scrub', progress: p })}
          startLabel={months[0]?.slice(0, 4) ?? '----'}
          endLabel={months.at(-1)?.slice(0, 4) ?? '----'}
          speed={speed}
          onSpeed={setSpeed}
          fullscreen={isFull}
          onFullscreen={toggleFull}
        />
        <div
          ref={viewRef}
          className="relative w-full select-none"
          style={{ height: VISIBLE_N * lane + AXIS_TOP }}
        >
          {!items.length || !months.length ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-body-sm font-medium text-on-surface-variant">
              <Icon name="info" className="text-3xl text-primary opacity-80" />
              <span>{query.isPending ? 'Loading…' : 'No listening data for this period.'}</span>
            </div>
          ) : (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-1 right-3 z-0 font-mono font-extrabold leading-none text-primary/10"
                style={{ fontSize: 80 }}
              >
                {watermark}
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-0 z-[5]">
                {ticks.map((v, i) => {
                  const x = LEFT_PAD + (v / axisMax) * usable
                  return (
                    <div key={i}>
                      <div
                        className="absolute w-px bg-[var(--grid-line)]"
                        style={{ left: x, top: AXIS_TOP, height: VISIBLE_N * lane }}
                      />
                      <div
                        className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-[var(--axis-label)]"
                        style={{ left: x }}
                      >
                        {v.toLocaleString()}
                        {i === ticks.length - 1 ? ' min' : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
              <ol
                className="relative z-10 h-full w-full"
                aria-label={`Standings at ${monthLabel(months, state.progress)}`}
              >
                {items.map((it, i) => {
                  const opacity = state.opacity[i] ?? 0
                  const y = AXIS_TOP + (state.slot[i] ?? VISIBLE_N) * lane
                  const barW = Math.max(2, ((values[i] ?? 0) / axisMax) * usable)
                  const avatarLeft = Math.min(
                    Math.max(LEFT_PAD + barW - avatar / 2, LEFT_PAD),
                    width - avatar,
                  )
                  return (
                    <li
                      key={`${it.name}|${it.artist_name ?? ''}`}
                      aria-hidden={opacity < 0.5}
                      className="absolute inset-x-0 top-0"
                      style={{
                        height: lane,
                        transform: `translateY(${y.toFixed(2)}px)`,
                        opacity,
                        visibility: opacity < 0.01 ? 'hidden' : undefined,
                      }}
                    >
                      <div
                        className="absolute left-0 top-0 flex items-center justify-end font-mono text-xs font-bold text-[var(--axis-label)]"
                        style={{ width: LEFT_PAD - 6, height: lane }}
                      >
                        {(slotOf[i] ?? VISIBLE_N) + 1}
                      </div>
                      <div
                        className="absolute rounded-full"
                        style={{
                          left: LEFT_PAD,
                          top: (lane - barH) / 2,
                          height: barH,
                          width: barW,
                          background: RACE_COLORS[i % RACE_COLORS.length],
                          boxShadow: 'var(--bar-shadow)',
                        }}
                      />
                      <div
                        className="absolute top-0 flex items-center justify-end overflow-hidden whitespace-nowrap pr-1.5 text-[13px] font-bold text-[var(--emphasis)]"
                        style={{
                          left: LEFT_PAD,
                          height: lane,
                          width: Math.max(0, avatarLeft - GAP - LEFT_PAD),
                          textShadow: 'var(--text-halo)',
                        }}
                      >
                        {it.name}
                        {it.artist_name && (
                          <span className="font-normal opacity-70">&nbsp;· {it.artist_name}</span>
                        )}
                      </div>
                      <div
                        className="absolute overflow-hidden rounded-full border-2 border-[var(--card-border)]"
                        style={{
                          top: (lane - avatar) / 2,
                          left: avatarLeft,
                          width: avatar,
                          height: avatar,
                          boxShadow: 'var(--pill-shadow)',
                        }}
                      >
                        <CoverImage
                          item={it}
                          kind={entity}
                          className="h-full w-full rounded-full"
                          fallbackIcon={entity === 'artist' ? 'person' : 'music_note'}
                        />
                      </div>
                      <div
                        className="absolute top-0 flex items-center whitespace-nowrap font-mono text-xs font-bold text-on-surface"
                        style={{ left: avatarLeft + avatar + GAP, height: lane }}
                      >
                        {Math.round(values[i] ?? 0).toLocaleString()} min
                      </div>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
