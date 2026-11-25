/** Two pulsing bars: the loading state of a metric card. */
export function SkeletonLines({ widths = ['w-2/3', 'w-1/2'] }: { widths?: string[] }) {
  return (
    <div className="animate-pulse space-y-2" aria-hidden>
      {widths.map((w, i) => (
        <div
          key={i}
          className={`rounded ${w} ${i === 0 ? 'h-7 bg-surface-variant/50' : 'h-4 bg-surface-variant/30'}`}
        />
      ))}
    </div>
  )
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-surface-variant/40 ${className}`} />
}
