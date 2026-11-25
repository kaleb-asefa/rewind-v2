import { Card } from '@/components/Card'
import { fmtMins, pct } from '@/lib/format'

import { Chapter, Label, Panel, Reveal } from '../Chapter'
import { HelpPopover } from '../HelpPopover'
import { BigWord, Legend, SplitBar, TrackRow } from '../parts'
import { SHADE } from '../tips'
import { shuffleWord, skipWord } from '../words'
import { useExploreApi } from '../yearFilterContext'

export function HabitsChapter() {
  const query = useExploreApi('/api/metrics/behavior')
  return (
    <Chapter id="habits" title="How You Listen" query={query} isEmpty={(d) => d.shuffle == null}>
      {(d) => {
        const shuffle = d.shuffle ?? 0
        const skip = d.skip_rate ?? 0
        const sh = pct(shuffle)
        const attention = [
          { label: 'Under 30s', pct: pct(d.attention.under30), shade: SHADE.mid },
          { label: 'Partial', pct: pct(d.attention.partial), shade: SHADE.strong },
          { label: 'Finished', pct: pct(d.attention.finished), shade: SHADE.solid },
        ]
        return (
          <>
            <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
              <Panel
                className="lg:col-span-2"
                title="How you press play"
                help={
                  <HelpPopover title="Shuffle vs. hand-picked">
                    <p>
                      The share of your plays that started from shuffle rather than a track you
                      chose yourself.
                    </p>
                    <ul className="help-list">
                      <li>
                        <b>Shuffler</b> — 60% or more of plays shuffled
                      </li>
                      <li>
                        <b>A bit of both</b> — between 35% and 60%
                      </li>
                      <li>
                        <b>Curator</b> — under 35% shuffled
                      </li>
                    </ul>
                  </HelpPopover>
                }
              >
                <div className="flex min-h-[200px] flex-col justify-center">
                  <BigWord className="leading-none">{shuffleWord(shuffle)}</BigWord>
                  <SplitBar
                    segments={[
                      { pct: sh, shade: SHADE.solid, label: 'shuffle' },
                      { pct: 100 - sh, shade: SHADE.faint, label: 'hand-picked' },
                    ]}
                  />
                  <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
                    <span>{sh}% shuffle</span>
                    <span>{100 - sh}% hand-picked</span>
                  </div>
                </div>
              </Panel>
              <div className="flex flex-col gap-gutter">
                <Reveal>
                  <Card className="rounded-2xl p-5">
                    <div className="flex items-center gap-1.5">
                      <Label>Restless or locked in?</Label>
                      <HelpPopover title="Restless vs. locked in">
                        <p>Your skip rate — how often you skip a track before it finishes.</p>
                        <ul className="help-list">
                          <li>
                            <b>Restless</b> — you skip 40% of tracks or more
                          </li>
                          <li>
                            <b>Selective</b> — you skip between 20% and 40%
                          </li>
                          <li>
                            <b>Locked in</b> — you skip under 20% and let songs play
                          </li>
                        </ul>
                      </HelpPopover>
                    </div>
                    <BigWord>{skipWord(skip)}</BigWord>
                    <div className="text-body-sm text-on-surface-variant">
                      You skip {pct(skip)}% of tracks.
                    </div>
                  </Card>
                </Reveal>
                <Reveal>
                  <Card className="rounded-2xl p-5">
                    <Label>Longest binge</Label>
                    <BigWord>{fmtMins(d.longest_binge_min)}</BigWord>
                    <div className="text-body-sm text-on-surface-variant">in one sitting</div>
                  </Card>
                </Reveal>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
              <Panel title="How long you stick around">
                <SplitBar segments={attention} className="mt-6" />
                <Legend
                  items={attention.map((a) => ({ label: `${a.label} ${a.pct}%`, shade: a.shade }))}
                />
              </Panel>
              <Panel title="On repeat">
                <p className="mb-3 text-body-sm text-on-surface-variant">
                  Songs you looped back-to-back.
                </p>
                {d.loops.length ? (
                  <div className="space-y-1.5">
                    {d.loops.map((l) => (
                      <TrackRow
                        key={l.id}
                        id={l.id}
                        name={l.name}
                        sub={l.artist}
                        right={
                          <span className="font-mono text-[11px] text-primary">×{l.count}</span>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-body-sm text-on-surface-variant">
                    No back-to-back repeats yet.
                  </p>
                )}
              </Panel>
            </div>
          </>
        )
      }}
    </Chapter>
  )
}
