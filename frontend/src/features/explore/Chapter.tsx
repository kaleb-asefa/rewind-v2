import type { ReactNode } from 'react'
import { Link } from 'react-router'

import type { ApiError } from '@/api/client'
import { Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { SkeletonBlock } from '@/components/Skeleton'
import { useInView } from '@/lib/hooks'

import { useYearFilter } from './yearFilterContext'

/** Fades/slides content in the first time it scrolls into view. */
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: '0px 0px -10% 0px' })
  return (
    <div ref={ref} className={`${inView ? 'reveal-in' : 'reveal-init'} ${className}`}>
      {children}
    </div>
  )
}

/** A chapter card: glass surface with an optional title row. */
export function Panel({
  title,
  help,
  aside,
  className = '',
  children,
}: {
  title?: ReactNode
  help?: ReactNode
  aside?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <Reveal className={className}>
      <Card className="relative h-full overflow-hidden rounded-2xl p-gutter">
        {(title || aside) && (
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {title && <h3 className="text-headline-md text-on-surface">{title}</h3>}
              {help}
            </div>
            {aside}
          </div>
        )}
        {children}
      </Card>
    </Reveal>
  )
}

/** Small uppercase label used on stat cards. */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`text-label-bold uppercase tracking-wider text-on-surface-variant ${className}`}
    >
      {children}
    </div>
  )
}

/** Honest empty state: no upload yet, a year with no plays, or a custom reason. */
export function ChapterEmpty({
  reason,
  error,
  onRetry,
}: {
  reason?: ReactNode
  error?: ApiError | null
  onRetry?: () => void
}) {
  const { year, setYear } = useYearFilter()
  let body: ReactNode
  if (error) {
    body = (
      <>
        <Icon name="cloud_off" className="text-3xl text-error opacity-70" />
        <p className="mt-2 text-body-lg text-on-surface-variant">
          {error.message}{' '}
          {onRetry && (
            <button type="button" className="text-primary hover:underline" onClick={onRetry}>
              Try again
            </button>
          )}
        </p>
      </>
    )
  } else if (reason) {
    body = (
      <>
        <Icon name="database" className="text-3xl text-primary opacity-60" />
        <p className="mx-auto mt-2 max-w-lg text-body-lg text-on-surface-variant">{reason}</p>
      </>
    )
  } else if (year) {
    body = (
      <>
        <Icon name="calendar_month" className="text-3xl text-on-surface-variant opacity-40" />
        <p className="mt-2 text-body-lg text-on-surface-variant">
          No listening in {year} —{' '}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setYear(null)}
          >
            see all time
          </button>
          .
        </p>
      </>
    )
  } else {
    body = (
      <>
        <Icon name="bar_chart" className="text-3xl text-on-surface-variant opacity-40" />
        <p className="mt-2 text-body-lg text-on-surface-variant">
          Nothing to show yet —{' '}
          <Link to="/upload" className="text-primary hover:underline">
            upload your Spotify history
          </Link>
          .
        </p>
      </>
    )
  }
  return <Card className="chapter-empty rounded-2xl p-8 text-center">{body}</Card>
}

interface QueryLike<T> {
  data: T | undefined
  isPending: boolean
  isError: boolean
  error: ApiError | null
  isPlaceholderData: boolean
  refetch: () => unknown
}

interface ChapterProps<T> {
  id: string
  title: string
  query: QueryLike<T>
  /** True when the data has nothing worth showing. */
  isEmpty: (data: T) => boolean
  /** Optional explanation instead of the generic empty copy. */
  emptyReason?: (data: T) => ReactNode | undefined
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}

export function ChapterHeading({ title }: { title: string }) {
  return (
    <Reveal>
      <h2 className="text-headline-md tracking-tight text-on-surface md:text-display-lg-mobile">
        {title}
      </h2>
    </Reveal>
  )
}

/**
 * One scrollytelling chapter, driven by one query: skeleton while the first
 * load is pending, honest empty/error cards, and a dimmed body while a new
 * year's data loads (the previous year's numbers are never mistaken for it).
 */
export function Chapter<T>({
  id,
  title,
  query,
  isEmpty,
  emptyReason,
  skeleton,
  children,
}: ChapterProps<T>) {
  const { data } = query
  let body: ReactNode
  if (query.isPending) {
    body = skeleton ?? (
      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
        <SkeletonBlock className="h-72 rounded-2xl lg:col-span-2" />
        <SkeletonBlock className="h-72 rounded-2xl" />
      </div>
    )
  } else if (query.isError && !data) {
    body = <ChapterEmpty error={query.error} onRetry={() => void query.refetch()} />
  } else if (data && isEmpty(data)) {
    body = <ChapterEmpty reason={emptyReason?.(data)} />
  } else if (data) {
    body = (
      <div className={`space-y-6 ${query.isPlaceholderData ? 'chapter-busy' : ''}`}>
        {children(data)}
      </div>
    )
  }
  return (
    <section id={id} className="scroll-mt-32 space-y-6 pt-10" aria-labelledby={`${id}-title`}>
      <span id={`${id}-title`} hidden>
        {title}
      </span>
      <ChapterHeading title={title} />
      {body}
    </section>
  )
}
