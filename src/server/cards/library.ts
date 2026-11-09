import { createHash } from 'node:crypto'
import { fillMacros, storyName, tagline, type CardDetail, type CardSummary, type CastMember } from '@shared/cards'
import { newId, type CardRow, type GameDb } from '../store/db'
import { CardError, parseCardFile } from './parse'
import { cardJson, fileName, isPng, writeCardPng } from './export'

export const MAX_CARD_FILE = 40 * 1024 * 1024

/** The character library: cards imported once and reused across campaigns. */
export class CardLibrary {
  constructor(private db: GameDb) {}

  import(bytes: Uint8Array, filename: string): { card: CardSummary; existing: boolean } {
    if (bytes.length > MAX_CARD_FILE) throw new CardError('This file is too large (over 40 MB).')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const known = this.db.cardByHash(hash)
    if (known) return { card: summary(known, this.db.cardImage(known.id) !== null), existing: true }
    const parsed = parseCardFile(bytes, filename)
    const row = this.db.addCard({
      id: newId('card'),
      name: parsed.data.name,
      hash,
      data: parsed.data,
      raw: JSON.stringify(parsed.raw),
      image: parsed.image?.bytes ?? null,
      image_mime: parsed.image?.mime ?? null
    })
    return { card: summary(row, Boolean(parsed.image)), existing: false }
  }

  list(): CardSummary[] {
    return this.db.listCards().map((r) => summary(r, r.image_mime !== null))
  }

  detail(id: string): CardDetail | null {
    const r = this.db.getCard(id)
    return r ? { ...summary(r, r.image_mime !== null), data: r.data } : null
  }

  image(id: string) {
    return this.db.cardImage(id)
  }

  /** The card as a file to share: a PNG card if it has a PNG portrait, otherwise JSON. */
  exportFile(id: string): { name: string; bytes: Uint8Array; type: string } | null {
    const r = this.db.getCard(id)
    if (!r) return null
    let raw: unknown
    try {
      raw = JSON.parse(r.raw)
    } catch {
      raw = null
    }
    const json = cardJson(raw, r.data)
    const img = this.db.cardImage(id)
    if (img && isPng(img.bytes)) return { name: fileName(r.name, 'png'), bytes: writeCardPng(img.bytes, json), type: 'image/png' }
    return { name: fileName(r.name, 'json'), bytes: Buffer.from(JSON.stringify(json.v3 ?? json.v2, null, 2), 'utf8'), type: 'application/json' }
  }

  delete(id: string) {
    this.db.deleteCard(id)
  }

  /**
   * Copies a card into a campaign. Placeholders are filled with the player's name now, so
   * the story never depends on the library copy again.
   */
  castMember(id: string, role: CastMember['role'], playerName: string): CastMember {
    const r = this.db.getCard(id)
    if (!r) throw new CardError('That character is no longer in your library.')
    const d = r.data
    const char = role === 'player' ? playerName : storyName(d)
    const fill = (s: string) => fillMacros(s, char, role === 'player' ? 'someone' : playerName).trim()
    return {
      cardId: r.id,
      role,
      name: char,
      description: fill(d.description),
      personality: fill(d.personality),
      scenario: fill(d.scenario),
      mesExample: fill(d.mesExample),
      book: d.book.map((e) => ({ ...e, content: fill(e.content) })),
      hasImage: r.image_mime !== null
    }
  }

  /** A companion's greetings (first message and alternates), ready to open a story with. */
  greetings(id: string, playerName: string): string[] {
    const r = this.db.getCard(id)
    if (!r) return []
    const char = storyName(r.data)
    return [r.data.firstMes, ...r.data.alternateGreetings].map((g) => fillMacros(g, char, playerName).trim()).filter(Boolean)
  }
}

function summary(r: CardRow, hasImage: boolean): CardSummary {
  return {
    id: r.id,
    name: storyName(r.data),
    tagline: tagline(r.data),
    creator: r.data.creator,
    tags: r.data.tags,
    hasImage,
    greetings: [r.data.firstMes, ...r.data.alternateGreetings].filter((g) => g.trim()).length,
    bookEntries: r.data.book.length,
    createdAt: r.created_at
  }
}
