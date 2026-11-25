import { useFloatingTooltip } from '@/components/FloatingTooltip'
import { pct, plays } from '@/lib/format'

import { Chapter, Panel } from '../Chapter'
import { HelpPopover } from '../HelpPopover'
import { BigWord, ColumnBars, SplitBar, TrackRow } from '../parts'
import { SHADE } from '../tips'
import { useExploreApi } from '../yearFilterContext'
import { CATALOG_REASON } from '../CatalogNotice'

const keyWord = (s: number) =>
  s >= 0.55 ? 'Mostly major' : s >= 0.45 ? 'Even split' : 'Mostly minor'
const splitWord = (w: number) =>
  w >= 55 ? 'Mostly workout' : w <= 45 ? 'Mostly wind-down' : 'Balanced'

export function SoundDetailChapter() {
  const query = useExploreApi('/api/metrics/sound-detail')
  const tip = useFloatingTooltip()
  return (
    <Chapter
      id="sound-detail"
      title="The Detail In Your Sound"
      query={query}
      isEmpty={(d) => !d.tempo.buckets.length}
      emptyReason={() => CATALOG_REASON}
    >
      {(d) => {
        const buckets = d.tempo.buckets
        const big = buckets.reduce((best, b, i) => (b.plays > buckets[best]!.plays ? i : best), 0)
        const major = d.key ? pct(Math.max(0, Math.min(1, d.key.major_share))) : null
        const workout = d.energy_split
          ? pct(Math.max(0, Math.min(1, d.energy_split.workout)))
          : null
        return (
          <>
            <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
              <Panel title="How fast you listen" className="lg:col-span-2">
                <ColumnBars
                  tip={tip}
                  className="h-44"
                  colClass="tempo-col"
                  barClass="tempo-bar"
                  columns={buckets.map((b) => ({
                    label: b.label,
                    value: b.plays,
                    tipTitle: b.label,
                    tipValue: plays(b.plays),
                  }))}
                />
                <div className="mt-4 text-body-sm text-on-surface-variant">
                  Mostly {buckets[big]!.label.toLowerCase()}
                </div>
              </Panel>
              <Panel
                title="Major or minor"
                help={
                  <HelpPopover title="Major vs. minor keys">
                    <p>
                      Major keys sound brighter, minor keys darker. We take the share of plays in
                      major keys.
                    </p>
                    <ul className="help-list">
                      <li>
                        <b>Mostly major</b> — 55% or more in major keys
                      </li>
                      <li>
                        <b>Even split</b> — between 45% and 55%
                      </li>
                      <li>
                        <b>Mostly minor</b> — under 45% major
                      </li>
                    </ul>
                  </HelpPopover>
                }
              >
                {major != null ? (
                  <>
                    <BigWord className="mt-5">{keyWord(d.key!.major_share)}</BigWord>
                    <SplitBar
                      segments={[
                        { pct: major, shade: SHADE.solid, label: 'major' },
                        { pct: 100 - major, shade: SHADE.faint, label: 'minor' },
                      ]}
                    />
                    <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
                      <span>{major}% major</span>
                      <span>{100 - major}% minor</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-5 text-body-sm text-on-surface-variant">
                    No key data for these tracks.
                  </p>
                )}
              </Panel>
            </div>
            <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
              <Panel title="Most danceable">
                <p className="mb-3 text-body-sm text-on-surface-variant">Your grooviest songs.</p>
                {d.danceable.length ? (
                  <div className="space-y-1.5">
                    {d.danceable.slice(0, 4).map((t) => (
                      <TrackRow
                        key={t.id}
                        id={t.id}
                        name={t.name}
                        sub={t.artist}
                        right={
                          <span className="font-mono text-[11px] text-primary">
                            {pct(t.danceability)}%
                          </span>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-body-sm text-on-surface-variant">No danceable tracks yet.</p>
                )}
              </Panel>
              <Panel title="Workout or wind-down">
                {workout != null ? (
                  <>
                    <BigWord className="mt-5">{splitWord(workout)}</BigWord>
                    <SplitBar
                      segments={[
                        { pct: workout, shade: SHADE.solid, label: 'workout' },
                        { pct: 100 - workout, shade: SHADE.faint, label: 'wind-down' },
                      ]}
                    />
                    <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
                      <span>{workout}% workout</span>
                      <span>{100 - workout}% wind-down</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-5 text-body-sm text-on-surface-variant">
                    No energy data for these tracks.
                  </p>
                )}
              </Panel>
            </div>
            {tip.node}
          </>
        )
      }}
    </Chapter>
  )
}
