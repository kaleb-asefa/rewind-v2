/** Light/dark theme: a class on <html>, persisted in localStorage (same key as v1). */
import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'
export const THEME_KEY = 'rewind-theme'

const listeners = new Set<() => void>()

export function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function setTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme !== 'dark')
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // private mode: the choice just won't persist
  }
  listeners.forEach((l) => l())
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    currentTheme,
    () => 'dark' as Theme,
  )
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')]
}

/** Read a CSS custom property's current value (theme-aware colours for canvas). */
export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim()
}
