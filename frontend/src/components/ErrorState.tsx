import type { ApiError } from '@/api/client'

interface Props {
  error: ApiError | Error | null
  onRetry?: () => void
  compact?: boolean
}

/** Inline error with a retry link (metric cards and chart panels). */
export function ErrorState({ error, onRetry, compact }: Props) {
  return (
    <div
      role="alert"
      className={`space-y-1 text-error ${compact ? 'text-[12px]' : 'text-body-sm'}`}
    >
      <p className="opacity-90">{error?.message ?? 'Server not responding.'}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-[11px] font-bold text-primary underline hover:text-on-surface"
        >
          Click to retry
        </button>
      )}
    </div>
  )
}
