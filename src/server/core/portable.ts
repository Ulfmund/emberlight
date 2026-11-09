import { z } from 'zod'
import { normalizeSettings, type CampaignSettings, type CharacterBuild, type GameEvent } from '@shared/rules'
import type { CardData, CastMember } from '@shared/cards'
import type { LoreEntry } from '@shared/lore'
import { newId, type EventRow, type GameDb, type MessageMeta } from '../store/db'
import { makeZip } from '../store/zip'
import { zipEntries, zipRead } from '../cards/parse'

/**
 * A whole adventure in one file (docs/spec/05-game-state-and-saves.md#storage-and-export): an
 * `.rpcampaign` zip with `campaign.json` (the story tree, its event log, save slots, and the
 * lorebooks and character cards it uses) and the cards' portraits under `media/`. Never any
 * API keys: those aren't part of a campaign.
 */

export const CAMPAIGN_FORMAT = 'emberlight-campaign'
export const CAMPAIGN_VERSION = 1
export const MAX_CAMPAIGN_FILE = 200 * 1024 * 1024

const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }

export class PortableError extends Error {}

const FileSchema = z.object({
  format: z.literal(CAMPAIGN_FORMAT),
  version: z.number().int(),
  exportedAt: z.number(),
  app: z.string().optional(),
  campaign: z.object({
    name: z.string().max(200),
    settings: z.record(z.string(), z.unknown()),
    build: z.record(z.string(), z.unknown()),
    cast: z.array(z.record(z.string(), z.unknown())),
    lorebooks: z.array(z.string()),
    headId: z.string().nullable(),
    createdAt: z.number()
  }),
  messages: z.array(
    z.object({
      id: z.string(),
      parent_id: z.string().nullable(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      thinking: z.string(),
      meta: z.record(z.string(), z.unknown()),
      created_at: z.number()
    })
  ),
  events: z.array(
    z.object({
      message_id: z.string(),
      group_id: z.string(),
      source: z.enum(['engine', 'ai', 'player']),
      event: z.object({ type: z.string() }).passthrough(),
      superseded: z.boolean(),
      created_at: z.number()
    })
  ),
  saves: z.array(z.object({ name: z.string().max(200), message_id: z.string(), created_at: z.number() })),
  lorebooks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      builtin: z.boolean(),
      description: z.string().optional(),
      entries: z.array(z.record(z.string(), z.unknown())).optional()
    })
  ),
  cards: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      hash: z.string(),
      data: z.record(z.string(), z.unknown()),
      raw: z.string(),
      image: z.string().optional(),
      imageMime: z.string().optional()
    })
  )
})
type CampaignFile = z.infer<typeof FileSchema>

const PERSONA_CARD = /^card:(.+)$/

