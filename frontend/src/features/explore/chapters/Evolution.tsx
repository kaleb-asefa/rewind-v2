import type { Schemas } from '@/api/types'
import { useFloatingTooltip } from '@/components/FloatingTooltip'
import { Icon } from '@/components/Icon'

import { AreaLine } from '../AreaLine'
import { Chapter, Panel } from '../Chapter'
import { BigWord } from '../parts'
import { hoverTip, type Tip } from '../tips'
import { useExploreApi } from '../yearFilterContext'
import { CATALOG_REASON } from '../CatalogNotice'

const GENRE_SHADES = [
  'var(--genre-1)',
  'var(--genre-2)',
  'var(--genre-3)',
  'var(--genre-4)',
  'var(--genre-5)',
  'var(--genre-6)',
]

const drift = <T,>(pts: T[], f: (p: T) => number) =>
  pts.length < 2 ? 0 : f(pts.at(-1)!) - f(pts[0]!)
const moodWord = (pts: Schemas['MoodPoint'][]) => {
  const d = drift(pts, (p) => p.valence)
  return d >= 0.05 ? 'Happier' : d <= -0.05 ? 'Moodier' : 'Steady'
}
const mainstreamTrendWord = (pts: Schemas['PopularityPoint'][]) => {
  const d = drift(pts, (p) => p.popularity)
  return d >= 0.05 ? 'Going mainstream' : d <= -0.05 ? 'Going niche' : 'Steady'
}
const energyWord = (e: number) => (e >= 0.6 ? 'Energetic' : e >= 0.4 ? 'Easy' : 'Calm')

/** 100%-stacked genre columns per period. */
function GenreColumns({ evo, tip }: { evo: Schemas['GenreEvolution']; tip: Tip }) {
  const { periods, genres } = evo
  const W = 320
  const H = 176
  const padX = 6
  const padTop = 8
  const padBottom = 24
  const plotH = H - padTop - padBottom
  const colW = (W - padX * 2) / periods.length
  const barW = Math.min(46, colW * 0.62)
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 h-auto w-full"
        role="img"
        aria-label="Genre share by period"
      >
        {periods.map((period, j) => {
          const x = padX + j * colW + (colW - barW) / 2
          const total = genres.reduce((s, g) => s + (g.shares[j] ?? 0), 0) || 1
          let y = padTop + plotH
          return (
            <g key={period}>
              {genres.map((g, i) => {
                const share = (g.shares[j] ?? 0) / total
                const h = share * plotH
                y -= h
                return (
                  <rect
                    key={g.name}
                    className="genre-evo-seg"
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(0, h)}
                    fill={GENRE_SHADES[i % GENRE_SHADES.length]}
                    {...hoverTip(tip, g.name, `${period} · ${Math.round(share * 100)}%`)}
                  />
                )
              })}
              <text
                x={x + barW / 2}
                y={H - 8}
                fill="var(--axis-label)"
                fontSize="10"
                textAnchor="middle"
              >
                {period}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-on-surface-variant">
        {genres.map((g, i) => (
          <span key={g.name} className="inline-flex items-center gap-1.5">
            <span
              className="h-[9px] w-[9px] rounded-[3px]"
              style={{ background: GENRE_SHADES[i % GENRE_SHADES.length] }}
            />
            {g.name}
          </span>
        ))}
      </div>
    </>
  )
}

export function EvolutionChapter() {
  const query = useExploreApi('/api/metrics/evolution')
  const tip = useFloatingTooltip()
  return (
    <Chapter
      id="evolution"
      title="How Your Taste Changes"
      query={query}
      isEmpty={(d) => !d.genre_evolution.genres.length}
      emptyReason={() => CATALOG_REASON}
    >
      {(d) => (
        <>
          <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
            <Panel title="Genre mix" className="lg:col-span-2">
              <GenreColumns evo={d.genre_evolution} tip={tip} />
            </Panel>
            <Panel title="Mood drift">
              <BigWord className="mt-5">
                {d.mood_trend.length ? moodWord(d.mood_trend) : '—'}
              </BigWord>
              <div className="text-body-sm text-on-surface-variant">positivity over time</div>
              <AreaLine
                values={d.mood_trend.map((p) => p.valence)}
                width={200}
                height={72}
                fill="flat"
                tip={tip}
                className="mt-auto h-auto w-full pt-6"
                label="Positivity over time"
                tipFor={(i) => [
                  d.mood_trend[i]!.period,
                  `${Math.round(d.mood_trend[i]!.valence * 100)}% positive`,
                ]}
              />
            </Panel>
          </div>
          <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
            <Panel title="Day vs night">
              <p className="text-body-sm text-on-surface-variant">
                How your sound changes by hour.
              </p>
              <div className="mt-5 flex gap-4">
                {[
                  {
                    icon: 'wb_sunny',
                    label: 'Mornings',
                    energy: d.day_night?.morning?.energy ?? 0,
                  },
                  {
                    icon: 'bedtime',
                    label: 'Late nights',
                    energy: d.day_night?.night?.energy ?? 0,
                  },
                ].map((p) => (
                  <div key={p.label} className="min-w-0 flex-1">
                    <div className="mb-3 flex items-center gap-2">
                      <Icon name={p.icon} className="text-lg text-primary" />
                      <span className="text-body-sm text-on-surface">{p.label}</span>
                    </div>
                    <div className="text-display-lg-mobile leading-tight text-primary">
                      {energyWord(p.energy)}
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.round(Math.max(0, Math.min(1, p.energy)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel
              title="Mainstream"
              aside={
                <span className="text-label-bold uppercase tracking-wider text-primary">
                  {d.mainstream_trend.length ? mainstreamTrendWord(d.mainstream_trend) : '—'}
                </span>
              }
            >
              <AreaLine
                values={d.mainstream_trend.map((p) => p.popularity)}
                width={200}
                height={72}
                fill="flat"
                tip={tip}
                className="mt-auto h-auto w-full pt-6"
                label="How mainstream your listening was over time"
                tipFor={(i) => [
                  d.mainstream_trend[i]!.period,
                  `${Math.round(d.mainstream_trend[i]!.popularity * 100)}% popular`,
                ]}
              />
            </Panel>
          </div>
          {tip.node}
        </>
      )}
    </Chapter>
  )
}
