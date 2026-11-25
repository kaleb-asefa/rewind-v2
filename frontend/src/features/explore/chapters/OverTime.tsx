import { useState } from 'react'

import type { Schemas } from '@/api/types'
import { useFloatingTooltip } from '@/components/FloatingTooltip'
import { pct } from '@/lib/format'

import { AreaLine } from '../AreaLine'
import { Chapter, Panel } from '../Chapter'
import { BigWord, SplitBar, TrackRow } from '../parts'
import { SHADE } from '../tips'
import { useExploreApi } from '../yearFilterContext'

const ageWord = (share: number) => (share >= 0.6 ? 'Fresh' : share >= 0.35 ? 'A mix' : 'Throwback')

function nostalgiaWord(points: Schemas['NostalgiaPoint'][]) {
  if (points.length < 2) return 'Steady'
  const drift = points.at(-1)!.avg_year - points[0]!.avg_year
  return drift >= 2 ? 'Going newer' : drift <= -2 ? 'Going older' : 'Steady'
}

function Highlight({
  label,
  name,
  sub,
  id,
  kind,
}: {
  label: string
  name: string | null
  sub?: string | null
  id: string | null
  kind: 'artist' | 'track'
}) {
  return (
    <TrackRow
      id={id}
      kind={kind}
      name={
        <>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            {label}
          </span>
          {name ?? '—'}
        </>
      }
      sub={sub || undefined}
    />
  )
}

function YearHighlights({ years }: { years: Schemas['YearHighlights'][] }) {
  const [active, setActive] = useState<number | null>(null)
  const current = years.find((y) => y.year === active) ?? years.at(-1)!
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-headline-md text-on-surface">Your years</h3>
        <div
          className="flex flex-wrap items-center gap-1 rounded-full bg-surface-container-high p-1"
          role="group"
          aria-label="Year"
        >
          {years.map((y) => (
            <button
              key={y.year}
              type="button"
              aria-pressed={y.year === current.year}
              onClick={() => setActive(y.year)}
              className={`year-tab whitespace-nowrap rounded-full px-3 py-1 text-label-bold ${y.year === current.year ? 'year-tab--active' : ''}`}
            >
              {y.year}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-auto space-y-1.5 pt-7">
        <Highlight
          label="Top artist"
          name={current.top_artist.name}
          id={current.top_artist.id}
          kind="artist"
        />
        <Highlight
          label="Top track"
          name={current.top_track.name}
          sub={current.top_track.artist}
          id={current.top_track.id}
          kind="track"
        />
        <Highlight
          label="Song of summer"
          name={current.summer_track.name}
          sub={current.summer_track.artist}
          id={current.summer_track.id}
          kind="track"
        />
      </div>
    </>
  )
}

export function OverTimeChapter() {
  const query = useExploreApi('/api/metrics/over-time')
  const tip = useFloatingTooltip()
  return (
    <Chapter
      id="over-time"
      title="Your Music, Over Time"
      query={query}
      isEmpty={(d) => !d.years.length}
    >
      {(d) => {
        const fresh = pct(Math.max(0, Math.min(1, d.music_age?.fresh_share ?? 0)))
        const machine = d.time_machine
        return (
          <>
            <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
              <Panel className="lg:col-span-2">
                <div className="flex min-h-[230px] flex-col">
                  <YearHighlights years={d.years} />
                </div>
              </Panel>
              <Panel title="Music age">
                {d.music_age ? (
                  <>
                    <BigWord className="mt-5">{ageWord(d.music_age.fresh_share)}</BigWord>
                    <SplitBar
                      segments={[
                        { pct: fresh, shade: SHADE.solid, label: 'new releases' },
                        { pct: 100 - fresh, shade: SHADE.faint, label: 'catalog' },
                      ]}
                    />
                    <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
                      <span>{fresh}% new releases</span>
                      <span>{100 - fresh}% catalog</span>
                    </div>
                    <div className="pt-7 text-body-sm text-on-surface-variant">
                      Average release year{' '}
                      <span className="font-semibold text-on-surface">{d.music_age.avg_year}</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-5 text-body-sm text-on-surface-variant">
                    Release years need the music catalog.
                  </p>
                )}
              </Panel>
            </div>
            <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
              <Panel title="Time machine">
                <p className="mb-3 text-body-sm text-on-surface-variant">
                  The oldest and newest songs you played.
                </p>
                {machine ? (
                  <div className="space-y-1.5">
                    {(['oldest', 'newest'] as const).map((k) => (
                      <TrackRow
                        key={k}
                        id={machine[k].id}
                        name={
                          <>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                              {k === 'oldest' ? 'Oldest' : 'Newest'}
                            </span>
                            {machine[k].name ?? '—'}
                          </>
                        }
                        sub={machine[k].artist}
                        right={
                          <span className="font-mono text-[11px] text-primary">
                            {machine[k].year}
                          </span>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-body-sm text-on-surface-variant">No release years yet.</p>
                )}
              </Panel>
              <Panel
                title="Nostalgia"
                aside={
                  <span className="text-label-bold uppercase tracking-wider text-primary">
                    {d.nostalgia.length ? nostalgiaWord(d.nostalgia) : '—'}
                  </span>
                }
              >
                <AreaLine
                  values={d.nostalgia.map((p) => p.avg_year)}
                  width={320}
                  height={110}
                  pad={10}
                  tip={tip}
                  className="mt-6 h-auto w-full"
                  label="Average release year of what you played, over time"
                  tipFor={(i) => [
                    d.nostalgia[i]!.period,
                    `Avg release ${d.nostalgia[i]!.avg_year}`,
                  ]}
                />
              </Panel>
            </div>
            {tip.node}
          </>
        )
      }}
    </Chapter>
  )
}
