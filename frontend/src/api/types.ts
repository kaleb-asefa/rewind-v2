/** Friendly aliases for the generated API schema types. */
import type { components } from './schema'

export type Schemas = components['schemas']
export type CoverKind = 'artist' | 'album' | 'track'

/** Anything that can carry cover art (see docs/API_CONTRACT.md "Covers"). */
export interface CoverCarrier {
  id?: string | null
  cover_kind?: CoverKind | null
  cover_id?: string | null
  image_url?: string | null
}
