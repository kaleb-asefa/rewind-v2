/** Pure geometry for the rank-climb chart (ported from v1 velocity.js). */

export const SVG_W = 1000
export const SVG_H = 440
const PADDING_LEFT = 60
const PADDING_RIGHT = 185
const PADDING_TOP = 25
const PADDING_BOTTOM = 35
export const LAYOUT = { PADDING_LEFT, PADDING_RIGHT, PADDING_TOP, PADDING_BOTTOM }
const CHART_W = SVG_W - PADDING_LEFT - PADDING_RIGHT
const CHART_H = SVG_H - PADDING_TOP - PADDING_BOTTOM
export const SLOTS = 8
export const VISIBLE_WINDOW = 10
const FOCUS_OFFSET = (VISIBLE_WINDOW - 1) * 0.7

/** The sliding camera: which periods are on screen for a given progress. */
export function windowBounds(progress: number, total: number) {
  const maxProg = Math.max(0, Math.max(1, total) - 1)
  const span = Math.min(VISIBLE_WINDOW - 1, maxProg)
  let start: number
  if (progress <= FOCUS_OFFSET) start = 0
  else if (progress >= maxProg - (span - FOCUS_OFFSET)) start = maxProg - span
  else start = progress - FOCUS_OFFSET
  return { start, end: start + span }
}

export const periodX = (i: number, winStart: number) =>
  PADDING_LEFT + ((i - winStart) / Math.max(1, VISIBLE_WINDOW - 1)) * CHART_W
export const rankY = (rank: number) => PADDING_TOP + ((rank - 1) / (SLOTS - 1)) * CHART_H

/** Rank at a fractional progress, with cosine easing between periods. */
export function rankAt(ranks: readonly number[], progress: number): number {
  if (!ranks.length) return SLOTS
  const last = ranks.length - 1
  if (progress <= 0) return ranks[0]!
  if (progress >= last) return ranks[last]!
  const i = Math.floor(progress)
  const t = (1 - Math.cos((progress - i) * Math.PI)) / 2
  return ranks[i]! + (ranks[i + 1]! - ranks[i]!) * t
}

/** Catmull-Rom → cubic Bézier path of the line drawn up to `progress`. */
export function linePath(ranks: readonly number[], progress: number, winStart: number): string {
  if (!ranks.length) return ''
  const current = Math.min(progress, ranks.length - 1)
  const pts: { x: number; y: number }[] = []
  for (let m = Math.max(0, Math.floor(winStart) - 1); m <= Math.ceil(current); m++) {
    pts.push(
      m < current
        ? { x: periodX(m, winStart), y: rankY(ranks[m]!) }
        : { x: periodX(current, winStart), y: rankY(rankAt(ranks, current)) },
    )
  }
  if (!pts.length) return ''
  const f = (n: number) => n.toFixed(1)
  let d = `M ${f(pts[0]!.x)} ${f(pts[0]!.y)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]!
    d += ` C ${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)}, ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)}, ${f(p2.x)} ${f(p2.y)}`
  }
  return d
}

const MONTHS = [
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
const SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function parts(periods: readonly string[], idx: number) {
  const s = periods[Math.min(Math.max(0, Math.floor(idx)), periods.length - 1)] ?? ''
  return {
    y: s.slice(0, 4),
    m: Number(s.slice(5, 7)) - 1,
    d: s.length >= 10 ? Number(s.slice(8, 10)) : null,
  }
}

/** "MAR 4, 2024" for weekly periods, "March 2024" for monthly ones. */
export function periodLabel(periods: readonly string[], idx: number): string {
  if (!periods.length) return 'NO DATA'
  const { y, m, d } = parts(periods, idx)
  return d ? `${SHORT[m]} ${d}, ${y}` : `${MONTHS[m]} ${y}`
}

export const shortPeriod = (periods: readonly string[], idx: number) => {
  const { y, m } = parts(periods, idx)
  return `${SHORT[m]} '${y.slice(2)}`
}

export const monthOf = (periods: readonly string[], i: number) =>
  i < 0 || i >= periods.length ? -1 : Number(periods[i]!.slice(5, 7)) - 1
export const isMonthStart = (periods: readonly string[], i: number) =>
  i <= 0 || monthOf(periods, i) !== monthOf(periods, i - 1)
export const isYearStart = (periods: readonly string[], i: number) =>
  i > 0 && periods[i]?.slice(0, 4) !== periods[i - 1]?.slice(0, 4)

/** Bar race: value at a fractional progress, linear between months. */
export function valueAt(cum: readonly number[], p: number): number {
  if (!cum.length) return 0
  const i = Math.floor(p)
  if (i >= cum.length - 1) return cum[cum.length - 1]!
  return cum[i]! + (cum[i + 1]! - cum[i]!) * (p - i)
}

/** 1 / 2 / 2.5 / 5 × 10^n step for a readable value axis. */
export function niceStep(rough: number): number {
  if (!(rough > 0)) return 1
  const base = 10 ** Math.floor(Math.log10(rough))
  return ([1, 2, 2.5, 5, 10].find((s) => s >= rough / base) ?? 10) * base
}

export const SPEEDS = [0.25, 0.5, 1] as const
export type Speed = (typeof SPEEDS)[number]
