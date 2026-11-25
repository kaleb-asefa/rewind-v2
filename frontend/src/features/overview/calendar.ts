import type { Schemas } from '@/api/types'
import { MONTHS_SHORT, isoLocal } from '@/lib/format'

type HeatmapDay = Schemas['HeatmapDay']

export interface CalendarDay {
  date: Date
  iso: string
  info: HeatmapDay | undefined
  padding: boolean
}

export const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

/** Sunday-aligned weeks covering the year (up to today for the current year). */
export function buildCalendar(
  year: number,
  days: readonly HeatmapDay[],
  today = new Date(),
): CalendarDay[] {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const yearStart = new Date(year, 0, 1)
  const end = year === today.getFullYear() ? today : new Date(year, 11, 31)
  const first = new Date(yearStart)
  first.setDate(first.getDate() - first.getDay())
  const out: CalendarDay[] = []
  for (let i = 0; ; i++) {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)
    if (date > end && out.length % 7 === 0) break
    const inRange = date >= yearStart && date <= end
    const iso = isoLocal(date)
    out.push({ date, iso, info: inRange ? byDate.get(iso) : undefined, padding: !inRange })
  }
  return out
}

/** One label per week column: the month name where a new month starts. */
export function monthLabels(calendar: readonly CalendarDay[]): string[] {
  const weeks = Math.ceil(calendar.length / 7)
  const firstDays = Array.from({ length: weeks }, (_, w) => calendar[w * 7])
  return firstDays.map((day, w) => {
    if (!day || day.padding) return ''
    const prev = firstDays.slice(0, w).findLast((d) => d && !d.padding)
    return !prev || prev.date.getMonth() !== day.date.getMonth()
      ? MONTHS_SHORT[day.date.getMonth()]!
      : ''
  })
}
