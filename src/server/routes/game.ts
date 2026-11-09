import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import {
  AGE_IDS,
  ATTRS,
  BACKGROUND_IDS,
  DEFAULT_SETTINGS,
  RACE_IDS,
  SKILL_IDS,
  validateBuild,
  type Attr,
  type CampaignSettings,
  type CharacterBuild
} from '@shared/rules'
import type { TurnEvent } from '@shared/view'
import type { Campaigns } from '../core/campaigns'
import type { TurnEngine } from '../core/turn'
import type { CardLibrary } from '../cards/library'
import { applyRename, previewRename } from '../core/rename'
import { MAX_COMPANIONS, type CastMember } from '@shared/cards'
import { MAX_FACTS, type MemoryEvent } from '@shared/memory'
import { findWorld } from '@shared/worlds'
import { AGES, BACKGROUNDS, RACES, SEXES } from '@shared/rules'
import { attachment } from './cards'
import { campaignFileName, exportCampaign, importCampaign, MAX_CAMPAIGN_FILE, PortableError } from '../core/portable'
import { fileName, isPng, v2Data, writeCardPng } from '../cards/export'

const tuple = <T extends string>(xs: readonly T[]) => xs as unknown as [T, ...T[]]

const BuildSchema = z.object({
  name: z.string().max(60),
  race: z.enum(tuple(RACE_IDS)),
  sex: z.enum(['male', 'female']),
  age: z.enum(tuple(AGE_IDS)),
  background: z.enum(tuple(BACKGROUND_IDS)),
  humanBonus: z.array(z.enum(tuple(ATTRS))).max(2),
  attributes: z.record(z.enum(tuple(ATTRS)), z.number().int()),
  skills: z.partialRecord(z.enum(tuple(SKILL_IDS)), z.number().int()),
  // Long enough for an imported card's description.
  appearance: z.string().max(8000),
  personality: z.string().max(4000)
})

const SettingsSchema = z.object({
  sexModifiers: z.enum(['realistic', 'off']),
  mercy: z.enum(['brutal', 'harsh', 'forgiving']),
  rollMode: z.enum(['auto', 'dramatic', 'always']),
  failForward: z.boolean(),
  ironman: z.boolean(),
  tone: z.enum(['grim', 'grounded', 'heroic', 'whimsical', 'horror']),
  length: z.enum(['short', 'medium', 'long']),
  combat: z.enum(['narrative', 'turn', 'mixed']),
  survival: z.boolean(),
  events: z.enum(['calm', 'normal', 'eventful', 'chaos']),
  rolls: z.enum(['fewer', 'normal', 'more']),
  acting: z.enum(['never', 'light']),
  pacing: z.enum(['sandbox', 'guided']),
  perspective: z.enum(['second', 'third']),
  limits: z.string().max(1000),
  persona: z.string().max(80)
})

const short = (n: number) => z.string().max(n)
const JournalEditSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('entity_edit'),
    id: short(200),
    name: short(80).optional(),
    aliases: z.array(short(80)).max(8).optional(),
    summary: short(400).optional(),
    facts: z.array(short(300)).max(MAX_FACTS).optional(),
    status: z.enum(['alive', 'dead', 'missing', 'unknown']).optional(),
    attitude: z.enum(['hostile', 'unfriendly', 'neutral', 'friendly', 'devoted']).nullable().optional()
  }),
  z.object({ type: z.literal('entity_forget'), id: short(200) }),
  z.object({ type: z.literal('summary_edit'), level: z.enum(['scene', 'chapter']), to: short(80), title: short(120), text: short(4000) }),
  z.object({ type: z.literal('arc'), text: short(4000) }),
  z.object({ type: z.literal('note'), id: short(80), text: short(500) }),
  z.object({ type: z.literal('note_remove'), id: short(80) })
])

