import type { ReactNode } from 'react'

interface Option<T extends string | number> {
  value: T
  label: ReactNode
}

interface Props<T extends string | number> {
  options: readonly Option<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  /** v1 class for the active-pill look: chart-tab | chart-sort | depth-btn | range-tab */
  variant?: 'chart-tab' | 'chart-sort' | 'depth-btn' | 'range-tab'
  className?: string
  buttonClassName?: string
}

/** A segmented pill control (radio-group semantics). */
export function PillTabs<T extends string | number>({
  options,
  value,
  onChange,
  label,
  variant = 'range-tab',
  className = '',
  buttonClassName = 'px-3.5 py-1.5',
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex items-center rounded-full bg-surface-container-high p-1 ${className}`}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`${variant} ${o.value === value ? 'is-active' : ''} flex items-center gap-1.5 whitespace-nowrap rounded-full text-label-bold transition-all ${buttonClassName}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