export function exportCampaign(db: GameDb, id: string, app?: string): { name: string; bytes: Buffer } {
  const c = db.getCampaign(id)
  if (!c) throw new PortableError('That adventure no longer exists.')
  const files: { name: string; data: Uint8Array }[] = []
  // Cards in the cast, and a card that is the DM's persona.
  const cardIds = new Set(c.cast.map((m) => m.cardId))
  const persona = PERSONA_CARD.exec(c.settings.persona)?.[1]
  if (persona) cardIds.add(persona)
  const cards: CampaignFile['cards'] = []
  for (const cid of cardIds) {
    const row = db.getCard(cid)
    if (!row) continue
    const img = db.cardImage(cid)
    const ext = img ? IMAGE_EXT[img.mime] : undefined
    if (img && ext) files.push({ name: `media/${cid}.${ext}`, data: img.bytes })
    cards.push({ id: row.id, name: row.name, hash: row.hash, data: row.data as unknown as Record<string, unknown>, raw: row.raw, image: img && ext ? `media/${cid}.${ext}` : undefined, imageMime: img && ext ? img.mime : undefined })
  }
  const lorebooks: CampaignFile['lorebooks'] = c.lorebooks.flatMap((lid) => {
    const b = db.getLorebook(lid)
    if (!b) return []
    // Built-in worlds come with every copy of the app: a reference is enough.
    return [b.builtin ? { id: b.id, name: b.name, builtin: true } : { id: b.id, name: b.name, builtin: false, description: b.description, entries: b.entries as unknown as Record<string, unknown>[] }]
  })
  const file: CampaignFile = {
    format: CAMPAIGN_FORMAT,
    version: CAMPAIGN_VERSION,
    exportedAt: Date.now(),
    app,
    campaign: {
      name: c.name,
      settings: c.settings as unknown as Record<string, unknown>,
      build: c.build as unknown as Record<string, unknown>,
      cast: c.cast as unknown as Record<string, unknown>[],
      lorebooks: c.lorebooks,
      headId: c.head_id,
      createdAt: c.created_at
    },
    messages: db.messagesFor(id).map((m) => ({ id: m.id, parent_id: m.parent_id, role: m.role, content: m.content, thinking: m.thinking, meta: m.meta as Record<string, unknown>, created_at: m.created_at })),
    events: db.eventsFor(id).map((e) => ({ message_id: e.message_id, group_id: e.group_id, source: e.source, event: e.event as unknown as { type: string }, superseded: e.superseded, created_at: e.created_at })),
    saves: db.savesFor(id).map((s) => ({ name: s.name, message_id: s.message_id, created_at: s.created_at })),
    lorebooks,
    cards
  }
  files.unshift({ name: 'campaign.json', data: Buffer.from(JSON.stringify(file), 'utf8') })
  return { name: c.name, bytes: makeZip(files) }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Brings an adventure file in as a new adventure (everything gets new ids, so the same file can come in twice). */
export function importCampaign(db: GameDb, bytes: Uint8Array): string {
  if (bytes.length > MAX_CAMPAIGN_FILE) throw new PortableError('This file is too large (over 200 MB).')
  let entries: ReturnType<typeof zipEntries>
  try {
    entries = zipEntries(bytes)
  } catch {
    throw new PortableError("This isn't an Emberlight adventure file (.rpcampaign).")
  }
  const main = entries.find((e) => e.name === 'campaign.json')
  if (!main) throw new PortableError("This isn't an Emberlight adventure file (.rpcampaign).")
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(zipRead(bytes, main)))
  } catch {
    throw new PortableError('This adventure file is damaged.')
  }
  if (isObj(json) && typeof json.version === 'number' && json.version > CAMPAIGN_VERSION) throw new PortableError('This adventure was saved by a newer version of Emberlight. Update the app, then try again.')
  const parsed = FileSchema.safeParse(json)
  if (!parsed.success) throw new PortableError('This adventure file is damaged or incomplete.')
  const f = parsed.data
  if (f.campaign.headId && !f.messages.some((m) => m.id === f.campaign.headId)) throw new PortableError('This adventure file is damaged or incomplete.')

  const msgIds = new Map(f.messages.map((m) => [m.id, newId('msg')]))
  const groupIds = new Map<string, string>()
  const group = (g: string) => groupIds.get(g) ?? (groupIds.set(g, newId('grp')), groupIds.get(g)!)
  /** Message ids inside events and meta (summaries, answered rolls) follow the messages. */
  const remap = (v: unknown): unknown => {
    if (typeof v === 'string') return msgIds.get(v) ?? v
    if (Array.isArray(v)) return v.map(remap)
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]))
    return v
  }

  const id = newId('cmp')
  db.transaction(() => {
    // Cards: the same card already in the library is reused.
    const cardIds = new Map<string, string>()
    for (const card of f.cards) {
      const known = db.cardByHash(card.hash)
      if (known) {
        cardIds.set(card.id, known.id)
        continue
      }
      const entry = card.image ? entries.find((e) => e.name === card.image) : undefined
      const mime = card.imageMime && IMAGE_EXT[card.imageMime] ? card.imageMime : null
      const image = entry && mime ? zipRead(bytes, entry) : null
      const row = db.addCard({ id: newId('card'), name: card.name.slice(0, 200), hash: card.hash, data: card.data as unknown as CardData, raw: card.raw, image, image_mime: image ? mime : null })
      cardIds.set(card.id, row.id)
    }
    // Lorebooks: built-in worlds are already here; others come along unless this copy has them.
    for (const b of f.lorebooks) {
      if (b.builtin || db.getLorebook(b.id)) continue
      db.saveLorebook({ id: b.id, name: b.name.slice(0, 200), description: b.description ?? '', entries: (b.entries ?? []) as unknown as LoreEntry[] })
    }
    const lorebooks = f.campaign.lorebooks.filter((lid) => db.getLorebook(lid))

    const settings = normalizeSettings(f.campaign.settings as Partial<CampaignSettings>)
    const persona = PERSONA_CARD.exec(settings.persona)?.[1]
    if (persona) settings.persona = cardIds.has(persona) ? `card:${cardIds.get(persona)}` : 'chronicler'
    const cast = (f.campaign.cast as unknown as CastMember[]).filter((m) => cardIds.has(m.cardId)).map((m) => ({ ...m, cardId: cardIds.get(m.cardId)! }))
    const taken = new Set(db.listCampaigns().map((x) => x.name))
    const name = taken.has(f.campaign.name) ? `${f.campaign.name} (imported)`.slice(0, 80) : f.campaign.name.slice(0, 80)
    db.createCampaign({
      id,
      name,
      head_id: f.campaign.headId ? msgIds.get(f.campaign.headId)! : null,
      settings,
      build: f.campaign.build as unknown as CharacterBuild,
      cast,
      lorebooks
    })
    for (const m of f.messages) {
      db.addMessage({
        id: msgIds.get(m.id)!,
        campaign_id: id,
        parent_id: m.parent_id ? (msgIds.get(m.parent_id) ?? null) : null,
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        meta: remap(m.meta) as MessageMeta,
        created_at: m.created_at
      })
    }
    db.addEventRows(
      id,
      f.events
        .filter((e) => msgIds.has(e.message_id))
        .map((e) => ({ message_id: msgIds.get(e.message_id)!, group_id: group(e.group_id), source: e.source, event: remap(e.event) as GameEvent, superseded: e.superseded, created_at: e.created_at }))
    )
    for (const s of f.saves) if (msgIds.has(s.message_id)) db.addSave(id, s.name, msgIds.get(s.message_id)!)
  })
  return id
}

/** A file name for the adventure ("The tale of Brenna Rook.rpcampaign"). */
export const campaignFileName = (name: string) => `${name.replace(/[^\p{L}\p{N} _'-]+/gu, '').trim().slice(0, 80) || 'adventure'}.rpcampaign`

export type { EventRow }
