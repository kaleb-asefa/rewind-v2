import type { ComponentProps } from 'react'

/** The frosted "glass" surface used for every dashboard card. */
export function Card({ className = '', ...rest }: ComponentProps<'div'>) {
  return <div className={`glass-card rounded-lg ${className}`} {...rest} />
}
