import { useCallback, useEffect, useSyncExternalStore } from 'react'

import type { CoverCarrier, CoverKind } from '@/api/types'

import { coverRef, getCoverUrl, subscribeCover, watchCover } from './coverCache'

/** The cover URL for `(kind, id)`, resolving it in the background if needed. */
export function useCoverUrl(kind: CoverKind, id: string | null | undefined): string | null {
  const subscribe = useCallback(
    (cb: () => void) => (id ? subscribeCover(kind, id, cb) : () => {}),
    [kind, id],
  )
  const url = useSyncExternalStore(subscribe, () => getCoverUrl(kind, id))
  useEffect(() => (id ? watchCover(kind, id) : undefined), [kind, id])
  return url
}

/** Cover URL for an API item (honours `cover_kind`/`cover_id`, then `image_url`). */
export function useItemCover(item: CoverCarrier | null | undefined, defaultKind: CoverKind) {
  const ref = coverRef(item, defaultKind)
  const resolved = useCoverUrl(ref.kind, ref.id)
  return resolved ?? item?.image_url ?? null
}
