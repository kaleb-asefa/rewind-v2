import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/Icon'

import { useYearFilter } from './yearFilterContext'

export interface ChapterLink {
  id: string
  label: string
}

/** Sticky chapter pills with scroll-spy, plus the page-wide year filter. */
export function ChapterRail({ chapters }: { chapters: readonly ChapterLink[] }) {
  const [active, setActive] = useState(chapters[0]?.id)
  const track = useRef<HTMLDivElement>(null)
  const [scrollable, setScrollable] = useState(false)

  // Scroll-spy: the chapter crossing the upper third of the viewport is active.
  useEffect(() => {
    const els = chapters
      .map((c) => document.getElementById(c.id))
      .filter((e): e is HTMLElement => !!e)
    if (!els.length || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (hit) setActive(hit.target.id)
      },
      { rootMargin: '-30% 0px -60% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [chapters])

  // Keep the active pill centred in the (horizontally scrolling) rail.
  useEffect(() => {
    const el = track.current
    const pill = el?.querySelector<HTMLElement>(`[data-chapter="${active}"]`)
    if (!el || !pill) return
    el.scrollTo({
      left: pill.offsetLeft - el.clientWidth / 2 + pill.offsetWidth / 2,
      behavior: 'smooth',
    })
  }, [active])

  useEffect(() => {
    const el = track.current
    if (!el) return
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <nav
      aria-label="Chapters"
      className="sticky top-[64px] z-30 flex items-center justify-center gap-2 py-1"
    >
      <div
        ref={track}
        className={`chapter-rail-track relative flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-hairline bg-surface-container-high/80 p-1 backdrop-blur-md ${scrollable ? 'is-scrollable' : ''}`}
      >
        {chapters.map((c, i) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            data-chapter={c.id}
            aria-current={active === c.id ? 'location' : undefined}
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(c.id)?.scrollIntoView({ behavior: 'smooth' })
              history.replaceState(null, '', `#${c.id}`)
            }}
            className={`chapter-pill flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1 text-label-bold ${active === c.id ? 'chapter-pill--active' : ''}`}
          >
            {c.id === 'wrapped' ? (
              <Icon name="star" className="text-sm" />
            ) : (
              <span className="num font-mono">{String(i + 1).padStart(2, '0')}</span>
            )}
            {c.label}
          </a>
        ))}
      </div>
      <YearMenu />
    </nav>
  )
}

function YearMenu() {
  const { year, setYear, years } = useYearFilter()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!years.length) return null
  const options: (number | null)[] = [null, ...years]
  return (
    <div ref={wrap} className={`year-filter relative shrink-0 ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filter by year: ${year ?? 'All time'}`}
        onClick={() => setOpen((o) => !o)}
        className={`year-pill flex items-center gap-1.5 whitespace-nowrap rounded-full border border-hairline bg-surface-container-high/80 px-3.5 py-[7px] text-label-bold backdrop-blur-md ${year ? 'year-pill--active' : ''}`}
      >
        <Icon name="calendar_month" className="text-sm" />
        {year ?? 'All time'}
        <Icon name="expand_more" className="year-caret text-sm" />
      </button>
      <div className="year-menu" role="listbox" aria-label="Filter by year">
        {options.map((y) => (
          <button
            key={y ?? 'all'}
            type="button"
            role="option"
            aria-selected={y === year}
            onClick={() => {
              setYear(y)
              setOpen(false)
            }}
            className={`year-option ${y === year ? 'year-option--active' : ''}`}
          >
            <span className="year-option-label">{y ?? 'All time'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
