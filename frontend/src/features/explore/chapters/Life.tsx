import { useFloatingTooltip } from '@/components/FloatingTooltip'
import { fmtMins } from '@/lib/format'

import { Chapter, Panel } from '../Chapter'
import { hoverTip } from '../tips'
import { useExploreApi } from '../yearFilterContext'

const milestoneLabel = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : n.toLocaleString())

export function LifeChapter() {
  const query = useExploreApi('/api/metrics/listening-life')
  const tip = useFloatingTooltip()
  return (
    <Chapter
      id="listening-life"
      title="Your Listening Life"
      query={query}
      isEmpty={(d) => !d.peaks.length}
    >
      {(d) => {
        const maxMix = Math.max(0.01, ...d.session_mix.map((m) => m.share))
        const n = d.milestones.length
        return (
          <>
            <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
              <Panel title="Biggest moments" className="lg:col-span-2">
                <div className="grid grid-cols-1 gap-5 pt-8 sm:grid-cols-3 sm:gap-0">
                  {d.peaks.slice(0, 3).map((p, i) => (
                    <div
                      key={p.label}
                      className={i ? 'sm:border-l sm:border-hairline sm:pl-6' : ''}
                    >
                      <div className="text-label-bold uppercase tracking-wider text-on-surface-variant">
                        Biggest {p.label}
                      </div>
                      <div className="mt-2 text-display-lg-mobile leading-tight text-primary">
                        {fmtMins(p.minutes)}
                      </div>
                      <div className="mt-1 truncate text-body-sm text-on-surface-variant">
                        {p.period}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Session pace">
                <div className="mt-5 text-display-lg-mobile leading-tight text-primary">
                  {fmtMins(d.typical_session_minutes)}
                </div>
                <div className="text-body-sm text-on-surface-variant">typical session</div>
                <div className="space-y-3 pt-7">
                  {d.session_mix.slice(0, 4).map((m) => (
                    <div key={m.label}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="text-[11px] text-on-surface-variant">{m.label}</span>
                        <span className="font-mono text-[10px] text-on-surface-variant">
                          {Math.round(m.share * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{ width: `${Math.max(6, Math.round((m.share / maxMix) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
            <Panel title="Milestones">
              <div className="mt-4 flex min-h-[170px] items-center">
                {n ? (
                  <div
                    className="relative grid w-full gap-4"
                    style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
                  >
                    {n > 1 && (
                      <div
                        className="life-milestone-line absolute top-[9px]"
                        style={{ left: `${50 / n}%`, right: `${50 / n}%` }}
                      />
                    )}
                    {d.milestones.map((m) => (
                      <div
                        key={m.target}
                        className="life-milestone relative min-w-0 cursor-pointer"
                        {...hoverTip(
                          tip,
                          m.track || `${m.target.toLocaleString()} plays`,
                          m.artist ? `${m.artist} · ${m.date}` : m.date,
                        )}
                      >
                        <div className="life-milestone-dot mx-auto h-5 w-5 rounded-full border-4 border-surface-container-high bg-primary shadow sm:mx-0" />
                        <div className="mt-5 text-center text-display-lg-mobile leading-tight text-on-surface sm:text-left">
                          {milestoneLabel(m.target)}
                        </div>
                        <div className="mt-1 text-center text-label-bold uppercase tracking-wider text-primary sm:text-left">
                          plays
                        </div>
                        <div className="mt-2 truncate text-center text-body-sm text-on-surface-variant sm:text-left">
                          {m.date}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-body-sm text-on-surface-variant">
                    Milestones appear as you listen.
                  </p>
                )}
              </div>
            </Panel>
            {tip.node}
          </>
        )
      }}
    </Chapter>
  )
}
