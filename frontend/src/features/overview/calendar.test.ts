import { describe, expect, it } from 'vitest'

import { buildCalendar, monthLabels } from './calendar'

describe('heatmap calendar', () => {
  it('pads to whole Sunday-aligned weeks and stops at today for the current year', () => {
    const today = new Date(2026, 1, 10) // Tue Feb 10 2026
    const cal = buildCalendar(
      2026,
      [{ date: '2026-01-01', streams: 3, minutes: 9, level: 2, top_track: null, top_artist: null }],
      today,
    )
    expect(cal.length % 7).toBe(0)
    expect(cal[0]!.date.getDay()).toBe(0)
    expect(cal.find((d) => d.iso === '2026-01-01')!.info?.streams).toBe(3)
    expect(cal.filter((d) => !d.padding).at(-1)!.iso).toBe('2026-02-10')
  })

  it('labels each month once, at its first week', () => {
    const labels = monthLabels(buildCalendar(2025, [], new Date(2026, 0, 1)))
    expect(labels.filter(Boolean)).toEqual([
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
    ])
  })
})
