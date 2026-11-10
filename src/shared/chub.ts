/**
 * Finding lorebooks on Chub (docs/spec/07-memory-and-lore.md#finding-lorebooks-on-chub), as the
 * interface and the server both see them.
 */

export const CHUB_SITE = 'https://chub.ai'

export const CHUB_SORTS = ['downloads', 'rating', 'newest', 'updated'] as const
export type ChubSort = (typeof CHUB_SORTS)[number]
export const CHUB_SORT_LABEL: Record<ChubSort, string> = { downloads: 'Most downloaded', rating: 'Top rated', newest: 'Newest', updated: 'Recently updated' }

/** One lorebook in Chub's search, trimmed to what the browser shows. */
export type ChubBook = {
  /** Chub's own path for it: "lorebooks/author/name". */
  path: string
  name: string
  author: string
  tagline: string
  /** Its description as plain text, cut short. */
  description: string
  tags: string[]
  /** How big it is, in tokens, by Chub's count. */
  tokens: number
  nsfw: boolean
  /** Instructions for the AI, a game system or an add-on rather than a world: it may fight Emberlight's own rules. */
  instructions: boolean
  /** Its page on Chub. */
  url: string
}

export type ChubResults = {
  books: ChubBook[]
  /** How many Chub found in all. */
  total: number
  page: number
  more: boolean
  /** Left out of this page as adult content, with NSFW off. */
  hidden: number
}

export type ChubSearch = { query: string; page: number; sort: ChubSort; nsfw: boolean; fantasy: boolean }