/** Campaign and turn endpoints (the interface's whole view of the game). */
export function registerGameRoutes(app: Hono, campaigns: Campaigns, turns: TurnEngine, library: CardLibrary) {
  const body = async <T>(c: { req: { json(): Promise<unknown> } }, schema: z.ZodType<T>) => {
    const parsed = schema.safeParse(await c.req.json().catch(() => null))
    return parsed.success ? parsed.data : null
  }

  /** Streams a turn's events to the interface as Server-Sent Events. */
  const stream = (c: Parameters<typeof streamSSE>[0], make: (signal: AbortSignal) => AsyncGenerator<TurnEvent>) =>
    streamSSE(c, async (s) => {
      const controller = new AbortController()
      s.onAbort(() => controller.abort())
      try {
        for await (const ev of make(controller.signal)) {
          await s.writeSSE({ data: JSON.stringify(ev) })
        }
      } catch (err) {
        await s.writeSSE({ data: JSON.stringify({ type: 'error', message: (err as Error).message } satisfies TurnEvent) })
      }
    })

  const guard = <T>(fn: () => T) => {
    try {
      return { ok: true as const, value: fn() }
    } catch (err) {
      return { ok: false as const, error: (err as Error).message }
    }
  }

  app.get('/api/campaigns', (c) => c.json(campaigns.list()))

  app.post('/api/campaigns', async (c) => {
    const b = await body(
      c,
      z.object({
        build: BuildSchema,
        settings: SettingsSchema.partial().optional(),
        name: z.string().max(80).optional(),
        /** The card the player plays as (portrait and lorebook). */
        playerCard: z.string().max(80).optional(),
        /** Cards the DM plays as companions. */
        companions: z.array(z.string().max(80)).max(MAX_COMPANIONS).optional(),
        /** Open with the first companion's greetings instead of a new scene. */
        useGreeting: z.boolean().optional(),
        lorebooks: z.array(z.string().max(80)).max(20).optional(),
        world: z.string().max(80).optional()
      })
    )
    if (!b) return c.json({ error: 'Invalid character.' }, 400)
    const settings: CampaignSettings = { ...DEFAULT_SETTINGS, ...(b.settings ?? {}) }
    const build = b.build as CharacterBuild
    const problems = validateBuild(build, settings.sexModifiers)
    if (problems.length) return c.json({ error: problems[0] }, 400)
    const made = guard(() => {
      const cast: CastMember[] = []
      if (b.playerCard) cast.push(library.castMember(b.playerCard, 'player', build.name))
      for (const cid of new Set(b.companions ?? [])) cast.push(library.castMember(cid, 'companion', build.name))
      const first = cast.find((m) => m.role === 'companion')
      const greetings = b.useGreeting && first ? library.greetings(first.cardId, build.name) : []
      const world = b.world ? findWorld(b.world) : undefined
      return campaigns.create(build, settings, b.name, { cast, greetings, world, lorebooks: (b.lorebooks ?? []).filter((x) => campaigns.db.getLorebook(x)) })
    })
    return made.ok ? c.json({ id: made.value }) : c.json({ error: made.error }, 400)
  })

  app.get('/api/campaigns/:id', (c) => {
    const r = guard(() => campaigns.view(c.req.param('id')))
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 404)
  })

  app.delete('/api/campaigns/:id', (c) => {
    campaigns.delete(c.req.param('id'))
    return c.json({ ok: true })
  })

  app.put('/api/campaigns/:id/settings', async (c) => {
    const s = await body(c, SettingsSchema.partial())
    if (!s) return c.json({ error: 'Invalid settings.' }, 400)
    const r = guard(() => {
      campaigns.updateSettings(c.req.param('id'), { ...campaigns.get(c.req.param('id')).settings, ...s })
      return campaigns.view(c.req.param('id'))
    })
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 404)
  })

  /** After a death: a new character takes up the tale (a stranger, or the dead one's child). */
  app.post('/api/campaigns/:id/successor', async (c) => {
    const b = await body(c, z.object({ build: BuildSchema, childId: z.string().max(80).optional() }))
    if (!b) return c.json({ error: 'Invalid character.' }, 400)
    const r = guard(() => {
      campaigns.successor(c.req.param('id'), b.build, b.childId)
      return campaigns.view(c.req.param('id'))
    })
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400)
  })

  app.put('/api/campaigns/:id/name', async (c) => {
    const s = await body(c, z.object({ name: z.string().min(1).max(80) }))
    if (!s) return c.json({ error: 'Invalid name.' }, 400)
    campaigns.rename(c.req.param('id'), s.name)
    return c.json(campaigns.view(c.req.param('id')))
  })

  // ---- adventures as files ---------------------------------------------------------------

  app.get('/api/campaigns/:id/export', (c) => {
    try {
      const { name, bytes } = exportCampaign(campaigns.db, c.req.param('id'))
      return c.body(bytes as unknown as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': 'application/zip', 'Content-Disposition': attachment(campaignFileName(name)) })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404)
    }
  })

  /** The file's bytes are the request body. */
  app.post('/api/campaigns/import', async (c) => {
    const size = Number(c.req.header('content-length') ?? 0)
    if (size > MAX_CAMPAIGN_FILE) return c.json({ error: 'This file is too large (over 200 MB).' }, 413)
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (!bytes.length) return c.json({ error: 'That file is empty.' }, 400)
    try {
      return c.json({ id: importCampaign(campaigns.db, bytes) })
    } catch (err) {
      return c.json({ error: err instanceof PortableError ? err.message : `This adventure couldn't be read (${(err as Error).message}).` }, 400)
    }
  })

  /** The character now playing, as a character card to share or to use elsewhere. */
  app.get('/api/campaigns/:id/character-card', (c) => {
    const r = guard(() => {
      const view = campaigns.view(c.req.param('id'))
      const b = view.state.character.build
      const sex = SEXES[view.settings.sexModifiers][b.sex].label.toLowerCase()
      const who = `${b.name} is a ${AGES[b.age].label.toLowerCase()} ${sex} ${RACES[b.race].label.toLowerCase()}, a ${BACKGROUNDS[b.background].label.toLowerCase()} by trade.`
      const data = v2Data({ name: b.name, description: [who, b.appearance.trim()].filter(Boolean).join('\n\n'), personality: b.personality, creator: 'Emberlight', tags: ['emberlight'] })
      // Their portrait, if it came from a card (and they're still the one it was for).
      const own = view.state.fallen.length ? undefined : view.cast.find((m) => m.role === 'player' && m.hasImage)
      const img = own ? library.image(own.cardId) : null
      if (img && isPng(img.bytes)) return { name: fileName(b.name, 'png'), bytes: writeCardPng(img.bytes, { v2: { spec: 'chara_card_v2', spec_version: '2.0', data } }) as Uint8Array, type: 'image/png' }
      return { name: fileName(b.name, 'json'), bytes: Buffer.from(JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data }, null, 2), 'utf8') as Uint8Array, type: 'application/json' }
    })
    if (!r.ok) return c.json({ error: r.error }, 404)
    return c.body(r.value.bytes as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': r.value.type, 'Content-Disposition': attachment(r.value.name), 'X-Content-Type-Options': 'nosniff' })
  })

  // ---- help with what to do ------------------------------------------------------------------

  app.post('/api/campaigns/:id/suggest', async (c) => {
    try {
      return c.json({ suggestions: await turns.suggest(c.req.param('id'), c.req.raw.signal) })
    } catch (err) {
      return c.json({ error: `No ideas this time (${(err as Error).message}).` }, 502)
    }
  })

  app.post('/api/campaigns/:id/ghost', async (c) => {
    const b = await body(c, z.object({ text: z.string().min(1).max(2000) }))
    if (!b) return c.json({ continuation: '' })
    try {
      return c.json({ continuation: await turns.ghost(c.req.param('id'), b.text, c.req.raw.signal) })
    } catch {
      // Ghost text is a nicety: a failure just means no suggestion.
      return c.json({ continuation: '' })
    }
  })

  // ---- turns (streamed) ------------------------------------------------------------------

  /** A move picked on the combat tracker (talking and anything else go through the Referee). */
  const target = z.string().max(20).optional()
  const CombatMoveSchema = z.union([
    z.object({ kind: z.literal('attack'), target }),
    z.object({ kind: z.literal('power'), target }),
    z.object({ kind: z.literal('cast'), target }),
    z.object({ kind: z.literal('defend') }),
    z.object({ kind: z.literal('flee') }),
    z.object({ kind: z.literal('use_item'), item: z.string().min(1).max(80) }),
    z.object({ kind: z.literal('surrender') })
  ])
  /** "Make" in the Bag: a recipe, by id. */
  const WorkSchema = z.object({ kind: z.literal('craft'), what: z.string().min(1).max(60) })

  app.post('/api/campaigns/:id/act', async (c) => {
    const b = await body(c, z.object({ text: z.string().min(1).max(4000), combat: CombatMoveSchema.optional(), work: WorkSchema.optional() }))
    const id = c.req.param('id')
    return stream(c, (signal) =>
      b ? turns.act(id, b.text, signal, { combat: b.combat, work: b.work }) : (async function* () { yield { type: 'error', message: 'Write something first.' } as TurnEvent })()
    )
  })

  app.post('/api/campaigns/:id/answer', async (c) => {
    const b = await body(c, z.object({ messageId: z.string() }))
    const id = c.req.param('id')
    return stream(c, (signal) =>
      b ? turns.answer(id, b.messageId, signal) : (async function* () { yield { type: 'error', message: 'Missing roll.' } as TurnEvent })()
    )
  })

  app.post('/api/campaigns/:id/narrate', (c) => stream(c, (signal) => turns.narrateHead(c.req.param('id'), signal)))
  app.post('/api/campaigns/:id/regenerate', (c) => stream(c, (signal) => turns.regenerate(c.req.param('id'), signal)))

  app.post('/api/campaigns/:id/reroll', async (c) => {
    const b = await body(c, z.object({ checkId: z.string() }))
    const id = c.req.param('id')
    return stream(c, (signal) =>
      b ? turns.reroll(id, b.checkId, signal) : (async function* () { yield { type: 'error', message: 'Missing roll.' } as TurnEvent })()
    )
  })

  /** The context inspector: what the DM was sent for its latest reply. */
  app.get('/api/campaigns/:id/prompt', (c) => {
    const r = turns.lastPrompt(c.req.param('id'))
    return r ? c.json(r) : c.json({ error: 'Nothing sent yet since Emberlight started. Play a turn (or press Rewrite) and look again.' }, 404)
  })

  // ---- story navigation ------------------------------------------------------------------

  app.post('/api/campaigns/:id/swipe', async (c) => {
    const b = await body(c, z.object({ messageId: z.string() }))
    if (!b) return c.json({ error: 'Missing message.' }, 400)
    const r = guard(() => {
      campaigns.selectSwipe(c.req.param('id'), b.messageId)
      return campaigns.view(c.req.param('id'))
    })
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400)
  })

  app.post('/api/campaigns/:id/rewind', async (c) => {
    const b = await body(c, z.object({ messageId: z.string() }))
    if (!b) return c.json({ error: 'Missing message.' }, 400)
    const r = guard(() => {
      campaigns.rewind(c.req.param('id'), b.messageId)
      return campaigns.view(c.req.param('id'))
    })
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400)
  })

  app.post('/api/campaigns/:id/spend', async (c) => {
    const b = await body(c, z.object({ attr: z.enum(tuple(ATTRS)) }))
    if (!b) return c.json({ error: 'Missing attribute.' }, 400)
    const r = guard(() => {
      turns.spend(c.req.param('id'), b.attr as Attr)
      return campaigns.view(c.req.param('id'))
    })
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400)
  })

  app.put('/api/campaigns/:id/lorebooks', async (c) => {
    const b = await body(c, z.object({ ids: z.array(z.string().max(80)).max(20) }))
    if (!b) return c.json({ error: 'Invalid lorebooks.' }, 400)
    const r = guard(() => {
      campaigns.setLorebooks(c.req.param('id'), b.ids)
      return campaigns.view(c.req.param('id'))
    })
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400)
  })

  // ---- renaming (retcon or in-story) --------------------------------------------------------

  const RenameBody = z.object({ from: z.string().min(1).max(80), to: z.string().min(1).max(80) })
  app.post('/api/campaigns/:id/rename/preview', async (c) => {
    const b = await body(c, RenameBody)
    if (!b) return c.json({ error: 'Type the new name first.' }, 400)
    const r = guard(() => previewRename(campaigns, c.req.param('id'), b.from, b.to))
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400)
  })
  app.post('/api/campaigns/:id/rename', async (c) => {
    const b = await body(
      c,
      RenameBody.extend({
        mode: z.enum(['retcon', 'story']),
        target: z.discriminatedUnion('kind', [z.object({ kind: z.literal('player') }), z.object({ kind: z.literal('entity'), id: z.string().max(200) })]),
        skip: z.array(z.string().max(80)).max(5000).optional()
      })
    )
    if (!b) return c.json({ error: 'That rename could not be read.' }, 400)
    const r = guard(() => {
      applyRename(campaigns, c.req.param('id'), b)
      return campaigns.view(c.req.param('id'))
    })
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400)
  })

  // ---- the pack (equip, take off, use, drop) ---------------------------------------------

  app.post('/api/campaigns/:id/inventory', async (c) => {
    const b = await body(
      c,
      z.object({
        action: z.enum(['equip', 'unequip', 'use', 'drop']),
        name: z.string().min(1).max(80),
        slot: z.enum(['main', 'off', 'head', 'body', 'hands', 'feet', 'back', 'neck', 'ring1', 'ring2']).optional()
      })
    )
    if (!b) return c.json({ error: 'That could not be read.' }, 400)
    const r = guard(() => {
      campaigns.inventoryAction(c.req.param('id'), b.action, b.name, b.slot)
      return campaigns.view(c.req.param('id'))
    })
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400)
  })

  // ---- journal (correcting the DM's memory) ------------------------------------------------

  app.post('/api/campaigns/:id/journal', async (c) => {
    const b = await body(c, z.object({ edit: JournalEditSchema }))
    if (!b) return c.json({ error: 'That change could not be read.' }, 400)
    const r = guard(() => {
      campaigns.journal(c.req.param('id'), b.edit as MemoryEvent)
      return campaigns.view(c.req.param('id'))
    })
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400)
  })

  // ---- save slots ------------------------------------------------------------------------

  app.post('/api/campaigns/:id/saves', async (c) => {
    const b = await body(c, z.object({ name: z.string().min(1).max(60) }))
    const id = c.req.param('id')
    const camp = campaigns.get(id)
    if (!b || !camp.head_id) return c.json({ error: 'Nothing to save yet.' }, 400)
    campaigns.db.addSave(id, b.name, camp.head_id)
    return c.json(campaigns.view(id))
  })

  app.post('/api/campaigns/:id/saves/:saveId/load', (c) => {
    const id = c.req.param('id')
    const save = campaigns.db.savesFor(id).find((s) => s.id === c.req.param('saveId'))
    if (!save) return c.json({ error: 'That save no longer exists.' }, 404)
    campaigns.rewind(id, save.message_id)
    return c.json(campaigns.view(id))
  })

  app.delete('/api/campaigns/:id/saves/:saveId', (c) => {
    campaigns.db.deleteSave(c.req.param('saveId'))
    return c.json(campaigns.view(c.req.param('id')))
  })
}
