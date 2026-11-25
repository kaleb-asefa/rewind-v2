import type { ReactNode } from 'react'

import { atPointer, type useFloatingTooltip } from '@/components/FloatingTooltip'
import { TipBody } from '@/components/TipBody'

export type Tip = ReturnType<typeof useFloatingTooltip>

/** Hover handlers that show a cursor-following "title / value" tooltip. */
export function hoverTip(tip: Tip, title: ReactNode, value: ReactNode) {
  const show = (e: React.MouseEvent) =>
    tip.show(atPointer(e), <TipBody title={title} value={value} />)
  return { onMouseEnter: show, onMouseMove: show, onMouseLeave: tip.hide }
}

export const SHADE = {
  solid: 'rgb(var(--accent-rgb))',
  strong: 'rgba(var(--accent-rgb), 0.6)',
  mid: 'rgba(var(--accent-rgb), 0.3)',
  faint: 'rgba(var(--accent-rgb), 0.28)',
} as const
