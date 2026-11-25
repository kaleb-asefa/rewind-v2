/**
 * The guest session ticket.
 *
 * A random UUID in localStorage names this browser's private database on the
 * server (sent as `X-Rewind-Session`). A fresh one is minted for every upload and
 * after "clear session", so old data is never mixed with new. Components that
 * depend on it subscribe through `useSessionTicket` and re-render when it rotates.
 */
import { useSyncExternalStore } from 'react'

export const SESSION_KEY = 'rewind_session'
export const SESSION_HEADER = 'X-Rewind-Session'

const listeners = new Set<() => void>()

/** RFC 4122 v4 UUID; falls back to Math.random where crypto.randomUUID is
 * unavailable (non-secure http:// origins on a LAN). */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function getSessionTicket(): string {
  let ticket = localStorage.getItem(SESSION_KEY)
  if (!ticket) {
    ticket = generateUUID()
    localStorage.setItem(SESSION_KEY, ticket)
  }
  return ticket
}

/** Make `ticket` the active session (e.g. after an upload under it succeeded). */
export function setSessionTicket(ticket: string): void {
  localStorage.setItem(SESSION_KEY, ticket)
  listeners.forEach((l) => l())
}

/** Replace the ticket with a new one (after clearing data). */
export function rotateSessionTicket(): string {
  const ticket = generateUUID()
  setSessionTicket(ticket)
  return ticket
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => e.key === SESSION_KEY && listener()
  window.addEventListener('storage', onStorage) // another tab rotated it
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSessionTicket(): string {
  return useSyncExternalStore(subscribe, getSessionTicket)
}
