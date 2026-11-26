import { describe, expect, it } from 'vitest'

import {
  isYearStart,
  linePath,
  niceStep,
  periodLabel,
  rankAt,
  rankY,
  valueAt,
  windowBounds,
} from './climbMath'

describe('climb math', () => {
  it('eases ranks between periods and clamps at the ends', () => {
    expect(rankAt([3, 1], 0)).toBe(3)
    expect(rankAt([3, 1], 0.5)).toBeCloseTo(2)
    expect(rankAt([3, 1], 5)).toBe(1)
    expect(rankAt([], 1)).toBe(8)
  })
  it('keeps the camera window within the data', () => {
    expect(windowBounds(0, 30)).toEqual({ start: 0, end: 9 })
    const mid = windowBounds(15, 30)
    expect(mid.end - mid.start).toBe(9)
    expect(windowBounds(29, 30).end).toBe(29)
    expect(windowBounds(2, 4)).toEqual({ start: 0, end: 3 })
  })
  it('draws a path that ends at the current interpolated rank', () => {
    const d = linePath([1, 2, 3], 1.5, 0)
    expect(d.startsWith('M')).toBe(true)
    const end = Number(d.split(',').at(-1))
    expect(end).toBeCloseTo(rankY(rankAt([1, 2, 3], 1.5)), 3)
  })
  it('never overshoots the chart on a big rank jump', () => {
    const d = linePath([9, 9, 1, 1, 9, 9], 5, 0)
    const ys = [...d.matchAll(/-?\d+(\.\d+)?,(-?\d+(\.\d+)?)/g)].map((m) => Number(m[2]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(rankY(1) - 0.01)
    expect(Math.max(...ys)).toBeLessThanOrEqual(rankY(9) + 0.01)
  })
  it('labels weekly and monthly periods', () => {
    expect(periodLabel(['2024-03-04'], 0)).toBe('MAR 4, 2024')
    expect(periodLabel(['2024-03'], 0)).toBe('March 2024')
    expect(isYearStart(['2023-12-25', '2024-01-01'], 1)).toBe(true)
  })
  it('bar race helpers', () => {
    expect(valueAt([0, 10, 30], 1.5)).toBe(20)
    expect(niceStep(37)).toBe(50)
    expect(niceStep(180)).toBe(200)
  })
})
