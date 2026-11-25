import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '@/components/Icon'

/** A small "?" that explains how a derived number is worked out. */
export function HelpPopover({
  title,
  children,
  label = 'How this is worked out',
}: {
  title: string
  children: ReactNode
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: -9999, top: -9999 })
  const id = useId()

  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return
    const r = btn.current.getBoundingClientRect()
    const w = pop.current.offsetWidth
    const h = pop.current.offsetHeight
    const m = 12
    let left = r.left + r.width / 2 - w / 2
    left = Math.max(m, Math.min(left, document.documentElement.clientWidth - w - m))
    let top = r.bottom + 8
    if (top + h > window.innerHeight - m) top = Math.max(m, r.top - h - 8)
    setPos({ left, top })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('scroll', onScroll)
    }
  }, [open])

  return (
    <span className="help">
      <button
        ref={btn}
        type="button"
        className={`help-btn ${open ? 'is-open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="help" />
      </button>
      {open &&
        createPortal(
          <div ref={pop} id={id} role="dialog" aria-label={title} className="help-pop" style={pos}>
            <p className="help-title">{title}</p>
            {children}
          </div>,
          document.body,
        )}
    </span>
  )
}
