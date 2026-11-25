/** Small shared React hooks. */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'

const REDUCED = '(prefers-reduced-motion: reduce)'

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(REDUCED)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}

/** True once (or while, with `once: false`) the element is in the viewport. */
export function useInView<T extends Element>({
  rootMargin = '0px',
  threshold = 0,
  once = true,
} = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  // Without IntersectionObserver (old browsers, tests) everything counts as visible.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        setInView(entry.isIntersecting)
        if (entry.isIntersecting && once) io.disconnect()
      },
      { rootMargin, threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin, threshold, once])
  return [ref, inView]
}

/**
 * Run `tick(dtMs)` every animation frame while `active` is true. Stops entirely
 * when inactive (v1's loops kept running forever, even when paused).
 */
export function useRafLoop(tick: (dtMs: number) => void, active: boolean) {
  const tickRef = useRef(tick)
  useEffect(() => {
    tickRef.current = tick
  })
  useEffect(() => {
    if (!active) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      tickRef.current(Math.min(now - last, 100)) // clamp after tab switches
      last = now
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [active])
}

/** Fullscreen state + toggle for an element. */
export function useFullscreen<T extends HTMLElement>(): [RefObject<T | null>, boolean, () => void] {
  const ref = useRef<T>(null)
  const [isFull, setFull] = useState(false)
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void ref.current?.requestFullscreen?.()
  }
  return [ref, isFull, toggle]
}
