/**
 * Bar-race animation state as a pure reducer (testable, no refs in render).
 *
 * The motion follows classic bar-chart-race videos:
 * - values grow along a monotone cubic through the monthly totals, so bars
 *   accelerate and ease smoothly (no speed jump at each month) and never shrink;
 * - row positions follow a critically damped spring: smooth overtakes with no
 *   overshoot, that retarget gracefully mid-move;
 * - the axis tracks the leader exactly (the #1 bar always spans the track); the
 *   leader's value is itself smooth, so the scale glides without any lag-snap;
 * - near-ties keep their previous order, so two close racers don't flicker.
 */

export const VISIBLE_N = 10
export const SECONDS_PER_MONTH = 0.8 // at 1× speed
const ROW_SMOOTH_TIME = 0.3 // s — how quickly a row slides to its new rank
const TIE_EPSILON = 0.004 // fraction of the leader's value treated as a tie

/** A racer's cumulative values with precomputed monotone-cubic tangents. */
export interface Series {
  values: readonly number[]
  tangents: readonly number[]
}

/** Fritsch–Carlson tangents: a cubic through the points that never overshoots. */
export function buildSeries(values: readonly number[]): Series {
  const n = values.length
  const d = Array.from({ length: Math.max(0, n - 1) }, (_, k) => values[k + 1]! - values[k]!)
  const m = Array.from({ length: n }, (_, k) =>
    k === 0 ? (d[0] ?? 0) : k === n - 1 ? d[k - 1]! : (d[k - 1]! + d[k]!) / 2,
  )
  for (let k = 0; k < n - 1; k++) {
    if (d[k]! <= 0) {
      m[k] = 0
      m[k + 1] = 0
      continue
    }
    const a = Math.max(0, m[k]!) / d[k]!
    const b = Math.max(0, m[k + 1]!) / d[k]!
    const h = a * a + b * b
    const t = h > 9 ? 3 / Math.sqrt(h) : 1
    m[k] = t * a * d[k]!
    m[k + 1] = t * b * d[k]!
  }
  return { values, tangents: m }
}

/** Value at fractional progress `p` (months), via cubic Hermite interpolation. */
export function seriesValue({ values, tangents }: Series, p: number): number {
  if (!values.length) return 0
  if (!(p > 0)) return values[0]! // also catches NaN
  const last = values.length - 1
  if (p >= last) return values[last]!
  const k = Math.floor(p)
  const t = p - k
  const t2 = t * t
  const t3 = t2 * t
  return (
    (2 * t3 - 3 * t2 + 1) * values[k]! +
    (t3 - 2 * t2 + t) * tangents[k]! +
    (-2 * t3 + 3 * t2) * values[k + 1]! +
    (t3 - t2) * tangents[k + 1]!
  )
}

/**
 * Critically damped spring toward `target` ("smooth damp", Game Programming
 * Gems 4). Returns [position, velocity]. Never overshoots the target.
 */
export function smoothDamp(
  cur: number,
  target: number,
  vel: number,
  smoothTime: number,
  dt: number,
): [number, number] {
  if (dt <= 0) return [cur, vel]
  const omega = 2 / smoothTime
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = cur - target
  const temp = (vel + omega * change) * dt
  let nextVel = (vel - omega * temp) * exp
  let next = target + (change + temp) * exp
  if (target - cur > 0 === next > target) {
    next = target
    nextVel = 0
  }
  return [next, nextVel]
}

export interface RaceState {
  progress: number
  playing: boolean
  /** Eased slot per racer (in lanes; VISIBLE_N = just below the chart) + spring velocity. */
  slot: number[]
  slotVel: number[]
  opacity: number[]
  /** Last frame's rank per racer — the tie-breaker that prevents flicker. */
  rank: number[]
  axisMax: number
  settled: boolean
}

export type RaceAction =
  | { type: 'load'; count: number }
  | { type: 'toggle'; maxP: number }
  | { type: 'play' }
  | { type: 'reset' }
  | { type: 'scrub'; progress: number }
  | { type: 'tick'; dt: number; series: readonly Series[]; speed: number }

export const initialRace: RaceState = {
  progress: 0,
  playing: false,
  slot: [],
  slotVel: [],
  opacity: [],
  rank: [],
  axisMax: 1,
  settled: true,
}

/** Values and ranking at a progress; `prevRank` breaks near-ties stably. */
export function standings(
  series: readonly Series[],
  progress: number,
  prevRank: readonly number[] = [],
) {
  const values = series.map((s) => seriesValue(s, progress))
  const leader = Math.max(0, ...values)
  const eps = leader * TIE_EPSILON
  const order = values
    .map((_, i) => i)
    .sort((a, b) => {
      const diff = values[b]! - values[a]!
      if (Math.abs(diff) > eps) return diff
      if (prevRank.length) return (prevRank[a] ?? a) - (prevRank[b] ?? b) || diff
      return diff
    })
  const rank = new Array<number>(values.length).fill(values.length)
  order.forEach((item, pos) => (rank[item] = pos))
  return { values, rank, leader }
}

export function raceReducer(s: RaceState, a: RaceAction): RaceState {
  switch (a.type) {
    case 'load':
      return {
        ...initialRace,
        slot: Array(a.count).fill(VISIBLE_N),
        slotVel: Array(a.count).fill(0),
        opacity: Array(a.count).fill(0),
        settled: false,
      }
    case 'toggle':
      // Pressing play on the last frame replays from the start.
      return {
        ...s,
        playing: !s.playing,
        progress: !s.playing && s.progress >= a.maxP ? 0 : s.progress,
        settled: false,
      }
    case 'play':
      return { ...s, playing: true, settled: false }
    case 'reset':
      return { ...s, progress: 0, settled: false }
    case 'scrub':
      return { ...s, progress: Math.max(0, a.progress), settled: false }
    case 'tick': {
      // rAF timestamps can trail the loop's start time: never step backwards.
      const dt = Math.max(0, Math.min(Number.isFinite(a.dt) ? a.dt : 0, 50)) / 1000
      const maxP = Math.max(0, (a.series[0]?.values.length ?? 1) - 1)
      let { playing } = s
      let progress = Math.max(0, s.progress)
      if (playing && maxP > 0) {
        progress += (dt / SECONDS_PER_MONTH) * a.speed
        if (progress >= maxP) {
          progress = maxP // hold on the final standings
          playing = false
        }
      }

      const { rank, leader } = standings(a.series, progress, s.rank)
      const axisMax = Math.max(leader, 1)
      let moving = false

      const slot: number[] = []
      const slotVel: number[] = []
      const opacity: number[] = []
      s.slot.forEach((y, i) => {
        const t = Math.min(rank[i] ?? VISIBLE_N, VISIBLE_N)
        const [ny, nv] = smoothDamp(y, t, s.slotVel[i] ?? 0, ROW_SMOOTH_TIME, dt)
        slot.push(ny)
        slotVel.push(nv)
        // Fade with position: opaque on the chart, gone one lane below it.
        opacity.push(Math.max(0, Math.min(1, VISIBLE_N - ny)))
        if (Math.abs(ny - t) > 0.002 || Math.abs(nv) > 0.01) moving = true
      })
      return {
        progress,
        playing,
        slot,
        slotVel,
        opacity,
        rank,
        axisMax,
        settled: !playing && !moving,
      }
    }
  }
}
