import { useId, useState, type ReactNode } from 'react'

import { atPointer } from '@/components/FloatingTooltip'
import { TipBody } from '@/components/TipBody'

import type { Tip } from './tips'

interface Props {
  values: number[]
  /** Tooltip title/value for point i. */
  tipFor: (i: number) => [ReactNode, ReactNode]
  tip: Tip
  width: number
  height: number
  pad?: number
  /** 'zero' = 0..max (volumes); 'range' = min..max (trends). */
  scale?: 'zero' | 'range'
  /** 'gradient' fades to transparent; 'flat' is a light tint. */
  fill?: 'gradient' | 'flat'
  className?: string
  label: string
}

/** Line + area with a hover dot/rule (season curve, nostalgia, trend sparklines). */
export function AreaLine({
  values,
  tipFor,
  tip,
  width: W,
  height: H,
  pad = 8,
  scale = 'range',
  fill = 'gradient',
  className = 'mt-4 h-auto w-full',
  label,
}: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const gid = useId()
  if (values.length < 2) return null
  const min = scale === 'zero' ? 0 : Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = (W - pad * 2) / (values.length - 1)
  const pts = values.map(
    (v, i) => [pad + i * step, pad + (1 - (v - min) / span) * (H - pad * 2)] as const,
  )
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts.at(-1)![0].toFixed(1)} ${H - pad} L${pts[0]![0].toFixed(1)} ${H - pad} Z`
  const hp = hover != null ? pts[hover] : undefined
  const show = (i: number) => (e: React.MouseEvent) => {
    setHover(i)
    const [t, v] = tipFor(i)
    tip.show(atPointer(e), <TipBody title={t} value={v} />)
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={label}>
      {fill === 'gradient' && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent-rgb))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(var(--accent-rgb))" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      <path
        d={area}
        fill={fill === 'gradient' ? `url(#${CSS.escape(gid)})` : 'rgba(var(--accent-rgb), 0.14)'}
      />
      <path
        d={line}
        fill="none"
        stroke="rgb(var(--accent-rgb))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {hp && (
        <>
          <line
            x1={hp[0]}
            x2={hp[0]}
            y1={0}
            y2={H}
            stroke="rgb(var(--accent-rgb))"
            strokeOpacity="0.3"
            strokeWidth="1"
            pointerEvents="none"
          />
          <circle
            cx={hp[0]}
            cy={hp[1]}
            r="4.5"
            fill="var(--emphasis)"
            stroke="rgb(var(--accent-rgb))"
            strokeWidth="2.5"
            pointerEvents="none"
          />
        </>
      )}
      {values.map((_, i) => (
        <rect
          key={i}
          className="evo-hit"
          x={pad + i * step - step / 2}
          y={0}
          width={step}
          height={H}
          fill="transparent"
          onMouseEnter={show(i)}
          onMouseMove={show(i)}
          onMouseLeave={() => {
            setHover(null)
            tip.hide()
          }}
        />
      ))}
    </svg>
  )
}
