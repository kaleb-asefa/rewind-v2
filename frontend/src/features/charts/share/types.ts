import type { CoverCarrier } from '@/api/types'

/** One entity drawn on a card; `img` is attached once its cover has loaded. */
export interface DeckItem extends CoverCarrier {
  name: string
  artist?: string | null
  minutes?: number | null
  streams?: number | null
  plays?: number | null
  img?: HTMLImageElement | null
}

export interface HeatDay {
  date: string
  level: number
}

export interface Recap {
  year: number
  heat: {
    year: number
    active_days: number
    total_streams: number
    total_minutes: number
    days: HeatDay[]
  }
  artist: DeckItem | null
  track: DeckItem | null
  album: DeckItem | null
  genre: DeckItem | null
  loyal: DeckItem | null
}

export interface DeckData {
  artists: DeckItem[]
  tracks: DeckItem[]
  albums: DeckItem[]
  genres: DeckItem[]
  totalMinutes: number
  vibe: { energy: number; valence: number } | null
  recaps: Recap[]
}

export interface Card {
  title: string
  w: number
  h: number
  render: (ctx: CanvasRenderingContext2D) => void
}
