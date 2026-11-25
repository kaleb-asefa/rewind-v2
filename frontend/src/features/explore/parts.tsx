/** Small chart building blocks shared by several Explore chapters. */
import type { ReactNode } from 'react'

import type { CoverKind } from '@/api/types'
import { CoverImage } from '@/covers/CoverImage'

import { hoverTip, type Tip } from './tips'

interface Column {
  label: string
  value: number
  tipTitle?: ReactNode
  tipValue?: ReactNode
}

/** Vertical bars; the tallest is solid, the rest translucent (weekday, eras, tempo). */
export function ColumnBars({
  columns,
  tip,
  className = 'h-40',
  colClass,
  barClass,
}: {
  columns: Column[]
  tip: Tip
  className?: string
  colClass: string
  barClass: string
}) {
  const max = Math.max(1, ...columns.map((c) => c.value))
  const top = columns.reduce((best, c, i) => (c.value > columns[best]!.value ? i : best), 0)
  return (
    <div className={`mt-4 flex items-end gap-3 ${className}`}>
      {columns.map((c, i) => {
        const isTop = i === top && c.value > 0
        return (
          <div
            key={c.label}
            className={`${colClass} flex h-full flex-1 cursor-pointer flex-col items-center justify-end gap-2`}
            {...(c.tipTitle ? hoverTip(tip, c.tipTitle, c.tipValue) : {})}
          >
            <div
              className={`${barClass} w-full rounded-t-md transition-colors ${isTop ? 'bg-primary' : 'bg-primary/30'}`}
              style={{ height: `${Math.max(4, Math.round((c.value / max) * 100))}%` }}
            />
            <span
              className={`font-mono text-[10px] ${isTop ? 'font-bold text-primary' : 'text-on-surface-variant'}`}
            >
              {c.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** A track (or artist) row with cover art. */
export function TrackRow({
  id,
  name,
  sub,
  right,
  kind = 'track',
  hover,
}: {
  id: string | null | undefined
  name: ReactNode
  sub?: ReactNode
  right?: ReactNode
  kind?: CoverKind
  hover?: ReturnType<typeof hoverTip>
}) {
  return (
    <div className="gem-row flex cursor-default items-center gap-3 rounded-lg p-2" {...hover}>
      <CoverImage
        item={{ id }}
        kind={kind}
        className={`h-10 w-10 ${kind === 'artist' ? 'rounded-full' : 'rounded-md'}`}
        fallbackIcon={kind === 'artist' ? 'person' : 'music_note'}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-sm text-on-surface">{name}</div>
        {sub && <div className="truncate text-[11px] text-on-surface-variant">{sub}</div>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </div>
  )
}

/** Big headline word under a small label (the many "X in a word" cards). */
export function BigWord({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mt-1 text-display-lg-mobile leading-tight text-primary ${className}`}>
      {children}
    </div>
  )
}

/** A thin 0..1 progress bar. */
export function Meter({ value, label }: { value: number; label: string }) {
  const p = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      className="relative mt-3 h-1.5 rounded-full bg-surface-container-high"
      role="meter"
      aria-label={label}
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500"
        style={{ width: `${p}%` }}
      />
    </div>
  )
}

/** Stacked horizontal segments (shuffle vs picked, attention buckets…). */
export function SplitBar({
  segments,
  className = 'mt-5',
}: {
  segments: { pct: number; shade: string; label?: string }[]
  className?: string
}) {
  return (
    <div
      className={`flex h-4 overflow-hidden rounded-full bg-surface-container-high ${className}`}
      role="img"
      aria-label={segments.map((s) => `${s.label ?? ''} ${s.pct}%`).join(', ')}
    >
      {segments.map((s, i) => (
        <div key={i} style={{ width: `${s.pct}%`, background: s.shade }} />
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; shade: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-on-surface-variant">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: it.shade }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}
