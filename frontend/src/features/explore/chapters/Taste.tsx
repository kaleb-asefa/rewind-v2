import { useState } from 'react'

import { Card } from '@/components/Card'
import { useFloatingTooltip } from '@/components/FloatingTooltip'
import { plays } from '@/lib/format'

import { Chapter, Label, Panel, Reveal } from '../Chapter'
import { HelpPopover } from '../HelpPopover'
import { BigWord, ColumnBars, Meter, TrackRow } from '../parts'
import { hoverTip } from '../tips'
import { mainstreamWord, rangeWord } from '../words'
import { useExploreApi } from '../yearFilterContext'
import { CATALOG_REASON } from '../CatalogNotice'

export function TasteChapter() {
  const query = useExploreApi('/api/metrics/taste')
  const tip = useFloatingTooltip()
  const [thisYear] = useState(() => new Date().getFullYear())
  const eraWord = (avgYear: number) => {
    const age = thisYear - avgYear
    return age <= 5 ? 'Mostly recent' : age <= 15 ? 'A mix of eras' : 'Throwback'
  }
  return (
    <Chapter
      id="taste"
      title="Your Taste"
      query={query}
      isEmpty={(d) => !d.genres.length}
      emptyReason={(d) => (d.catalog_missing || d.has_history ? CATALOG_REASON : undefined)}
    >
      {(d) => {
        const maxG = Math.max(1, ...d.genres.map((g) => g.plays))
        const mainstream = d.mainstream ?? 0.5
        const nGenres = d.distinct_genres || d.genres.length
        return (
          <>
            <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
              <Panel title="Your top genres" className="lg:col-span-2">
                <div className="mt-5 space-y-3.5">
                  {d.genres.map((g) => (
                    <div
                      key={g.name}
                      className="genre-row cursor-pointer"
                      {...hoverTip(tip, g.name, plays(g.plays))}
                    >
                      <div className="genre-name mb-1 text-body-sm text-on-surface">{g.name}</div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-surface-container-high">
                        <div
                          className="genre-bar-fill h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(6, Math.round((g.plays / maxG) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
              <div className="flex flex-col gap-gutter">
                <Reveal>
                  <Card className="rounded-2xl p-5">
                    <div className="flex items-center gap-1.5">
                      <Label>How mainstream</Label>
                      <HelpPopover title="How the mainstream score works">
                        <p>
                          Every track carries a Spotify popularity score from 0–100. We average it
                          across everything you played.
                        </p>
                        <ul className="help-list">
                          <li>
                            <b>Underground</b> — average below 40
                          </li>
                          <li>
                            <b>In the mix</b> — between 40 and 65
                          </li>
                          <li>
                            <b>Mainstream</b> — 65 or higher
                          </li>
                        </ul>
                      </HelpPopover>
                    </div>
                    <BigWord>{mainstreamWord(mainstream)}</BigWord>
                    <Meter value={mainstream} label="How mainstream" />
                    <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
                      <span>Underground</span>
                      <span>Mainstream</span>
                    </div>
                  </Card>
                </Reveal>
                <Reveal>
                  <Card className="rounded-2xl p-5">
                    <div className="flex items-center gap-1.5">
                      <Label>Taste range</Label>
                      <HelpPopover title="How your taste range is measured">
                        <p>Counts the distinct genres that make up the bulk of your listening.</p>
                        <ul className="help-list">
                          <li>
                            <b>Loyalist</b> — fewer than 4 genres
                          </li>
                          <li>
                            <b>Adventurous</b> — 4 to 6 genres
                          </li>
                          <li>
                            <b>Explorer</b> — 7 or more genres
                          </li>
                        </ul>
                      </HelpPopover>
                    </div>
                    <BigWord>{rangeWord(nGenres)}</BigWord>
                    <div className="text-body-sm text-on-surface-variant">
                      {nGenres} {nGenres === 1 ? 'genre' : 'genres'} in your mix
                    </div>
                  </Card>
                </Reveal>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
              <Panel title="When your music was made">
                <div className="mt-1 text-headline-md font-bold text-primary">
                  {eraWord(d.avg_year ?? thisYear)}
                </div>
                <ColumnBars
                  tip={tip}
                  colClass="era-col"
                  barClass="era-bar"
                  columns={d.eras.map((e) => ({
                    label: `${e.decade}s`,
                    value: e.plays,
                    tipTitle: `${e.decade}s`,
                    tipValue: plays(e.plays),
                  }))}
                />
              </Panel>
              <Panel title="Hidden gems">
                <p className="mb-3 text-body-sm text-on-surface-variant">
                  Low-key tracks you play a lot.
                </p>
                {d.gems.length ? (
                  <div className="space-y-1.5">
                    {d.gems.map((g) => (
                      <TrackRow
                        key={g.id}
                        id={g.id}
                        name={g.name}
                        sub={g.artist}
                        hover={hoverTip(tip, g.name, plays(g.plays))}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-body-sm text-on-surface-variant">
                    Your taste leans mainstream — no deep cuts here.
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
