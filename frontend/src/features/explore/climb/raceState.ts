/** Bar-race animation state as a pure reducer (testable, no refs in render). */
import { valueAt } from './climbMath'

export const VISIBLE_N = 10
const SECONDS_PER_MONTH = 0.9
const EASE_TAU = 0.3 // row glide time constant (s)
const AXIS_EASE_TAU = 0.5 // axis rescale time constant (s)

export interface RaceState {
  progress: number
  playing: boolean
  /** Eased slot position (in lanes; VISIBLE_N = below the chart) and opacity per item. */
  slot: number[]
  opacity: number[]
  axisMax: number
  settled: boolean
}

export type RaceAction =
  | { type: 'load'; count: number }
  | { type: 'toggle'; maxP: number }
  | { type: 'reset' }
  | { type: 'scrub'; progress: number }
  | { type: 'tick'; dt: number; cums: readonly (readonly number[])[]; speed: number }

export const initialRace: RaceState = {
  progress: 0,
  playing: false,
  slot: [],
  opacity: [],
  axisMax: 1,
  settled: true,
}

/** Current values and ranking at a progress. */
export function standings(cums: readonly (readonly number[])[], progress: number) {
  const values = cums.map((c) => valueAt(c, progress))
  const order = values.map((_, i) => i).sort((a, b) => values[b]! - values[a]!)
  const slotOf = new Array<number>(values.length).fill(VISIBLE_N)
  order.forEach((item, pos) => (slotOf[item] = pos))
  return { values, slotOf, leader: values[order[0] ?? 0] ?? 0 }
}

export function raceReducer(s: RaceState, a: RaceAction): RaceState {
  switch (a.type) {
    case 'load':
      return {
        progress: 0,
        playing: false,
        slot: Array(a.count).fill(VISIBLE_N),
        opacity: Array(a.count).fill(0),
        axisMax: 1,
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
    case 'reset':
      return { ...s, progress: 0, settled: false }
    case 'scrub':
      return { ...s, progress: a.progress, settled: false }
    case 'tick': {
      const dt = Math.min(a.dt, 50) / 1000
      const maxP = Math.max(0, (a.cums[0]?.length ?? 1) - 1)
      let { progress, playing } = s
      if (playing && maxP > 0) {
        progress += (dt / SECONDS_PER_MONTH) * a.speed
        if (progress >= maxP) {
          progress = maxP // hold on the final standings
          playing = false
        }
      }
      const { slotOf, leader } = standings(a.cums, progress)
      const k = 1 - Math.exp(-dt / EASE_TAU)
      const kAxis = 1 - Math.exp(-dt / AXIS_EASE_TAU)
      const target = Math.max(leader, 1)
      let axisMax = s.axisMax + (target - s.axisMax) * kAxis
      if (axisMax < leader) axisMax = leader // the leader never overflows
      let moving = Math.abs(axisMax - target) > target * 0.002
      const slot = s.slot.map((y, i) => {
        const t = Math.min(slotOf[i] ?? VISIBLE_N, VISIBLE_N)
        const next = y + (t - y) * k
        if (Math.abs(next - t) > 0.01) moving = true
        return next
      })
      const opacity = s.opacity.map((o, i) => {
        const t = (slotOf[i] ?? VISIBLE_N) < VISIBLE_N ? 1 : 0
        const next = o + (t - o) * k
        if (Math.abs(next - t) > 0.01) moving = true
        return next
      })
      return { progress, playing, slot, opacity, axisMax, settled: !playing && !moving }
    }
  }
}
