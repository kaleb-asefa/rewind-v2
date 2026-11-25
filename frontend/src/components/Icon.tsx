interface Props {
  name: string
  filled?: boolean
  className?: string
  label?: string
}

/** A Material Symbols glyph. Decorative unless `label` is given. */
export function Icon({ name, filled, className = '', label }: Props) {
  return (
    <span
      className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  )
}
