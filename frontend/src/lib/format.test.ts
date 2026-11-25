import { describe, expect, it } from 'vitest'

import { fmtHours, fmtMins, hourLabel, pct, plays, plural } from './format'

describe('format', () => {
  it('plays', () => {
    expect(plays(1)).toBe('1 play')
    expect(plays(1234)).toBe(`${(1234).toLocaleString()} plays`)
  })
  it('fmtMins', () => {
    expect(fmtMins(42)).toBe('42m')
    expect(fmtMins(205)).toBe('3h 25m')
    expect(fmtMins(-5)).toBe('0m')
  })
  it('pct', () => expect(pct(0.456)).toBe(46))
  it('fmtHours keeps a decimal under 10h', () => {
    expect(fmtHours(24)).toBe('0.4')
    expect(fmtHours(1200)).toBe('20')
  })
  it('plural', () => {
    expect(plural(1, 'hour')).toBe('1 hour')
    expect(plural('2', 'hour')).toBe('2 hours')
  })
  it('hourLabel', () => {
    expect(hourLabel(0)).toBe('12 AM')
    expect(hourLabel(13)).toBe('1 PM')
  })
})
