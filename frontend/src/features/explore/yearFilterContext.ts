import { createContext, use } from 'react'

import type { GetPath, QueryOf } from '@/api/client'
import { useApi, type UseApiOptions } from '@/api/queries'

export interface YearFilter {
  year: number | null
  setYear: (y: number | null) => void
  years: number[]
}

export const YearFilterContext = createContext<YearFilter | null>(null)
const Ctx = YearFilterContext

export function useYearFilter(): YearFilter {
  const ctx = use(Ctx)
  if (!ctx) throw new Error('useYearFilter must be used inside <YearFilterProvider>')
  return ctx
}

type YearScopedPath = {
  [P in GetPath]: QueryOf<P> extends { year?: string } ? P : never
}[GetPath]

/** useApi for Explore endpoints: adds the active year filter to the query. */
export function useExploreApi<P extends YearScopedPath>(
  path: P,
  query?: Omit<QueryOf<P>, 'year'>,
  opts: UseApiOptions = {},
) {
  const { year } = useYearFilter()
  const q = { ...query, ...(year ? { year: String(year) } : {}) } as QueryOf<P>
  return useApi(path, q, { keepPrevious: true, ...opts })
}
