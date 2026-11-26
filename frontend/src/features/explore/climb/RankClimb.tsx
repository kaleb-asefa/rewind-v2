import { useCallback, useEffect, useMemo, useState } from 'react'

import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { PillTabs } from '@/components/PillTabs'
import { CoverImage } from '@/covers/CoverImage'
import { primeCoverUrls } from '@/covers/coverCache'
import { useFullscreen, useInView, useRafLoop } from '@/lib/hooks'

import { useExploreApi } from '../yearFilterContext'
import {
  LAYOUT,
  SLOTS,
  SVG_H,
  SVG_W,
  isMonthStart,
  isYearStart,
  linePath,
  periodLabel,
  periodX,
  rankAt,
  rankY,
  shortPeriod,
  windowBounds,
  type Speed,
} from './climbMath'
import { Playback } from './Playback'

type Category = 'tracks' | 'artists'
const SECONDS_PER_PERIOD = 0.3

interface Line {
  key: string
  title: string
  ranks: number[]
  cover: {
    id: string | null
    cover_kind?: 'artist' | 'album' | 'track' | null
    cover_id?: string | null
    image_url?: string | null
  }
}

/** "The Climb": weekly rank trajectories of your top 8, with a sliding camera. */
export function RankClimb() {
  const [category, setCategory] = useState<Category>('tracks')
  const tracks = useExploreApi('/api/metrics/track-rank', { limit: 8 })
  const artists = useExploreApi('/api/metrics/artist-rank', { limit: 8 })
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>(0.5)
  const [cardRef, isFull, toggleFull] = useFullscreen<HTMLDivElement>()
  const [viewRef, inView] = useInView<HTMLDivElement>({ once: false })

  const active = category === 'tracks' ? tracks : artists
  const periods = useMemo(() => active.data?.months ?? [], [active.data])
  const lines: Line[] = useMemo(() => {
    if (category === 'tracks') {
      return (tracks.data?.data ?? []).map((t, i) => ({
        key: `t${i}`,
        title: t.track_name,
        ranks: t.monthly_ranks,
        cover: t,
      }))
    }
    return (artists.data?.data ?? []).map((a, i) => ({
      key: `a${i}`,
      title: a.artist_name,
      ranks: a.monthly_ranks,
      cover: a,
    }))
  }, [category, tracks.data, artists.data])

  useEffect(() => {
    primeCoverUrls('track', tracks.data?.data)
    primeCoverUrls('artist', artists.data?.data)
  }, [tracks.data, artists.data])

  // New data or a new category restarts from the beginning: progress is keyed
  // to the dataset, so a stale position is simply ignored.
  const dataKey = `${category}|${periods[0] ?? ''}|${periods.length}`
  const [pos, setPos] = useState({ key: '', p: 0 })
  const progress = pos.key === dataKey ? pos.p : 0
  const setProgress = useCallback(
    (next: number | ((p: number) => number)) =>
      setPos((s) => {
        const cur = s.key === dataKey ? s.p : 0
        return { key: dataKey, p: typeof next === 'function' ? next(cur) : next }
      }),
    [dataKey],
  )

  const maxP = Math.max(0, periods.length - 1)
  useRafLoop(
    useCallback(
      (dt: number) =>
        setProgress((p) => {
          const next = p + (dt / 1000 / SECONDS_PER_PERIOD) * speed
          return next >= maxP ? 0 : next
        }),
      [speed, maxP, setProgress],
    ),
    playing && inView && maxP > 0,
  )

  const { start: winStart, end: winEnd } = windowBounds(progress, periods.length)
  const tipX = (periodX(progress, winStart) / SVG_W) * 100
  const { PADDING_LEFT: L, PADDING_RIGHT: R, PADDING_TOP: T, PADDING_BOTTOM: B } = LAYOUT
  const visible: number[] = []
  for (
    let m = Math.max(0, Math.floor(winStart) - 1);
    m <= Math.min(periods.length - 1, Math.ceil(winEnd) + 1);
    m++
  )
    visible.push(m)
  const empty = !active.isPending && (!periods.length || !lines.length)

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h3 className="text-headline-md tracking-tight text-on-surface">Rank Velocity Over Time</h3>
        <PillTabs
          label="Rank what"
          variant="chart-tab"
          value={category}
          onChange={(c) => {
            setCategory(c)
            setPlaying(false)
          }}
          className="self-start border border-hairline sm:self-auto"
          buttonClassName="px-4 py-1.5"
          options={[
            {
              value: 'tracks',
              label: (
                <>
                  <Icon name="music_note" className="text-sm" /> Top 8 Tracks
                </>
              ),
            },
            {
              value: 'artists',
              label: (
                <>
                  <Icon name="artist" className="text-sm" /> Top 8 Artists
                </>
              ),
            },
          ]}
        />
      </div>
      <Card
        ref={cardRef}
        className={`glass-card--animated relative overflow-hidden rounded-2xl p-4 shadow-xl transition-all duration-300 md:p-6 ${active.isPlaceholderData ? 'chapter-busy' : ''}`}
      >
        <Playback
          playing={playing}
          onToggle={() => setPlaying((p) => !p)}
          onReset={() => setProgress(0)}
          label={periodLabel(periods, Math.min(Math.floor(progress), maxP))}
          progress={progress}
          max={maxP}
          step={0.05}
          onScrub={setProgress}
          startLabel={periods[0]?.slice(0, 4) ?? '----'}
          endLabel={periods.at(-1)?.slice(0, 4) ?? '----'}
          speed={speed}
          onSpeed={setSpeed}
          fullscreen={isFull}
          onFullscreen={toggleFull}
        />
        <div
          ref={viewRef}
          className={`relative w-full select-none overflow-hidden ${isFull ? 'h-[calc(100vh-140px)]' : 'h-[440px]'}`}
        >
          <svg
            className="h-full w-full overflow-visible"
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Weekly rank of your top 8 ${category} over time`}
          >
            <defs>
              {/* Grid + month labels: clipped horizontally only. */}
              <clipPath id="climb-clip-x">
                <rect x={L - 5} y="0" width={SVG_W - L - R + 5} height={SVG_H} />
              </clipPath>
              {/* Lines: also clipped to the ranked area (entries rise from just below #8). */}
              <clipPath id="climb-clip">
                <rect
                  x={L - 5}
                  y={rankY(1) - 8}
                  width={SVG_W - L - R + 5}
                  height={rankY(SLOTS + 0.6) - rankY(1) + 8}
                />
              </clipPath>
            </defs>
            {Array.from({ length: SLOTS }, (_, i) => i + 1).map((r) => (
              <g key={r}>
                <line
                  x1={L}
                  y1={rankY(r)}
                  x2={SVG_W - R + 20}
                  y2={rankY(r)}
                  stroke={r === 1 ? 'rgba(var(--accent-rgb), 0.25)' : 'var(--grid-line)'}
                  strokeWidth={r === 1 ? 1.5 : 1}
                  strokeDasharray={r === 1 ? undefined : '4 4'}
                />
                <text
                  x={L - 12}
                  y={rankY(r) + 4}
                  textAnchor="end"
                  fill={r === 1 ? 'rgb(var(--accent-rgb))' : 'var(--axis-label)'}
                  fontSize="10"
                  fontWeight={r === 1 ? 800 : 600}
                  fontFamily="Space Mono, monospace"
                >
                  #{r}
                </text>
              </g>
            ))}
            <g clipPath="url(#climb-clip-x)">
              {visible.map((m) => {
                const x = periodX(m, winStart)
                if (x < L - 30 || x > SVG_W - R + 30) return null
                const ys = isYearStart(periods, m)
                const ms = isMonthStart(periods, m)
                return (
                  <g key={m}>
                    <line
                      x1={x}
                      y1={T - 10}
                      x2={x}
                      y2={SVG_H - B + 5}
                      stroke={
                        ys
                          ? 'rgba(var(--accent-rgb), 0.25)'
                          : ms
                            ? 'var(--grid-line-strong)'
                            : 'var(--grid-line)'
                      }
                      strokeWidth={ys ? 1.5 : 1}
                    />
                    {ms && (
                      <text
                        x={x}
                        y={SVG_H - B + 20}
                        textAnchor="middle"
                        fill={ys ? 'rgb(var(--accent-rgb))' : 'var(--axis-label)'}
                        fontSize={ys ? 11 : 10}
                        fontWeight={ys ? 800 : 700}
                        fontFamily="Space Mono, monospace"
                      >
                        {shortPeriod(periods, m)}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
            <g clipPath="url(#climb-clip)">
              {lines.map((line) =>
                Math.round(rankAt(line.ranks, progress)) > SLOTS ? null : (
                  <path
                    key={line.key}
                    d={linePath(line.ranks, progress, winStart)}
                    stroke="rgb(var(--accent-rgb))"
                    className="rank-path"
                  />
                ),
              )}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0">
            {lines.map((line) => {
              const rank = rankAt(line.ranks, progress)
              const shown = Math.round(rank)
              if (shown > SLOTS) return null
              const first = shown === 1
              return (
                <div
                  key={line.key}
                  className="tip-container"
                  style={{ left: `${tipX}%`, top: `${(rankY(rank) / SVG_H) * 100}%` }}
                >
                  <div
                    className="tip-avatar-ring"
                    style={{ border: '2px solid rgb(var(--accent-rgb))' }}
                  >
                    {first && <div className="pulse-ring" />}
                    <CoverImage
                      item={line.cover}
                      kind={category === 'tracks' ? 'track' : 'artist'}
                      className="h-full w-full rounded-full"
                    />
                    <div
                      className="rank-badge-pill"
                      style={{
                        borderColor: 'rgb(var(--accent-rgb))',
                        color: first ? 'rgb(var(--accent-rgb))' : 'var(--chip-fg)',
                      }}
                    >
                      #{shown}
                    </div>
                  </div>
                  <div className="tip-title-tag">{line.title}</div>
                </div>
              )
            })}
            {empty && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-body-sm font-medium text-on-surface-variant">
                <Icon name="info" className="text-3xl text-primary opacity-80" />
                <span>No listening rank data for this period.</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
