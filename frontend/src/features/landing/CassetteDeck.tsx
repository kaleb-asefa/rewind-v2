import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'

import { usePrefersReducedMotion } from '@/lib/hooks'

export interface CassetteHandle {
  /** Spin the reels fast and run the counter back to 00:00, then call `done`. */
  rewind(done: () => void): void
}

function format(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function Reel() {
  return (
    <svg
      className="reel-spin h-14 w-14 text-on-surface-variant md:h-16 md:w-16"
      viewBox="0 0 100 100"
      fill="none"
      style={{ animationDuration: '2.6s' }}
      aria-hidden
    >
      <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="3" opacity="0.35" />
      <circle cx="50" cy="50" r="16" stroke="currentColor" strokeWidth="4" />
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <line x1="50" y1="12" x2="50" y2="30" />
        <line x1="50" y1="70" x2="50" y2="88" />
        <line x1="12" y1="50" x2="30" y2="50" />
        <line x1="70" y1="50" x2="88" y2="50" />
      </g>
    </svg>
  )
}

/** The hero's tape deck: reels turn backwards and a counter ticks up. */
export function CassetteDeck({ ref }: { ref?: Ref<CassetteHandle> }) {
  const reduced = usePrefersReducedMotion()
  const [seconds, setSeconds] = useState(0)
  const [rewinding, setRewinding] = useState(false)
  const secondsRef = useRef(0)

  useEffect(() => {
    if (reduced || rewinding) return
    const id = setInterval(() => {
      secondsRef.current += 1
      setSeconds(secondsRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, [reduced, rewinding])

  useImperativeHandle(ref, () => ({
    rewind(done) {
      if (reduced) return done()
      setRewinding(true)
      let remaining = secondsRef.current
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        clearInterval(id)
        done()
      }
      const id = setInterval(() => {
        remaining = Math.max(0, remaining - 4)
        setSeconds(remaining)
        if (remaining <= 0) finish()
      }, 30)
      setTimeout(finish, 700) // safety net if the interval stalls
    },
  }))

  return (
    <div
      className={`cassette-deck mx-auto mb-10 w-full max-w-sm rounded-xl border border-outline-variant/40 bg-surface-container-high p-6 ${rewinding ? 'is-rewinding' : ''}`}
    >
      <div className="mb-5 flex items-center justify-between px-8">
        <Reel />
        <Reel />
      </div>
      <div className="flex items-center justify-between gap-3 rounded border border-outline-variant/30 bg-surface-dim px-4 py-3 font-mono">
        <span className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
          Side A
        </span>
        <span className="text-[10px] tracking-[0.1em] text-primary" aria-hidden>
          {format(seconds)}
        </span>
      </div>
    </div>
  )
}
