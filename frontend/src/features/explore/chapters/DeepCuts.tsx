import { pct } from '@/lib/format'

import { Chapter, Panel } from '../Chapter'
import { BigWord, SplitBar, TrackRow } from '../parts'
import { SHADE } from '../tips'
import { useExploreApi } from '../yearFilterContext'

const concentrationWord = (s: number) =>
  s >= 0.6 ? 'Devoted' : s >= 0.4 ? 'Balanced' : 'Far-reaching'
const albumWord = (s: number) => (s >= 0.5 ? 'Album lover' : s >= 0.25 ? 'A mix' : 'Single picker')

export function DeepCutsChapter() {
  const query = useExploreApi('/api/metrics/deep-cuts')
  return (
    <Chapter id="deep-cuts" title="Your Deep Cuts" query={query} isEmpty={(d) => !d.concentration}>
      {(d) => {
        const top = pct(Math.max(0, Math.min(1, d.concentration?.top10_share ?? 0)))
        const deep = d.album_commitment
          ? pct(Math.max(0, Math.min(1, d.album_commitment.deep_share)))
          : null
        return (
          <>
            <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
              <Panel title="Your inner circle" className="lg:col-span-2">
                <div className="flex min-h-[180px] flex-col">
                  <BigWord className="mt-5">
                    {concentrationWord(d.concentration?.top10_share ?? 0)}
                  </BigWord>
                  <div className="mt-1 text-body-sm text-on-surface-variant">
                    Top 10 artists = <span className="font-semibold text-on-surface">{top}</span>%
                    of all plays
                  </div>
                  <SplitBar
                    className="mt-auto"
                    segments={[
                      { pct: top, shade: SHADE.solid, label: 'top 10 artists' },
                      { pct: 100 - top, shade: SHADE.faint, label: 'everyone else' },
                    ]}
                  />
                  <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
                    <span>Top 10 artists</span>
                    <span>Everyone else</span>
                  </div>
                </div>
              </Panel>
              <Panel title="Album commitment">
                {deep != null ? (
                  <>
                    <BigWord className="mt-5">{albumWord(d.album_commitment!.deep_share)}</BigWord>
                    <SplitBar
                      segments={[
                        { pct: deep, shade: SHADE.solid, label: 'full albums' },
                        { pct: 100 - deep, shade: SHADE.faint, label: 'singles' },
                      ]}
                    />
                    <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
                      <span>{deep}% full albums</span>
                      <span>{100 - deep}% singles</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-5 text-body-sm text-on-surface-variant">
                    Not enough album data yet.
                  </p>
                )}
              </Panel>
            </div>
            <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
              <Panel title="Most in one day">
                <div className="mt-5">
                  {d.top_day_track ? (
                    <>
                      <div className="text-display-lg-mobile leading-tight text-primary">
                        ×{d.top_day_track.count}
                      </div>
                      <div className="mb-4 text-body-sm text-on-surface-variant">
                        in one day · {d.top_day_track.date}
                      </div>
                      <TrackRow
                        id={d.top_day_track.id}
                        name={d.top_day_track.name}
                        sub={d.top_day_track.artist}
                      />
                    </>
                  ) : (
                    <p className="text-body-sm text-on-surface-variant">
                      No single-day binges yet.
                    </p>
                  )}
                </div>
              </Panel>
              <Panel title="Couldn't skip">
                <div className="mt-5">
                  {d.no_skip ? (
                    <>
                      <div className="text-display-lg-mobile leading-tight text-primary">
                        {pct(d.no_skip.skip_rate)}%
                      </div>
                      <div className="mb-4 text-body-sm text-on-surface-variant">
                        skip rate · {d.no_skip.plays} plays
                      </div>
                      <TrackRow id={d.no_skip.id} name={d.no_skip.name} sub={d.no_skip.artist} />
                    </>
                  ) : (
                    <p className="text-body-sm text-on-surface-variant">Not enough plays yet.</p>
                  )}
                </div>
              </Panel>
            </div>
          </>
        )
      }}
    </Chapter>
  )
}
