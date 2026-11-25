import { useState } from 'react'

import type { CoverCarrier, CoverKind } from '@/api/types'

import { useItemCover } from './useCover'

interface Props {
  item: CoverCarrier | null | undefined
  kind: CoverKind
  alt?: string
  className?: string
  /** Shown until the image has loaded (and if it never does). */
  fallbackIcon?: string
}

/**
 * Cover art for an API item. Renders a quiet placeholder until the image has
 * actually decoded, so a slow or missing cover never flashes a broken image.
 */
export function CoverImage({ item, kind, alt = '', className = '', fallbackIcon }: Props) {
  const url = useItemCover(item, kind)
  const [loaded, setLoaded] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const icon = fallbackIcon ?? (kind === 'artist' ? 'person' : 'album')
  const show = url && loaded === url && failed !== url

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-surface-container-highest text-on-surface-variant ${className}`}
    >
      {!show && (
        <span aria-hidden className="material-symbols-outlined text-[1.1em] opacity-60">
          {icon}
        </span>
      )}
      {url && failed !== url && (
        <img
          src={url}
          alt={alt}
          decoding="async"
          loading="lazy"
          onLoad={() => setLoaded(url)}
          onError={() => setFailed(url)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </span>
  )
}
