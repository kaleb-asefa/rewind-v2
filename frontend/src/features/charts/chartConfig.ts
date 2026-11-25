import type { CoverKind } from '@/api/types'

export type Entity = 'artist' | 'track' | 'album' | 'genre'
export type Sort = 'minutes' | 'streams'

export const ENTITIES: Record<
  Entity,
  { label: string; icon: string; cover: CoverKind | null; round: boolean; hasArtist: boolean }
> = {
  artist: { label: 'Artists', icon: 'artist', cover: 'artist', round: true, hasArtist: false },
  track: { label: 'Tracks', icon: 'music_note', cover: 'track', round: false, hasArtist: true },
  album: { label: 'Albums', icon: 'album', cover: 'album', round: false, hasArtist: true },
  genre: { label: 'Genres', icon: 'category', cover: null, round: false, hasArtist: false },
}

export const DEPTHS = [5, 10, 20, 50, 100] as const

export const RANGE_LABEL: Record<string, string> = {
  all: 'All-time',
  '6m': 'Last 6 months',
  '4w': 'Last 4 weeks',
}
export const rangeLabel = (r: string) => RANGE_LABEL[r] ?? r

export function rangeOptions(years: readonly number[]) {
  return [
    { value: 'all', label: 'All-time' },
    { value: '6m', label: '6 months' },
    { value: '4w', label: '4 weeks' },
    ...years.map((y) => ({ value: String(y), label: String(y) })),
  ]
}

export function fmtMinutesShort(m: number): string {
  const r = Math.round(m || 0)
  if (r < 60) return `${r}m`
  const h = Math.floor(r / 60)
  const rem = r % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

export function rankClass(rank: number): string {
  if (rank === 1) return 'text-primary'
  if (rank === 2) return 'text-primary/80'
  if (rank === 3) return 'text-primary/60'
  return 'text-on-surface-variant'
}

export const fmtDay = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`
}
