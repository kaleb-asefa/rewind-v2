import { Icon } from '@/components/Icon'

import { Chapter, Panel } from '../Chapter'
import { HelpPopover } from '../HelpPopover'
import { useExploreApi } from '../yearFilterContext'

export function WrappedChapter() {
  const query = useExploreApi('/api/metrics/wrapped')
  return (
    <Chapter
      id="wrapped"
      title="Your Rewind, Wrapped"
      query={query}
      isEmpty={(d) => !d.personality.length}
    >
      {(d) => (
        <>
          <Panel
            title="Your listening personality"
            help={
              <HelpPopover title="How your personality is built">
                <p>
                  Five spectrums pulled from the chapters above. The dot shows where you land on
                  each:
                </p>
                <ul className="help-list">
                  <li>
                    <b>Loyalist ↔ Explorer</b> — your new-artist share
                  </li>
                  <li>
                    <b>Underground ↔ Mainstream</b> — average track popularity
                  </li>
                  <li>
                    <b>Early bird ↔ Night owl</b> — your listening clock
                  </li>
                  <li>
                    <b>Restless ↔ Focused</b> — your skip rate
                  </li>
                  <li>
                    <b>Curator ↔ Shuffler</b> — your shuffle share
                  </li>
                </ul>
              </HelpPopover>
            }
          >
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {d.personality.map((t) => {
                const pos = Math.round(Math.max(0, Math.min(1, t.position)) * 100)
                return (
                  <div
                    key={t.label}
                    className="rounded-xl border border-hairline bg-surface-container-high/40 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <Icon name={t.icon || 'star'} className="text-xl text-primary" />
                      <span className="truncate text-headline-md text-on-surface">{t.label}</span>
                    </div>
                    <div
                      className="relative mt-4 h-1.5 rounded-full bg-surface-container-high"
                      role="meter"
                      aria-label={`${t.left} to ${t.right}`}
                      aria-valuenow={pos}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary shadow"
                        style={{ left: `${pos}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10px] text-on-surface-variant">
                      <span>{t.left}</span>
                      <span>{t.right}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
          <Panel>
            <div className="text-center">
              <h3 className="text-headline-md text-on-surface">That&apos;s your Rewind.</h3>
              <p className="mt-1 text-body-sm text-on-surface-variant">Every play, rewound.</p>
            </div>
          </Panel>
        </>
      )}
    </Chapter>
  )
}
