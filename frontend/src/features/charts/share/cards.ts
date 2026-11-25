/**
 * Canvas renderers for the share deck (ported from v1 charts_share.js).
 *
 * Seven 1080×1920 portrait story cards plus one 1920×1080 landscape recap per
 * recent year. Exported images always use this fixed dark brand palette,
 * whatever theme the page is in, so a shared card looks the same everywhere.
 */
import type { Card, DeckData, DeckItem, Recap } from './types'

export const PALETTE = {
  green: '#1ed760',
  white: '#ffffff',
  gray: 'rgba(255,255,255,0.5)',
  dark: '#0e0e0e',
  heat: [
    '#1f1f1f',
    'rgba(30,215,96,0.22)',
    'rgba(30,215,96,0.45)',
    'rgba(30,215,96,0.68)',
    '#1ed760',
  ],
} as const
const { green: GREEN, white: WHITE, gray: GRAY, dark: DARK, heat: HEAT } = PALETTE
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif"
export const PORTRAIT = { w: 1080, h: 1920 }
export const LANDSCAPE = { w: 1920, h: 1080 }
const P = 84 // portrait padding
const LP = 72 // landscape padding
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const fmtInt = (n: number | null | undefined) => Math.round(n ?? 0).toLocaleString('en-US')
const initial = (name: string | null | undefined) =>
  (
    String(name ?? '?')
      .trim()
      .charAt(0) || '?'
  ).toUpperCase()
const daysInYear = (y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365)

