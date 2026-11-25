import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'

import { Icon } from '@/components/Icon'

import { useTheme } from './theme'

const NAV = [
  { to: '/overview', label: 'Your Rewind' },
  { to: '/explore', label: 'Explore' },
  { to: '/charts', label: 'Charts' },
  { to: '/upload', label: 'Upload' },
] as const

function ThemeToggle() {
  const [theme, toggle] = useTheme()
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="group flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface"
    >
      <Icon
        name={theme === 'dark' ? 'light_mode' : 'dark_mode'}
        className="theme-icon text-lg group-active:rotate-[30deg] group-active:scale-90"
      />
    </button>
  )
}

function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-body-lg transition-colors duration-200 ${
      isActive
        ? 'border-b-2 border-primary pb-1 text-primary'
        : 'text-on-surface-variant hover:text-primary'
    }`

  return (
    <header
      className={`fixed top-0 z-50 w-full backdrop-blur-lg transition-shadow ${
        scrolled ? 'bg-surface shadow-spotify-card' : 'bg-surface/80 shadow-sm'
      }`}
    >
      <a
        href="#main"
        className="sr-only-focusable absolute left-4 top-2 rounded bg-primary px-3 py-1 text-on-primary"
      >
        Skip to content
      </a>
      <nav className="mx-auto flex w-full items-center justify-between px-container-padding-mobile py-4 md:px-container-padding-desktop">
        <div className="flex items-center gap-8">
          <Link
            to="/"
            className="flex items-center gap-2 text-headline-md tracking-tighter text-primary"
          >
            <Icon name="fast_rewind" filled className="text-primary" />
            Rewind
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant md:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} className="text-lg" />
          </button>
        </div>
      </nav>
      {menuOpen && (
        <div className="flex flex-col gap-4 border-t border-hairline px-container-padding-mobile py-4 md:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={linkClass} onClick={() => setMenuOpen(false)}>
              {n.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  )
}

const YEAR = new Date().getFullYear()

function Footer() {
  return (
    <footer className="w-full border-t border-hairline bg-surface-container-lowest py-section-gap">
      <div className="flex flex-col items-center justify-between gap-8 px-container-padding-mobile md:flex-row md:px-container-padding-desktop">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-label-bold uppercase tracking-widest text-on-surface-variant">
            <Icon name="auto_graph" className="text-sm" />
            Rewind Analytics
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Your listening history stays private to this browser session.
          </p>
        </div>
        <p className="text-body-sm text-on-surface-variant">© {YEAR} Rewind</p>
      </div>
    </footer>
  )
}

/** Scroll to `#anchor` targets after client-side navigation (e.g. /#how-it-works). */
function HashScroll() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const id = decodeURIComponent(hash.slice(1))
    const t = setTimeout(
      () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }),
      50,
    )
    return () => clearTimeout(t)
  }, [hash])
  return null
}

export function Layout() {
  return (
    <>
      <Header />
      <div id="main">
        <Outlet />
      </div>
      <Footer />
      <ScrollRestoration />
      <HashScroll />
    </>
  )
}
