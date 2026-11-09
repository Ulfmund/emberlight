import { RACE_IDS, type RaceId, type SexId } from './rules'
import { normalizeEntry, selectLore, type LoreEntry } from './lore'

/**
 * Character cards (docs/spec/03-characters-and-cards.md#card-compatibility).
 * Cards from SillyTavern, Chub and friends are normalized into `CardData` on import.
 */

/** A card's embedded lorebook entry: the same as any lorebook entry (see lore.ts). */
export type CardBookEntry = LoreEntry

export type CardData = {
  spec: 'v1' | 'v2' | 'v3'
  name: string
  /** V3: what the story calls them, if different from the card's title. */
  nickname: string
  description: string
  personality: string
  scenario: string
  firstMes: string
  alternateGreetings: string[]
  mesExample: string
  creatorNotes: string
  creator: string
  tags: string[]
  book: CardBookEntry[]
}

export type CardSummary = {
  id: string
  name: string
  tagline: string
  creator: string
  tags: string[]
  hasImage: boolean
  greetings: number
  bookEntries: number
  createdAt: number
}

export type CardDetail = CardSummary & { data: CardData }

/** A card's text copied into a campaign, so deleting it from the library never breaks a story. */
export type CastMember = {
  cardId: string
  role: 'player' | 'companion'
  name: string
  description: string
  personality: string
  scenario: string
  mesExample: string
  book: CardBookEntry[]
  hasImage: boolean
}

export const MAX_COMPANIONS = 3

export const cardImageUrl = (id: string) => `/api/cards/${encodeURIComponent(id)}/image`

/** The name the story should use for a card. */
export const storyName = (d: Pick<CardData, 'name' | 'nickname'>) => (d.nickname || d.name).trim()

/**
 * Fills in the {{char}} / {{user}} placeholders cards are written with.
 * `user` is the player character's name.
 */
export function fillMacros(text: string, char: string, user: string): string {
  return text
    .replace(/\{\{\s*char\s*\}\}|<BOT>/gi, char)
    .replace(/\{\{\s*user\s*\}\}|<USER>/gi, user)
    .replace(/\{\{\s*random\s*:\s*([^}]*)\}\}/gi, (_, list: string) => {
      const opts = list.split(/(?<!\\),/).map((s) => s.trim()).filter(Boolean)
      return opts.length ? opts[Math.floor(Math.random() * opts.length)] : ''
    })
    .replace(/\{\{\s*(trim|noop)\s*\}\}/gi, '')
    .replace(/\{\{\/\/[\s\S]*?\}\}/g, '')
}

/** A one-line description for library lists. */
export function tagline(d: CardData): string {
  const src = (d.creatorNotes.length < 300 && d.creatorNotes.trim()) || d.description || d.personality || d.scenario
  const flat = fillMacros(src, storyName(d), 'you')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_#>`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > 160 ? `${flat.slice(0, 157).replace(/\s+\S*$/, '')}…` : flat
}

/**
 * A best guess at race and sex from a card's text, for "Play as". The player can change
 * both in the creator; this only saves a few clicks.
 */
export function guessFromCard(d: Pick<CardData, 'description' | 'personality' | 'tags'>): { race?: RaceId; sex?: SexId } {
  const text = `${d.tags.join(' ')} ${d.description} ${d.personality}`.toLowerCase()
  const count = (re: RegExp) => (text.match(re) ?? []).length
  const she = count(/\b(she|her|hers|herself|woman|girl|female|lady|queen|princess|mother|daughter|sister|wife)\b/g)
  const he = count(/\b(he|him|his|himself|man|boy|male|lord|king|prince|father|son|brother|husband)\b/g)
  const sex: SexId | undefined = she > he * 1.5 && she >= 2 ? 'female' : he > she * 1.5 && he >= 2 ? 'male' : undefined
  const words: Record<RaceId, RegExp> = {
    human: /\bhuman\b/g,
    elf: /\b(elf|elven|elves|elvish|half-elf)\b/g,
    dwarf: /\b(dwarf|dwarven|dwarves|dwarfs)\b/g,
    halfling: /\b(halfling|hobbit|halflings)\b/g,
    orc: /\b(orc|orcish|orcs|half-orc)\b/g
  }
  let race: RaceId | undefined
  let best = 0
  for (const r of RACE_IDS) {
    const n = count(words[r])
    if (n > best) {
      best = n
      race = r
    }
  }
  return { race, sex }
}

// ---- Lorebook ---------------------------------------------------------------------------

/**
 * Picks a card book's entries that apply to `recent` (one block of text). Older saved entries
 * are filled in with defaults first. The full engine is `selectLore` in lore.ts.
 */
export function activeLore(entries: Partial<LoreEntry>[], recent: string, budgetChars = 3000): LoreEntry[] {
  return selectLore(entries.map(normalizeEntry), [recent], { budgetChars, defaultDepth: 1 })
}
