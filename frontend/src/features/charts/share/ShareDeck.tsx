import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '@/components/Icon'

import { PORTRAIT, buildDeck, cardLoading } from './cards'
import { attachCovers, loadDeckData } from './deckData'
import type { Card } from './types'

const COVER_WAIT_MS = 12_000

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.hidden = true
  document.body.append(a) // some browsers ignore clicks on detached anchors
  a.click()
  a.remove()
  // Revoking immediately can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Wrapped-style share deck: a carousel of canvas cards, exported as PNGs.
 * The preview canvas IS the exported image.
 */
export default function ShareDeck({
  years,
  onClose,
}: {
  years: readonly number[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const canvas = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const [deck, setDeck] = useState<Card[] | null>(null)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const covers = useRef<Promise<void> | null>(null)
  const paintRef = useRef(() => {})
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator

  // Build once: wait for fonts (canvas text needs them loaded), load the data,
  // then attach covers in the background, repainting as they arrive.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await document.fonts?.ready.catch(() => undefined)
      const data = await loadDeckData(queryClient, years)
      if (cancelled) return
      setDeck(buildDeck(data))
      if (data) covers.current = attachCovers(data, () => !cancelled && paintRef.current())
    })()
    return () => {
      cancelled = true
    }
  }, [queryClient, years])

  const card = deck ? (deck[((index % deck.length) + deck.length) % deck.length] ?? null) : null

  const paint = useCallback((c: Card | null) => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const w = c?.w ?? PORTRAIT.w
    const h = c?.h ?? PORTRAIT.h
    if (el.width !== w || el.height !== h) {
      el.width = w // resizing also clears
      el.height = h
    }
    if (c) c.render(ctx)
    else cardLoading(ctx)
  }, [])

  // Fit the preview to the space available, honouring the card's aspect.
  const fit = useCallback(() => {
    const el = canvas.current
    const stack = frame.current?.parentElement
    const modal = dialog.current
    if (!el || !frame.current || !stack || !modal) return
    const chrome = stack.scrollHeight - frame.current.offsetHeight
    const avail = modal.clientHeight - 32 - chrome - 8
    const aspect = el.width / el.height
    let height = Math.max(240, Math.min(720, avail))
    let width = height * aspect
    const maxW = modal.clientWidth - 32
    if (width > maxW) {
      width = maxW
      height = width / aspect
    }
    el.style.height = `${Math.round(height)}px`
    el.style.width = `${Math.round(width)}px`
  }, [])

  useLayoutEffect(() => {
    paint(card)
    fit()
  }, [card, paint, fit])

  // Covers arrive after the deck is built: repaint whichever card is showing.
  useEffect(() => {
    paintRef.current = () => paint(card)
  }, [card, paint])

  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [fit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setIndex((i) => i - 1)
      else if (e.key === 'ArrowRight') setIndex((i) => i + 1)
    }
    document.addEventListener('keydown', onKey)
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [onClose])

  const coversSettled = () =>
    Promise.race([
      covers.current ?? Promise.resolve(),
      new Promise<void>((r) => setTimeout(r, COVER_WAIT_MS)),
    ])

  const toBlob = () =>
    new Promise<Blob | null>((resolve) => {
      const el = canvas.current
      if (!el) return resolve(null)
      el.toBlob(resolve, 'image/png') // toBlob returns void; it calls back
    })

  async function exportCurrent(share: boolean) {
    if (!card) return
    setBusy(true)
    await coversSettled()
    paint(card)
    const blob = await toBlob()
    setBusy(false)
    if (!blob) return
    const name = `rewind-${slug(card.title)}.png`
    if (!share) return download(blob, name)
    const file = new File([blob], name, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My Rewind' })
      } catch {
        // dismissed
      }
    }
  }

  async function exportAll() {
    if (!deck) return
    setBusy(true)
    await coversSettled()
    for (const [i, c] of deck.entries()) {
      paint(c)
      const blob = await toBlob()
      if (blob) download(blob, `rewind-${String(i + 1).padStart(2, '0')}-${slug(c.title)}.png`)
      await new Promise((r) => setTimeout(r, 250)) // let each download register
    }
    paint(card)
    fit()
    setBusy(false)
  }

  const n = deck?.length ?? 0
  const current = n ? ((index % n) + n) % n : 0

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Share your Rewind"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 outline-none backdrop-blur-sm"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="share-scroller relative flex max-h-full flex-col items-center gap-4 overflow-y-auto">
        <div
          ref={frame}
          className="relative shrink-0 overflow-hidden rounded-2xl shadow-2xl shadow-black/50"
        >
          <canvas
            ref={canvas}
            width={PORTRAIT.w}
            height={PORTRAIT.h}
            role="img"
            aria-label={card ? `Share card: ${card.title}` : 'Building your cards'}
            className="block"
            style={{
              height: 'clamp(240px, calc(100dvh - 260px), 720px)',
              aspectRatio: '1080 / 1920',
            }}
          />
          {n > 1 && (
            <>
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                aria-label="Previous card"
                className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 active:scale-95"
              >
                <Icon name="chevron_left" />
              </button>
              <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                aria-label="Next card"
                className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 active:scale-95"
              >
                <Icon name="chevron_right" />
              </button>
            </>
          )}
        </div>
        <div className="text-body-sm font-bold text-white/70" aria-live="polite">
          {n ? `${current + 1} / ${n}` : 'Loading…'}
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: n }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Card ${i + 1}`}
              aria-current={i === current}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${i === current ? 'w-5 bg-primary' : 'w-2 bg-white/30'}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={!card || busy}
            onClick={() => exportCurrent(false)}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-on-primary transition hover:bg-primary-container hover:text-on-primary-container active:scale-95 disabled:opacity-60"
          >
            <Icon name="download" className="text-lg" /> Save this
          </button>
          <button
            type="button"
            disabled={!deck || busy}
            onClick={exportAll}
            className="flex items-center gap-2 rounded-full bg-surface-container-high px-5 py-3 font-bold text-on-surface transition hover:bg-surface-container-highest active:scale-95 disabled:opacity-60"
          >
            <Icon name="photo_library" className="text-lg" /> Save all {n || ''}
          </button>
          {canShare && (
            <button
              type="button"
              disabled={!card || busy}
              onClick={() => exportCurrent(true)}
              className="flex items-center gap-2 rounded-full bg-surface-container-high px-5 py-3 font-bold text-on-surface transition hover:bg-surface-container-highest active:scale-95 disabled:opacity-60"
            >
              <Icon name="ios_share" className="text-lg" /> Share
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-full bg-surface-container px-5 py-3 font-bold text-on-surface-variant transition-all hover:text-on-surface"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
