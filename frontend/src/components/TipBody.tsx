import type { ReactNode } from 'react'

/** The two-line chart tooltip body (title + accent value). */
export function TipBody({ title, value }: { title: ReactNode; value: ReactNode }) {
  return (
    <>
      <span className="rt-title">{title}</span>
      <span className="rt-val">{value}</span>
    </>
  )
}
