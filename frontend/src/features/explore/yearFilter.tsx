/**
 * The Explore page's single year filter. `year` is null for all time. It's
 * persisted (same key as v1) and reset to all time if the stored year isn't
 * one the session has data for. Every chapter query includes the year in its
 * key, so switching years can never paint one year's numbers under another.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { useApi } from '@/api/queries'

const YEAR_KEY = 'rewind_explore_year'

function readStoredYear(): number | null {
  try {
    const raw = localStorage.getItem(YEAR_KEY)
    return raw && /^\d{4}$/.test(raw) ? Number(raw) : null
  } catch {
    return null
  }
}

import { YearFilterContext as Ctx } from './yearFilterContext'

export function YearFilterProvider({ children }: { children: ReactNode }) {
  const [year, setYearState] = useState<number | null>(readStoredYear)
  const yearsQuery = useApi('/api/metrics/years')
  const years = useMemo(() => yearsQuery.data?.years.map((y) => y.year) ?? [], [yearsQuery.data])

  const setYear = useCallback((y: number | null) => {
    setYearState(y)
    try {
      if (y == null) localStorage.removeItem(YEAR_KEY)
      else localStorage.setItem(YEAR_KEY, String(y))
    } catch {
      // private mode: the filter just won't persist
    }
  }, [])

  // A stored year this session has no data for reads as all time.
  const effective = yearsQuery.data && year != null && !years.includes(year) ? null : year
  const value = useMemo(() => ({ year: effective, setYear, years }), [effective, setYear, years])
  return <Ctx value={value}>{children}</Ctx>
}
