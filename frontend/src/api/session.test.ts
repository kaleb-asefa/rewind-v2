import { describe, expect, it } from 'vitest'

import { SESSION_KEY, generateUUID, getSessionTicket, rotateSessionTicket } from './session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('session ticket', () => {
  it('creates and persists a v4 UUID once', () => {
    const first = getSessionTicket()
    expect(first).toMatch(UUID)
    expect(getSessionTicket()).toBe(first)
    expect(localStorage.getItem(SESSION_KEY)).toBe(first)
  })

  it('rotates to a new ticket', () => {
    const first = getSessionTicket()
    const next = rotateSessionTicket()
    expect(next).not.toBe(first)
    expect(getSessionTicket()).toBe(next)
  })

  it('falls back to Math.random when crypto.randomUUID is unavailable', () => {
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      expect(generateUUID()).toMatch(UUID)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
