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
  appearance: z.string().max(600),
  personality: z.string().max(600)
})

const SettingsSchema = z.object({
  sexModifiers: z.enum(['realistic', 'off']),
  mercy: z.enum(['brutal', 'harsh', 'forgiving']),
  rollMode: z.enum(['auto', 'dramatic', 'always']),
  failForward: z.boolean(),
  ironman: z.boolean(),
  tone: z.enum(['grim', 'grounded', 'heroic', 'whimsical', 'horror']),
  length: z.enum(['short', 'medium', 'long'])
})

/** Campaign and turn endpoints (the interface's whole view of the game). */
export function registerGameRoutes(app: Hono, campaigns: Campaigns, turns: TurnEngine) {
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
      z.object({ build: BuildSchema, settings: SettingsSchema.partial().optional(), name: z.string().max(80).optional() })
    )
    if (!b) return c.json({ error: 'Invalid character.' }, 400)
    const settings: CampaignSettings = { ...DEFAULT_SETTINGS, ...(b.settings ?? {}) }
    const build = b.build as CharacterBuild
    const problems = validateBuild(build, settings.sexModifiers)
    if (problems.length) return c.json({ error: problems[0] }, 400)
    const id = campaigns.create(build, settings, b.name)
    return c.json({ id })
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
    const s = await body(c, SettingsSchema)
    if (!s) return c.json({ error: 'Invalid settings.' }, 400)
    const r = guard(() => {
      campaigns.updateSettings(c.req.param('id'), s)
      return campaigns.view(c.req.param('id'))
    })
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 404)
  })

  app.put('/api/campaigns/:id/name', async (c) => {
    const s = await body(c, z.object({ name: z.string().min(1).max(80) }))
    if (!s) return c.json({ error: 'Invalid name.' }, 400)
    campaigns.rename(c.req.param('id'), s.name)
    return c.json(campaigns.view(c.req.param('id')))
  })

  // ---- turns (streamed) ------------------------------------------------------------------

  app.post('/api/campaigns/:id/act', async (c) => {
    const b = await body(c, z.object({ text: z.string().min(1).max(4000) }))
    const id = c.req.param('id')
    return stream(c, (signal) =>
      b ? turns.act(id, b.text, signal) : (async function* () { yield { type: 'error', message: 'Write something first.' } as TurnEvent })()
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
