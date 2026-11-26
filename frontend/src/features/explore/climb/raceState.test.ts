import { describe, expect, it } from 'vitest'

import { gridTicks } from './climbMath'
import {
  VISIBLE_N,
  buildSeries,
  initialRace,
  raceReducer,
  seriesValue,
  smoothDamp,
  standings,
} from './raceState'

const cums = Array.from({ length: 14 }, (_, i) =>
  Array.from({ length: 6 }, (__, m) => (i + 1) * (m + 1) * 10),
)
const series = cums.map(buildSeries)

function run(
  steps: { dt: number }[],
  start = raceReducer(initialRace, { type: 'load', count: series.length }),
) {
  return steps.reduce((s, { dt }) => raceReducer(s, { type: 'tick', dt, series, speed: 1 }), start)
}

describe('monotone value curve', () => {
  it('passes through every monthly total and never decreases or overshoots', () => {
    const s = buildSeries([0, 0, 10, 10, 50, 51])
    s.values.forEach((v, k) => expect(seriesValue(s, k)).toBeCloseTo(v))
    let prev = -Infinity
    for (let p = 0; p <= 5; p += 0.01) {
      const v = seriesValue(s, p)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = v
    }
    // flat months stay flat (no dip/bulge between equal totals)
    for (let p = 2; p <= 3; p += 0.1) expect(seriesValue(s, p)).toBeCloseTo(10)
  })
  it('never reads before the first frame', () => {
    expect(seriesValue(buildSeries([5, 10]), -0.001)).toBe(5)
    expect(seriesValue(buildSeries([5, 10]), Number.NaN)).toBe(5)
  })
})

describe('spring', () => {
  it('reaches the target without overshooting', () => {
    let [x, v] = [10, 0]
    let min = x
    for (let i = 0; i < 120; i++) {
      ;[x, v] = smoothDamp(x, 0, v, 0.22, 1 / 60)
      min = Math.min(min, x)
    }
    expect(x).toBeCloseTo(0, 3)
    expect(min).toBeGreaterThanOrEqual(0)
  })
})

describe('bar race reducer', () => {
  it('eases the top 10 onto the chart and the rest off it', () => {
    const s = run(Array(200).fill({ dt: 16 }))
    expect(s.settled).toBe(true)
    expect(s.slot.filter((y) => y < VISIBLE_N - 0.5)).toHaveLength(VISIBLE_N)
    expect(s.axisMax).toBeGreaterThanOrEqual(cums[13]![0]!)
  })

  // Regression: the first frame after pressing play can carry a timestamp a
  // hair before the loop started. A negative step once pushed progress below 0,
  // the value lookup read index -1 → NaN, and the axis stayed NaN (full-width bars).
  it('survives a negative or bogus time step on play', () => {
    let s = run(Array(50).fill({ dt: 16 }))
    s = raceReducer(s, { type: 'toggle', maxP: 5 })
    s = run([{ dt: -0.37 }, { dt: Number.NaN }, ...Array(60).fill({ dt: 16 })], s)
    expect(Number.isFinite(s.axisMax)).toBe(true)
    expect(s.progress).toBeGreaterThan(0)
    const leader = Math.max(...series.map((c) => seriesValue(c, s.progress)))
    expect(s.axisMax).toBeGreaterThanOrEqual(leader - 1e-9)
  })

  it('keeps the previous order for near-ties (no flicker)', () => {
    const a = buildSeries([100, 200])
    const b = buildSeries([100.2, 200.2])
    const first = standings([a, b], 0, [0, 1]) // a was ahead last frame
    expect(first.rank).toEqual([0, 1])
    expect(standings([a, b], 0).rank).toEqual([1, 0]) // without history, value wins
  })

  it('plays to the end and holds the final standings', () => {
    let s = run(Array(10).fill({ dt: 16 }))
    s = raceReducer(s, { type: 'play' })
    s = run(Array(2000).fill({ dt: 16 }), s)
    expect(s.playing).toBe(false)
    expect(s.progress).toBe(5)
  })
})

describe('gridlines', () => {
  it('crossfade instead of popping as the axis grows', () => {
    const at = (max: number) => new Map(gridTicks(max, 800).map((t) => [t.value, t.opacity]))
    let prev = at(100)
    for (let max = 101; max < 5000; max *= 1.01) {
      const next = at(max)
      for (const [v, o] of next) {
        const before = prev.get(v) ?? 0
        expect(Math.abs(o - before)).toBeLessThan(0.35) // no hard jumps per frame
      }
      prev = next
    }
  })
  it('keeps lines legible and within the axis', () => {
    const ticks = gridTicks(1234, 900)
    expect(ticks.length).toBeGreaterThan(2)
    expect(Math.max(...ticks.map((t) => t.value))).toBeLessThanOrEqual(1234)
  })
})
