import { useQuery } from '@tanstack/react-query'

import { ApiError, apiGet } from '@/api/client'
import { Icon } from '@/components/Icon'

/**
 * Warns when the API this page talks to isn't a Rewind v2 backend — e.g. the dev
 * proxy pointing at an old v1 server, which half-works (same endpoints) but
 * lacks every v2 fix — or when no API answers at all.
 */
export function BackendCheck() {
  const health = useQuery({
    queryKey: ['backend-health'],
    queryFn: ({ signal }) => apiGet('/api/health', undefined, { signal, timeoutMs: 5000 }),
    retry: false,
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.status === 'error' ? 10_000 : false),
  })
  if (!health.isError) return null
  const notV2 = health.error instanceof ApiError && health.error.status === 404
  return (
    <div role="alert" className="fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3">
      <div className="flex max-w-3xl items-start gap-3 rounded-lg border border-error/30 bg-surface-container-high px-4 py-3 text-body-sm text-on-surface shadow-spotify-dialog">
        <Icon name="warning" className="text-error" />
        <p>
          {notV2 ? (
            <>
              <b>This page is talking to an old Rewind server</b> (the API has no{' '}
              <code className="font-mono">/api/health</code>, so it isn't v2). Data may load, but v2
              fixes won&apos;t apply. Start the v2 backend with{' '}
              <code className="font-mono">make api</code> (port 8010), or point{' '}
              <code className="font-mono">REWIND_API</code> at it, then reload.
            </>
          ) : (
            <>
              <b>Can&apos;t reach the Rewind API.</b> Start it with{' '}
              <code className="font-mono">make api</code> (or{' '}
              <code className="font-mono">make dev</code>), then this message will clear.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
