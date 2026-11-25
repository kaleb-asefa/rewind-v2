/** Display formatting shared across pages (ported from v1's explore/core.js). */

/** "1 play" / "1,234 plays". */
export function plays(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? 'play' : 'plays'}`
}

/** Minutes as "3h 25m" / "42m". */
export function fmtMins(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

/** A 0..1 share as a whole percentage. */
export function pct(v: number): number {
  return Math.round(v * 100)
}

/** Hours for a headline: one decimal under 10h (so 0.4h isn't "0"), whole above. */
export function fmtHours(minutes: number): string {
  const hours = minutes / 60
  return hours < 10
    ? hours.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : Math.round(hours).toLocaleString()
}

/** "1 hour" / "12 hours" style pluralisation. */
export function plural(n: number | string, one: string, many = `${one}s`): string {
  return `${n} ${String(n) === '1' ? one : many}`
}

/** 0..23 → "12 AM" … "11 PM". */
export function hourLabel(h: number): string {
  const suffix = h < 12 ? 'AM' : 'PM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr} ${suffix}`
}

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const
export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const
