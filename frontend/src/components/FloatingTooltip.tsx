import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Anchor {
  left: number
  top: number
  width: number
  height: number
}

interface State {
  anchor: Anchor
  content: ReactNode
}

const MARGIN = 8 // viewport edge padding
const GAP = 6 // distance from the anchor

/**
 * One floating tooltip rendered into <body> (so no card can clip it), centred
 * above its anchor, flipped below when there's no room, clamped to the viewport.
 *
 *   const tip = useFloatingTooltip()
 *   <rect onMouseEnter={(e) => tip.show(e.currentTarget, <b>…</b>)} onMouseLeave={tip.hide} />
 *   {tip.node}
 */
export function useFloatingTooltip(className = 'rhythm-tooltip') {
  const [state, setState] = useState<State | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const show = useCallback((target: Element | Anchor, content: ReactNode) => {
    const r = target instanceof Element ? target.getBoundingClientRect() : target
    setState({ anchor: { left: r.left, top: r.top, width: r.width, height: r.height }, content })
  }, [])
  const hide = useCallback(() => setState(null), [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!state || !el) return setPos(null)
    const { anchor } = state
    const tw = el.offsetWidth
    const th = el.offsetHeight
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    let left = anchor.left + anchor.width / 2 - tw / 2
    left = Math.max(MARGIN, Math.min(left, vw - tw - MARGIN))
    let top = anchor.top - th - GAP
    if (top < MARGIN) top = anchor.top + anchor.height + GAP
    top = Math.max(MARGIN, Math.min(top, vh - th - MARGIN))
    setPos({ left: Math.round(left), top: Math.round(top) })
  }, [state])

  const node = createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={`${className} ${state && pos ? 'visible' : ''}`}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      {state?.content}
    </div>,
    document.body,
  )

  return { show, hide, node, open: state !== null }
}
