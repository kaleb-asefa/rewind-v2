import { useState } from 'react'

import { Card } from '@/components/Card'
import { atPointer, useFloatingTooltip } from '@/components/FloatingTooltip'
import { TipBody } from '@/components/TipBody'
import { Icon } from '@/components/Icon'
import { WEEKDAYS_SHORT, hourLabel, plays } from '@/lib/format'

import { AreaLine } from '../AreaLine'
import { Chapter, Label, Panel, Reveal } from '../Chapter'
import { HelpPopover } from '../HelpPopover'
import { useExploreApi } from '../yearFilterContext'

const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const FULL_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type Tip = ReturnType<typeof useFloatingTooltip>

function ListeningClock({ hourly, tip }: { hourly: number[]; tip: Tip }) {
  const [hover, setHover] = useState<number | null>(null)
  const cx = 150
  const cy = 150
  const inner = 62
  const maxLen = 62
  const minLen = 8
  const max = Math.max(...hourly) || 1
  const hasData = hourly.some((v) => v > 0)
  const peak = hourly.reduce((best, v, i) => (v > hourly[best]! ? i : best), 0)
  const spoke = (i: number, len: number) => {
    const ang = ((i * 15 - 90) * Math.PI) / 180
    return {
      x1: cx + Math.cos(ang) * inner,
      y1: cy + Math.sin(ang) * inner,
      x2: cx + Math.cos(ang) * (inner + len),
      y2: cy + Math.sin(ang) * (inner + len),
    }
  }
  return (
    <div className="relative mt-4 flex items-center justify-center">
      <svg
        viewBox="0 0 300 300"
        className="h-auto w-[300px] max-w-full"
        role="img"
        aria-label={`Plays by hour of day; peak at ${hourLabel(peak)}`}
      >
        {hourly.map((count, i) => {
          const v = count / max
          const isPeak = hasData && i === peak
          return (
            <line
              key={i}
              className={`clock-bar ${hover === i ? 'is-hover' : ''}`}
              {...spoke(i, minLen + v * maxLen)}
              stroke={isPeak ? 'var(--emphasis)' : 'rgb(var(--accent-rgb))'}
              strokeOpacity={isPeak ? 1 : 0.25 + v * 0.7}
              strokeWidth={isPeak ? 8 : 6}
            />
          )
        })}
        {hourly.map((count, i) => (
          <line
            key={`hit-${i}`}
            className="clock-hit"
            {...spoke(i, Math.max(minLen + (count / max) * maxLen, 30))}
            stroke="transparent"
            strokeWidth={15}
            onMouseEnter={(e) => {
              setHover(i)
              tip.show(atPointer(e), <TipBody title={hourLabel(i)} value={plays(count)} />)
            }}
            onMouseMove={(e) =>
              tip.show(atPointer(e), <TipBody title={hourLabel(i)} value={plays(count)} />)
            }
            onMouseLeave={() => {
              setHover(null)
              tip.hide()
            }}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-label-bold uppercase tracking-widest text-on-surface-variant">
          {hover != null ? plays(hourly[hover] ?? 0) : 'Peak hour'}
        </span>
        <span className="text-display-lg-mobile leading-none text-primary">
          {hover != null ? hourLabel(hover) : hasData ? hourLabel(peak) : '—'}
        </span>
      </div>
      <span className="absolute left-1/2 top-1 -translate-x-1/2 font-mono text-[10px] text-on-surface-variant">
        12 AM
      </span>
      <span className="absolute right-1 top-1/2 -translate-y-1/2 font-mono text-[10px] text-on-surface-variant">
        6 AM
      </span>
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[10px] text-on-surface-variant">
        12 PM
      </span>
      <span className="absolute left-1 top-1/2 -translate-y-1/2 font-mono text-[10px] text-on-surface-variant">
        6 PM
      </span>
    </div>
  )
}

function SeasonCurve({ monthly, tip }: { monthly: number[]; tip: Tip }) {
  return (
    <>
      <AreaLine
        values={monthly}
        width={320}
        height={110}
        scale="zero"
        tip={tip}
        label="Plays by month of the year"
        tipFor={(i) => [FULL_MONTHS[i], plays(monthly[i] ?? 0)]}
      />
      <div className="mt-2 flex justify-between font-mono text-[10px] text-on-surface-variant">
        {['Jan', 'Apr', 'Jul', 'Oct', 'Dec'].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </>
  )
}

function WeekdayBars({ weekday, tip }: { weekday: number[]; tip: Tip }) {
  const max = Math.max(...weekday) || 1
  const busiest = weekday.reduce((best, v, i) => (v > weekday[best]! ? i : best), 0)
  return (
    <div className="mt-4 flex h-40 items-end gap-2">
      {weekday.map((v, i) => {
        const top = i === busiest && v > 0
        return (
          <div
            key={i}
            className="weekday-col flex h-full flex-1 cursor-pointer flex-col items-center justify-end gap-2"
            onMouseEnter={(e) =>
              tip.show(atPointer(e), <TipBody title={FULL_WEEKDAYS[i]} value={plays(v)} />)
            }
            onMouseMove={(e) =>
              tip.show(atPointer(e), <TipBody title={FULL_WEEKDAYS[i]} value={plays(v)} />)
            }
            onMouseLeave={tip.hide}
          >
            <div
              className={`weekday-bar w-full rounded-t-md transition-colors ${top ? 'bg-primary' : 'bg-primary/30'}`}
              style={{ height: `${Math.max(4, Math.round((v / max) * 100))}%` }}
            />
            <span
              className={`font-mono text-[10px] ${top ? 'font-bold text-primary' : 'text-on-surface-variant'}`}
            >
              {WEEKDAYS_SHORT[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function RhythmChapter() {
  const query = useExploreApi('/api/metrics/rhythm')
  const tip = useFloatingTooltip()
  return (
    <Chapter id="rhythm" title="When You Listen" query={query} isEmpty={(d) => !d.total_streams}>
      {(d) => (
        <>
          <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
            <Panel title="Your listening clock" className="lg:col-span-2">
              <ListeningClock hourly={d.hourly} tip={tip} />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-16 -right-16 h-72 w-72 rounded-full bg-primary/5 blur-[100px]"
              />
            </Panel>
            <div className="flex flex-col gap-gutter">
              <Reveal>
                <Card className="rounded-2xl p-5">
                  <div className="flex items-center gap-1.5">
                    <Label>Chronotype</Label>
                    <HelpPopover title="How your chronotype is worked out">
                      <p>
                        We shift the clock so your day starts at 5 AM, then take the average hour
                        you press play — weighted by how much you listen.
                      </p>
                      <ul className="help-list">
                        <li>
                          <b>Early bird</b> — your average lands in the morning half of the day
                        </li>
                        <li>
                          <b>Balanced</b> — spread fairly evenly across day and night
                        </li>
                        <li>
                          <b>Night owl</b> — your average leans into the evening and late night
                        </li>
                      </ul>
                    </HelpPopover>
                  </div>
                  <div className="mb-3 text-headline-md text-on-surface">
                    {d.chronotype.label ?? '—'}
                  </div>
                  <div className="relative h-2 rounded-full bg-gradient-to-r from-amber-400/60 via-surface-container-high to-primary">
                    <div
                      className="absolute -top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-primary bg-on-surface shadow transition-all duration-500"
                      style={{ left: `${Math.round(d.chronotype.position * 100)}%` }}
                    />
                  </div>
                  <div className="mt-3 flex justify-between font-mono text-[10px] text-on-surface-variant">
                    <span>Early bird</span>
                    <span>Night owl</span>
                  </div>
                </Card>
              </Reveal>
              <Reveal>
                <Card className="flex items-center gap-4 rounded-2xl p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Icon name="event" />
                  </div>
                  <div className="min-w-0">
                    <Label>Busiest weekday</Label>
                    <div className="truncate text-headline-md text-on-surface">
                      {d.busiest_weekday ?? '—'}
                    </div>
                  </div>
                </Card>
              </Reveal>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3">
            <Panel title="Weekday rhythm">
              <WeekdayBars weekday={d.weekday} tip={tip} />
            </Panel>
            <Panel title="Across the year">
              <SeasonCurve monthly={d.monthly} tip={tip} />
            </Panel>
            <Panel>
              <div className="flex h-full flex-col justify-between">
                <div>
                  <h3 className="text-headline-md text-on-surface">Longest streak</h3>
                  <p className="text-body-sm text-on-surface-variant">
                    Consecutive days with a play.
                  </p>
                </div>
                <div className="my-4 flex items-end gap-2">
                  <span className="text-display-lg leading-none text-primary">
                    {d.streak.longest}
                  </span>
                  <span className="mb-1 text-body-lg text-on-surface-variant">days</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-surface-container p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Latest
                    </div>
                    <div className="text-body-lg text-on-surface">
                      {d.streak.current} {d.streak.current === 1 ? 'day' : 'days'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface-container p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Active days
                    </div>
                    <div className="text-body-lg text-on-surface">
                      {d.streak.active_days.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
          {tip.node}
        </>
      )}
    </Chapter>
  )
}
