import { useMemo, useState } from 'react'

import { useApi } from '@/api/queries'
import { Card } from '@/components/Card'
import { useFloatingTooltip } from '@/components/FloatingTooltip'
import { fmtDuration } from '@/lib/format'

import { buildCalendar, fmtDate, monthLabels, type CalendarDay } from './calendar'

const LEVELS = [0, 1, 2, 3, 4] as const
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

export function Heatmap() {
  const [thisYear] = useState(() => new Date().getFullYear())
  const [year, setYear] = useState<number | undefined>(undefined)
  const query = useApi('/api/metrics/heatmap', year ? { year } : undefined, { keepPrevious: true })
  const tip = useFloatingTooltip('heatmap-tooltip')
  const data = query.data
  const shownYear = data?.year ?? year ?? thisYear
  const calendar = useMemo(() => buildCalendar(shownYear, data?.days ?? []), [shownYear, data])
  const weeks = Math.ceil(calendar.length / 7)

  const months = useMemo(() => monthLabels(calendar), [calendar])

  const showDay = (el: Element, day: CalendarDay) => {
    const info = day.info
    tip.show(
      el,
      <>
        <strong>{fmtDate(day.date)}</strong>
        <br />
        {!info || info.streams === 0 ? (
          'No listening'
        ) : (
          <>
            <span className="count">{info.streams.toLocaleString()}</span> streams ·{' '}
            {fmtDuration(info.minutes)}
            {info.top_track && (
              <>
                <br />
                <span className="top">
                  ♪ {info.top_track}
                  {info.top_artist ? ` — ${info.top_artist}` : ''}
                </span>
              </>
            )}
          </>
        )}
      </>,
    )
  }

  const years = data?.years ?? []
  const gridStyle = {
    '--weeks-count': weeks,
    gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
  } as React.CSSProperties

  return (
    <section className="flex flex-col gap-3" aria-labelledby="heatmap-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="heatmap-title" className="text-headline-md text-on-surface">
            Listening Activity
          </h2>
          <p className="text-body-sm text-on-surface-variant">Daily streams in {shownYear}.</p>
        </div>
        {years.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-full bg-surface-container p-1"
            role="group"
            aria-label="Year"
          >
            {[...years].reverse().map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={y === shownYear}
                onClick={() => setYear(y)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                  y === shownYear
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>
      <Card className="p-4 md:p-5">
        <div className="heatmap-wrap" style={{ '--cell-gap': '3px' } as React.CSSProperties}>
          <div className="heatmap-scroll">
            <div
              className={`w-full min-w-[650px] transition-opacity ${query.isFetching ? 'opacity-50' : ''}`}
            >
              <div className="heatmap-months" style={gridStyle} aria-hidden>
                {months.map((m, w) => (
                  <span key={w} className="heatmap-month" style={{ gridColumn: w + 1 }}>
                    {m}
                  </span>
                ))}
              </div>
              <div className="heatmap-body">
                <div className="heatmap-days" aria-hidden>
                  {DAY_LABELS.map((d, i) => (
                    <span key={i} className="heatmap-day">
                      {d}
                    </span>
                  ))}
                </div>
                <div
                  className="heatmap-grid"
                  style={gridStyle}
                  role="grid"
                  aria-label={`Listening activity heatmap for ${shownYear}`}
                >
                  {calendar.map((day) =>
                    day.padding ? (
                      <span key={day.iso} className="heatmap-cell" data-future="true" aria-hidden />
                    ) : (
                      <button
                        key={day.iso}
                        type="button"
                        className="heatmap-cell"
                        data-level={day.info?.level ?? 0}
                        aria-label={`${fmtDate(day.date)}: ${day.info?.streams ?? 0} streams`}
                        onMouseEnter={(e) => showDay(e.currentTarget, day)}
                        onFocus={(e) => showDay(e.currentTarget, day)}
                        onMouseLeave={tip.hide}
                        onBlur={tip.hide}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
            <div className="text-[11px] text-on-surface-variant">
              <span className="font-bold text-on-surface">
                {(data?.active_days ?? 0).toLocaleString()}
              </span>{' '}
              days with activity ·{' '}
              <span className="font-bold text-primary">
                {(data?.total_streams ?? 0).toLocaleString()}
              </span>{' '}
              total streams
            </div>
            <div
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-on-surface-variant"
              aria-hidden
            >
              <span>Less</span>
              {LEVELS.map((l) => (
                <span
                  key={l}
                  className="heatmap-cell"
                  data-level={l}
                  style={{
                    pointerEvents: 'none',
                    transform: 'none',
                    outline: 'none',
                    width: 10,
                    height: 10,
                  }}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>
      </Card>
      {tip.node}
    </section>
  )
}
