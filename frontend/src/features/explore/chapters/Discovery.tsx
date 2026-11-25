import { Card } from '@/components/Card'
import { pct } from '@/lib/format'

import { Chapter, Label, Panel, Reveal } from '../Chapter'
import { HelpPopover } from '../HelpPopover'
import { BigWord, SplitBar, TrackRow } from '../parts'
import { SHADE } from '../tips'
import { discoveryWord } from '../words'
import { useExploreApi } from '../yearFilterContext'

export function DiscoveryChapter() {
  const query = useExploreApi('/api/metrics/discovery')
  return (
    <Chapter
      id="discovery"
      title="Discovery & Loyalty"
      query={query}
      isEmpty={(d) =>
        !d.new_artist_share && !d.new_artists_monthly && !d.one_off_share && !d.rediscoveries.length
      }
    >
      {(d) => {
        const disc = pct(Math.max(0, Math.min(1, d.new_artist_share)))
        const maxRise = Math.max(1, ...d.rising.map((r) => r.share))
        return (
          <>
            <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
              <Panel
                className="lg:col-span-2"
                title="Your listening mix"
                help={
                  <HelpPopover title="Explorer vs. Loyalist">
                    <p>
                      The share of your plays that went to artists who were new to you at the time.
                    </p>
                    <ul className="help-list">
                      <li>
                        <b>Explorer</b> — 45% or more new artists
                      </li>
                      <li>
                        <b>Open to new music</b> — between 25% and 45%
                      </li>
                      <li>
                        <b>Loyalist</b> — under 25% new artists
                      </li>
                    </ul>
                  </HelpPopover>
                }
              >
                <div className="flex min-h-[200px] flex-col justify-center">
                  <BigWord className="leading-none">{discoveryWord(d.new_artist_share)}</BigWord>
                  <SplitBar
                    segments={[
                      { pct: disc, shade: SHADE.solid, label: 'new artists' },
                      { pct: 100 - disc, shade: SHADE.faint, label: 'familiar artists' },
                    ]}
                  />
                  <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
                    <span>{disc}% new artists</span>
                    <span>{100 - disc}% familiar artists</span>
                  </div>
                </div>
              </Panel>
              <div className="flex flex-col gap-gutter">
                <Reveal>
                  <Card className="rounded-2xl p-5">
                    <Label>New artists</Label>
                    <BigWord>{Math.round(d.new_artists_monthly)}</BigWord>
                    <div className="text-body-sm text-on-surface-variant">per month</div>
                  </Card>
                </Reveal>
                <Reveal>
                  <Card className="rounded-2xl p-5">
                    <Label>One-off plays</Label>
                    <BigWord>{pct(d.one_off_share)}%</BigWord>
                    <div className="text-body-sm text-on-surface-variant">played once</div>
                  </Card>
                </Reveal>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
              <Panel title="Back in rotation">
                <p className="mb-3 text-body-sm text-on-surface-variant">
                  Old favorites you returned to.
                </p>
                {d.rediscoveries.length ? (
                  <div className="space-y-1.5">
                    {d.rediscoveries.map((r) => (
                      <TrackRow
                        key={r.id}
                        id={r.id}
                        name={r.name}
                        sub={r.artist}
                        right={
                          <span className="font-mono text-[11px] text-primary">
                            {r.plays} plays
                          </span>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-body-sm text-on-surface-variant">
                    No returning favorites yet.
                  </p>
                )}
              </Panel>
              <Panel title="Gaining momentum">
                <div className="mt-5 space-y-3.5">
                  {d.rising.length ? (
                    d.rising.map((r) => (
                      <TrackRow
                        key={r.name}
                        id={r.id}
                        kind="artist"
                        name={
                          <span className="flex items-center justify-between gap-3">
                            <span className="truncate">{r.name}</span>
                            <span className="shrink-0 font-mono text-[11px] text-primary">
                              +{r.share}%
                            </span>
                          </span>
                        }
                        sub={
                          <span className="mt-1 block h-2.5 overflow-hidden rounded-full bg-surface-container-high">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{
                                width: `${Math.max(6, Math.round((r.share / maxRise) * 100))}%`,
                              }}
                            />
                          </span>
                        }
                      />
                    ))
                  ) : (
                    <p className="text-body-sm text-on-surface-variant">
                      No artist is surging right now.
                    </p>
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