/** Drawing helpers bound to one context and card size. */
function painter(ctx: CanvasRenderingContext2D, CW: number, CH: number) {
  const ls = (px: number) => {
    if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${px}px`
  }
  const ellipsize = (text: string | null | undefined, maxW: number) => {
    let t = String(text ?? '')
    if (ctx.measureText(t).width <= maxW) return t
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
    return `${t}…`
  }
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
  const glow = (x: number, y: number, r: number, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(30,215,96,${alpha})`)
    g.addColorStop(1, 'rgba(30,215,96,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, CW, CH)
  }
  const background = () => {
    ctx.fillStyle = DARK
    ctx.fillRect(0, 0, CW, CH)
    const r = Math.min(CW, CH)
    glow(CW * 0.92, CH * 0.06, r * 0.8, 0.22)
    glow(CW * 0.06, CH * 0.97, r * 0.85, 0.12)
  }
  const wordmark = (y: number, x = P) => {
    ctx.fillStyle = GREEN
    ctx.beginPath()
    ctx.moveTo(x, y - 30)
    ctx.lineTo(x, y - 2)
    ctx.lineTo(x + 26, y - 16)
    ctx.closePath()
    ctx.fill()
    ctx.textAlign = 'left'
    ls(0)
    ctx.font = `800 42px ${FONT}`
    ctx.fillStyle = WHITE
    ctx.fillText('Rewind', x + 42, y)
  }
  const cover = (
    img: HTMLImageElement | null | undefined,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    fallback: string,
  ) => {
    ctx.save()
    roundRect(x, y, w, h, radius)
    ctx.clip()
    if (img) {
      const s = Math.max(w / img.width, h / img.height)
      ctx.drawImage(
        img,
        x + (w - img.width * s) / 2,
        y + (h - img.height * s) / 2,
        img.width * s,
        img.height * s,
      )
    } else {
      const g = ctx.createLinearGradient(x, y, x + w, y + h)
      g.addColorStop(0, '#1c3b28')
      g.addColorStop(1, '#0f2a1a')
      ctx.fillStyle = g
      ctx.fillRect(x, y, w, h)
      ctx.fillStyle = 'rgba(30,215,96,0.85)'
      ctx.font = `800 ${Math.round(h * 0.42)}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(fallback, x + w / 2, y + h / 2)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
    ctx.restore()
  }
  const fitFont = (text: string, maxW: number, start: number, min: number, weight: string) => {
    let px = start
    ctx.font = `${weight} ${px}px ${FONT}`
    while (px > min && ctx.measureText(text).width > maxW) {
      px -= 4
      ctx.font = `${weight} ${px}px ${FONT}`
    }
    return px
  }
  const headline = (text: string, y: number) => {
    ctx.textAlign = 'left'
    ctx.fillStyle = WHITE
    fitFont(text, CW - P * 2, 100, 64, '800')
    ctx.fillText(text, P, y)
  }
  const emptyNote = (y: number) => {
    ctx.textAlign = 'left'
    ctx.fillStyle = GRAY
    ctx.font = `500 40px ${FONT}`
    ctx.fillText('No data yet — upload your history.', P, y)
  }
  return { ls, ellipsize, roundRect, background, wordmark, cover, fitFont, headline, emptyNote }
}

const minutesLabel = (it: DeckItem | undefined, long: boolean) =>
  it?.minutes == null ? '' : `${fmtInt(it.minutes)}${long ? ' minutes' : ' min'}`

function cardIntro(ctx: CanvasRenderingContext2D, d: DeckData) {
  const { w: W, h: H } = PORTRAIT
  const p = painter(ctx, W, H)
  p.background()
  p.wordmark(P + 46)
  const pics = (d.artists.length ? d.artists : d.albums).slice(0, 4)
  const cell = 380
  const gap = 28
  const gridX = (W - (cell * 2 + gap)) / 2
  const gridY = 520
  pics.forEach((it, i) =>
    p.cover(
      it.img,
      gridX + (i % 2) * (cell + gap),
      gridY + Math.floor(i / 2) * (cell + gap),
      cell,
      cell,
      28,
      initial(it.name),
    ),
  )
  let y = gridY + cell * 2 + gap + 156
  ctx.textAlign = 'center'
  ctx.font = `800 130px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.fillText('Your Rewind', W / 2, y)
  y += 84
  p.ls(6)
  ctx.font = `700 32px ${FONT}`
  ctx.fillStyle = GRAY
  ctx.fillText('ALL-TIME LISTENING', W / 2, y)
  p.ls(0)
  ctx.textAlign = 'left'
}

function cardTop(
  ctx: CanvasRenderingContext2D,
  title: string,
  items: DeckItem[],
  opts: { circle?: boolean; showArtist?: boolean },
) {
  const { w: W, h: H } = PORTRAIT
  const p = painter(ctx, W, H)
  p.background()
  p.wordmark(P + 46)
  p.headline(title, P + 216)
  const hero = items[0]
  if (!hero) return p.emptyNote(P + 360)
  const size = 420
  const hy = 380
  p.cover(hero.img, (W - size) / 2, hy, size, size, opts.circle ? size / 2 : 40, initial(hero.name))
  ctx.textAlign = 'center'
  p.fitFont(hero.name, W - P * 2, 88, 46, '800')
  ctx.fillStyle = WHITE
  ctx.fillText(hero.name, W / 2, hy + size + 100)
  const heroSub = opts.showArtist ? hero.artist : minutesLabel(hero, true)
  if (heroSub) {
    ctx.font = `500 40px ${FONT}`
    ctx.fillStyle = GREEN
    ctx.fillText(p.ellipsize(heroSub, W - P * 2), W / 2, hy + size + 158)
  }
  ctx.textAlign = 'left'
  const rows = items.slice(1, 5)
  if (!rows.length) return
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(P, 1024)
  ctx.lineTo(W - P, 1024)
  ctx.stroke()
  const top = 1090
  const rowH = (H - 150 - top) / rows.length
  const thumb = Math.min(124, rowH - 46)
  const coverX = P + 84
  const nameX = coverX + thumb + 32
  const maxW = W - nameX - P
  rows.forEach((it, i) => {
    const cy = top + i * rowH + rowH / 2
    ctx.textBaseline = 'middle'
    ctx.fillStyle = GREEN
    ctx.font = `800 48px ${FONT}`
    ctx.fillText(String(i + 2), P, cy)
    p.cover(
      it.img,
      coverX,
      cy - thumb / 2,
      thumb,
      thumb,
      opts.circle ? thumb / 2 : 20,
      initial(it.name),
    )
    const sub = opts.showArtist ? it.artist : minutesLabel(it, false)
    ctx.fillStyle = WHITE
    ctx.font = `700 46px ${FONT}`
    ctx.fillText(p.ellipsize(it.name, maxW), nameX, sub ? cy - 20 : cy)
    if (sub) {
      ctx.fillStyle = GRAY
      ctx.font = `500 32px ${FONT}`
      ctx.fillText(p.ellipsize(sub, maxW), nameX, cy + 26)
    }
    ctx.textBaseline = 'alphabetic'
  })
}

function cardGenres(ctx: CanvasRenderingContext2D, d: DeckData) {
  const { w: W, h: H } = PORTRAIT
  const p = painter(ctx, W, H)
  p.background()
  p.wordmark(P + 46)
  p.headline('Top genres', P + 216)
  const rows = d.genres.slice(0, 5)
  if (!rows.length) return p.emptyNote(P + 360)
  const top = 500
  const rowH = (H - 180 - top) / rows.length
  const barH = Math.min(150, rowH - 34)
  rows.forEach((it, i) => {
    const y = top + i * rowH + (rowH - barH) / 2
    p.roundRect(P, y, W - P * 2, barH, barH / 2)
    ctx.fillStyle = `hsl(146,63%,${60 - i * 8}%)`
    ctx.fill()
    ctx.fillStyle = i < 2 ? '#0b1f13' : 'rgba(255,255,255,0.92)'
    ctx.font = `800 52px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), P + 52, y + barH / 2)
    ctx.fillText(p.ellipsize(it.name, W - P * 2 - 220), P + 160, y + barH / 2)
    ctx.textBaseline = 'alphabetic'
  })
}

function cardMinutes(ctx: CanvasRenderingContext2D, d: DeckData) {
  const { w: W, h: H } = PORTRAIT
  const p = painter(ctx, W, H)
  p.background()
  p.wordmark(P + 46)
  ctx.textAlign = 'center'
  p.ls(6)
  ctx.font = `700 34px ${FONT}`
  ctx.fillStyle = GREEN
  ctx.fillText('YOU LISTENED FOR', W / 2, H / 2 - 190)
  p.ls(0)
  const total = fmtInt(d.totalMinutes)
  p.fitFont(total, W - P * 2, 250, 110, '800')
  ctx.fillStyle = WHITE
  ctx.fillText(total, W / 2, H / 2 + 40)
  p.ls(8)
  ctx.font = `700 34px ${FONT}`
  ctx.fillStyle = GRAY
  ctx.fillText('MINUTES OF MUSIC', W / 2, H / 2 + 150)
  p.ls(0)
  ctx.textAlign = 'left'
}

export function vibeOf(v: DeckData['vibe']) {
  if (!v) return { word: 'Eclectic', phrase: 'a bit of everything' }
  if (v.energy >= 0.5)
    return v.valence >= 0.5
      ? { word: 'Upbeat', phrase: 'bright, high-energy songs' }
      : { word: 'Intense', phrase: 'dark, high-energy songs' }
  return v.valence >= 0.5
    ? { word: 'Feel-good', phrase: 'warm, easy-going songs' }
    : { word: 'Moody', phrase: 'slow, emotional songs' }
}

function cardVibe(ctx: CanvasRenderingContext2D, d: DeckData) {
  const { w: W, h: H } = PORTRAIT
  const p = painter(ctx, W, H)
  const vibe = vibeOf(d.vibe)
  const back = d.tracks[0]?.img ?? d.artists[0]?.img
  p.background()
  if (back) {
    ctx.save()
    ctx.globalAlpha = 0.28
    const s = Math.max(W / back.width, H / back.height)
    ctx.drawImage(
      back,
      (W - back.width * s) / 2,
      (H - back.height * s) / 2,
      back.width * s,
      back.height * s,
    )
    ctx.restore()
    ctx.fillStyle = 'rgba(14,14,14,0.62)'
    ctx.fillRect(0, 0, W, H)
  }
  p.wordmark(P + 46)
  ctx.textAlign = 'center'
  p.ls(6)
  ctx.font = `700 30px ${FONT}`
  ctx.fillStyle = GREEN
  ctx.fillText('YOUR VIBE', W / 2, H / 2 - 120)
  p.ls(0)
  ctx.font = `800 150px ${FONT}`
  ctx.fillStyle = WHITE
  ctx.fillText(vibe.word, W / 2, H / 2 + 20)
  ctx.font = `500 46px ${FONT}`
  ctx.fillStyle = GRAY
  ctx.fillText(`You lean toward ${vibe.phrase}.`, W / 2, H / 2 + 110)
  ctx.textAlign = 'left'
}

interface Tile {
  label: string
  value: string
  sub?: string
  img?: HTMLImageElement | null
  withImg?: boolean
  circle?: boolean
  accent?: boolean
}

function cardRecap(ctx: CanvasRenderingContext2D, r: Recap) {
  const { w: W, h: H } = LANDSCAPE
  const p = painter(ctx, W, H)
  const heat = r.heat
  p.background()
  p.wordmark(LP + 46, LP)
  ctx.textAlign = 'right'
  ctx.font = `800 62px ${FONT}`
  ctx.fillStyle = GREEN
  ctx.fillText(String(r.year), W - LP, LP + 50)
  ctx.textAlign = 'left'
  const gap = 24
  const tw = (W - LP * 2 - gap * 3) / 4
  const th = 214

  const tile = (x: number, y: number, t: Tile) => {
    p.roundRect(x, y, tw, th, 24)
    ctx.fillStyle = 'rgba(255,255,255,0.045)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.textAlign = 'left'
    p.ls(3)
    ctx.font = `700 22px ${FONT}`
    ctx.fillStyle = GRAY
    ctx.fillText(p.ellipsize(t.label, tw - 60), x + 30, y + 52)
    p.ls(0)
    let tx = x + 30
    if (t.withImg) {
      const s = 76
      p.cover(t.img, x + 30, y + 84, s, s, t.circle ? s / 2 : 14, initial(t.value))
      tx += s + 20
    }
    const maxW = tw - (tx - x) - 30
    ctx.fillStyle = WHITE
    p.fitFont(t.value, maxW, 46, 28, '800')
    ctx.fillText(p.ellipsize(t.value, maxW), tx, y + 136)
    if (t.sub) {
      ctx.fillStyle = t.accent ? GREEN : GRAY
      ctx.font = `500 26px ${FONT}`
      ctx.fillText(p.ellipsize(t.sub, maxW), tx, y + 176)
    }
  }
  const streams = (it: DeckItem | null) =>
    it?.streams != null ? `${fmtInt(it.streams)} streams` : ''
  ;[
    {
      label: 'TOP ARTIST',
      value: r.artist?.name ?? '—',
      sub: streams(r.artist),
      img: r.artist?.img,
      withImg: true,
      circle: true,
    },
    {
      label: 'TOP SONG',
      value: r.track?.name ?? '—',
      sub: r.track?.artist ?? '',
      img: r.track?.img,
      withImg: true,
    },
    {
      label: 'TOP ALBUM',
      value: r.album?.name ?? '—',
      sub: r.album?.artist ?? '',
      img: r.album?.img,
      withImg: true,
    },
    { label: 'TOP GENRE', value: r.genre?.name ?? '—', sub: streams(r.genre) },
  ].forEach((t, i) => tile(LP + i * (tw + gap), 170, t))

  // Activity heatmap
  const gridY = 480
  const gx = LP + 54
  const offset = new Date(Date.UTC(r.year, 0, 1)).getUTCDay()
  const total = offset + daysInYear(r.year)
  const step = (W - LP * 2 - 54) / Math.ceil(total / 7)
  const cell = step - 5
  const level = new Map(heat.days.map((d) => [d.date, d.level]))
  ctx.textAlign = 'left'
  p.ls(2)
  ctx.font = `600 22px ${FONT}`
  ctx.fillStyle = GRAY
  for (let m = 0; m < 12; m++) {
    const day = offset + Math.round((Date.UTC(r.year, m, 1) - Date.UTC(r.year, 0, 1)) / 86400000)
    ctx.fillText(MONTHS[m]!, gx + Math.floor(day / 7) * step, gridY - 16)
  }
  p.ls(0)
  ctx.textAlign = 'right'
  ctx.font = `500 20px ${FONT}`
  ;['', 'Mon', '', 'Wed', '', 'Fri', ''].forEach(
    (lab, row) => lab && ctx.fillText(lab, gx - 16, gridY + row * step + cell * 0.8),
  )
  ctx.textAlign = 'left'
  for (let i = offset; i < total; i++) {
    const day = new Date(Date.UTC(r.year, 0, 1 + i - offset)).toISOString().slice(0, 10)
    p.roundRect(gx + Math.floor(i / 7) * step, gridY + (i % 7) * step, cell, cell, 4)
    ctx.fillStyle = HEAT[level.get(day) ?? 0] ?? HEAT[0]
    ctx.fill()
  }
  // Legend
  const ly = gridY + 7 * step + 34
  ctx.font = `500 20px ${FONT}`
  let lx = W - LP - 212
  ctx.fillStyle = GRAY
  ctx.fillText('Less', lx, ly)
  lx += 46
  HEAT.forEach((c) => {
    p.roundRect(lx, ly - 14, 16, 16, 4)
    ctx.fillStyle = c
    ctx.fill()
    lx += 22
  })
  ctx.fillStyle = GRAY
  ctx.fillText('More', lx + 8, ly)

  const loyal = r.loyal
  ;[
    {
      label: 'MINUTES',
      value: fmtInt(heat.total_minutes),
      sub: `${fmtInt(heat.total_minutes / 60)} hours`,
      accent: true,
    },
    { label: 'STREAMS', value: fmtInt(heat.total_streams), sub: 'songs played' },
    { label: 'ACTIVE DAYS', value: fmtInt(heat.active_days), sub: `of ${daysInYear(r.year)}` },
    {
      label:
        loyal?.plays != null ? `NEVER SKIPPED · ${fmtInt(loyal.plays)} plays` : 'NEVER SKIPPED',
      value: loyal?.name ?? '—',
      sub: loyal?.artist ?? '',
      img: loyal?.img,
      withImg: true,
    },
  ].forEach((t, i) => tile(LP + i * (tw + gap), 768, t))
}

export function cardNoData(ctx: CanvasRenderingContext2D) {
  const { w: W, h: H } = PORTRAIT
  const p = painter(ctx, W, H)
  p.background()
  p.wordmark(200)
  ctx.textAlign = 'center'
  ctx.fillStyle = WHITE
  ctx.font = `800 68px ${FONT}`
  ctx.fillText('Nothing to share yet', W / 2, H / 2 - 20)
  ctx.fillStyle = GRAY
  ctx.font = `500 42px ${FONT}`
  ctx.fillText('Upload your Spotify history first.', W / 2, H / 2 + 54)
  ctx.textAlign = 'left'
}

export function cardLoading(ctx: CanvasRenderingContext2D) {
  const { w: W, h: H } = PORTRAIT
  painter(ctx, W, H).background()
  ctx.textAlign = 'center'
  ctx.fillStyle = WHITE
  ctx.font = `700 52px ${FONT}`
  ctx.fillText('Building your cards…', W / 2, H / 2)
  ctx.textAlign = 'left'
}

/** The deck for a dataset: 7 portrait cards + one landscape recap per year. */
export function buildDeck(d: DeckData | null): Card[] {
  const portrait = (title: string, render: Card['render']): Card => ({ title, ...PORTRAIT, render })
  if (!d) return [portrait('Rewind', cardNoData)]
  return [
    portrait('Intro', (c) => cardIntro(c, d)),
    portrait('Top artists', (c) => cardTop(c, 'Top artists', d.artists, { circle: true })),
    portrait('Top songs', (c) => cardTop(c, 'Top songs', d.tracks, { showArtist: true })),
    portrait('Top albums', (c) => cardTop(c, 'Top albums', d.albums, { showArtist: true })),
    portrait('Top genres', (c) => cardGenres(c, d)),
    portrait('Minutes', (c) => cardMinutes(c, d)),
    portrait('Your vibe', (c) => cardVibe(c, d)),
    ...d.recaps.map((r) => ({
      title: String(r.year),
      ...LANDSCAPE,
      render: (c: CanvasRenderingContext2D) => cardRecap(c, r),
    })),
  ]
}
