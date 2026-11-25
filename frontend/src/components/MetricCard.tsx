import type { ReactNode } from 'react'

import type { ApiError } from '@/api/client'

import { Card } from './Card'
import { ErrorState } from './ErrorState'
import { Icon } from './Icon'
import { SkeletonLines } from './Skeleton'

interface Props {
  label: string
  icon: string
  accent?: 'primary' | 'error' | 'muted'
  highlight?: boolean
  watermark?: string
  className?: string
  query: { isPending: boolean; isError: boolean; error: ApiError | null; refetch: () => unknown }
  children: ReactNode
}

const ACCENT = {
  primary: 'text-primary',
  error: 'text-error',
  muted: 'text-on-surface-variant',
} as const

/** Overview stat card: label + icon, then skeleton → content → error/retry. */
export function MetricCard({
  label,
  icon,
  accent = 'muted',
  highlight,
  watermark,
  className = '',
  query,
  children,
}: Props) {
  return (
    <Card
      className={`group relative flex flex-col gap-3 overflow-hidden p-5 ${highlight ? 'metric-gradient' : ''} ${className}`}
    >
      <div className="z-10 flex items-start justify-between">
        <span
          className={`text-label-bold uppercase tracking-widest ${highlight ? 'text-primary' : ACCENT[accent]}`}
        >
          {label}
        </span>
        <Icon
          name={icon}
          className={highlight || accent === 'primary' ? 'text-primary' : ACCENT[accent]}
        />
      </div>
      <div className="z-10" aria-live="polite" aria-busy={query.isPending}>
        {query.isPending ? (
          <SkeletonLines widths={['w-3/4', 'w-1/2']} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} compact />
        ) : (
          children
        )}
      </div>
      {watermark && (
        <div
          aria-hidden
          className="absolute -bottom-4 -right-4 opacity-10 transition-opacity group-hover:opacity-20"
        >
          <Icon name={watermark} filled className="text-[120px]" />
        </div>
      )}
    </Card>
  )
}
