import type { Hono } from 'hono'
import { z } from 'zod'
import { ImageSettingsSchema, emblemPrompt, portraitPrompt, scenePrompt, stillLifePrompt } from '@shared/images'
import { AGES, BACKGROUNDS, RACES, SEXES } from '@shared/rules'
import { projectMemory } from '@shared/memory'
import type { Campaigns } from '../core/campaigns'
import type { TurnEngine } from '../core/turn'
import type { SettingsStore } from '../store/settings'
import type { SecretStore } from '../store/secrets'
import { generateImage, ImageError } from '../images/generate'

/**
 * Pictures (docs/spec/03-characters-and-cards.md#image-generation, #image-input): uploads,
 * portraits for the player and the people of the story, and the image generator.
 */

export const MAX_IMAGE = 15 * 1024 * 1024
const MIMES: Record<string, (b: Uint8Array) => boolean> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  'image/webp': (b) => Buffer.from(b.subarray(8, 12)).toString('latin1') === 'WEBP',
  'image/gif': (b) => Buffer.from(b.subarray(0, 3)).toString('latin1') === 'GIF'
}

const fail = (err: unknown) => (err instanceof ImageError ? err.message : `Something went wrong (${(err as Error).message}).`)

export function registerMediaRoutes(app: Hono, campaigns: Campaigns, turns: TurnEngine, settings: SettingsStore, secrets: SecretStore) {
  app.get('/api/media/:id', (c) => {
    const m = campaigns.db.getMedia(c.req.param('id'))
    if (!m) return c.body(null, 404)
    return c.body(m.data as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': m.mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
  })

  /** A picture for a story: the body is the file; ?kind=portrait or story. */
  app.post('/api/campaigns/:id/media', async (c) => {
    const id = c.req.param('id')
    if (!campaigns.db.getCampaign(id)) return c.json({ error: 'That adventure no longer exists.' }, 404)
    const mime = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!MIMES[mime]) return c.json({ error: 'Pictures need to be PNG, JPEG, WebP or GIF.' }, 400)
    if (Number(c.req.header('content-length') ?? 0) > MAX_IMAGE) return c.json({ error: 'That picture is too large (over 15 MB).' }, 413)
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.length > MAX_IMAGE) return c.json({ error: 'That picture is too large (over 15 MB).' }, 413)
    if (!MIMES[mime](bytes)) return c.json({ error: "That file isn't the picture it says it is." }, 400)
    const kind = c.req.query('kind') === 'portrait' ? 'portrait' : 'story'
    return c.json({ id: campaigns.db.addMedia({ campaignId: id, kind, mime, data: bytes }) })
  })

  /** The character's portrait (an uploaded or made picture, or none); the DM can describe it. */
  app.post('/api/campaigns/:id/portrait', async (c) => {
    const id = c.req.param('id')
    const b = await c.req.json().catch(() => null)
    const p = z.object({ media: z.string().max(80).nullable(), describe: z.boolean().optional() }).safeParse(b)
    if (!p.success) return c.json({ error: 'Invalid picture.' }, 400)
    const m = p.data.media ? campaigns.db.getMedia(p.data.media) : null
    if (p.data.media && (!m || m.campaignId !== id)) return c.json({ error: 'That picture is no longer there.' }, 404)
    try {
      campaigns.setPortrait(id, p.data.media)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
    let description: string | undefined
    let note: string | undefined
    if (p.data.describe && p.data.media) {
      try {
        description = await turns.describeMedia(id, p.data.media, 'portrait', c.req.raw.signal)
      } catch (err) {
        note = `The DM couldn't look at the picture (${(err as Error).message}). Models that can see pictures: Claude, and local ones with vision.`
      }
    }
    return c.json({ view: campaigns.view(id), description, note })
  })

  /** New words for the character's appearance (e.g. from a portrait the DM described). */
  app.post('/api/campaigns/:id/appearance', async (c) => {
    const b = await c.req.json().catch(() => null)
    const p = z.object({ appearance: z.string().max(8000) }).safeParse(b)
    if (!p.success) return c.json({ error: 'Invalid description.' }, 400)
    try {
      campaigns.setAppearance(c.req.param('id'), p.data.appearance.trim())
      return c.json(campaigns.view(c.req.param('id')))
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  /** Someone in the Journal gets a picture (or loses it). */
  app.post('/api/campaigns/:id/entity-image', async (c) => {
    const id = c.req.param('id')
    const b = await c.req.json().catch(() => null)
    const p = z.object({ entity: z.string().max(80), media: z.string().max(80).nullable() }).safeParse(b)
    if (!p.success) return c.json({ error: 'Invalid picture.' }, 400)
    const m = p.data.media ? campaigns.db.getMedia(p.data.media) : null
    if (p.data.media && (!m || m.campaignId !== id)) return c.json({ error: 'That picture is no longer there.' }, 404)
    campaigns.journal(id, { type: 'entity_edit', id: p.data.entity, image: p.data.media })
    return c.json(campaigns.view(id))
  })

  // ---- the image generator -------------------------------------------------------------------

  app.get('/api/images/settings', async (c) => c.json({ ...settings.images, hasKey: await secrets.has('images') }))

  app.put('/api/images/settings', async (c) => {
    const b = await c.req.json().catch(() => null)
    const p = ImageSettingsSchema.safeParse(b)
    if (!p.success) return c.json({ error: 'Invalid image settings.' }, 400)
    settings.setImages(p.data)
    return c.json({ ...settings.images, hasKey: await secrets.has('images') })
  })

  /** A test picture, straight back (Connect screen; the computer only, by its path). */
  app.post('/api/images/settings/test', async (c) => {
    try {
      const pic = await generateImage(settings.images, await secrets.get('images'), portraitPrompt(settings.images.style, { kind: 'a weathered human ranger', details: ['grey cloak', 'short beard'] }), { signal: c.req.raw.signal })
      return c.body(pic.data as unknown as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': pic.mime, 'X-Content-Type-Options': 'nosniff' })
    } catch (err) {
      return c.json({ error: fail(err) }, 502)
    }
  })

  /** The prompt a portrait would use, for the player or someone in the Journal (to edit first). */
  app.get('/api/campaigns/:id/images/prompt', (c) => {
    try {
      return c.json({ prompt: portraitFor(campaigns, settings, c.req.param('id'), c.req.query('entity')), ready: settings.images.backend !== 'none' && Boolean(settings.images.baseUrl.trim()) })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404)
    }
  })

  /** Makes a portrait: it becomes the player's (or the Journal person's) picture. */
  app.post('/api/campaigns/:id/images/generate', async (c) => {
    const id = c.req.param('id')
    const b = await c.req.json().catch(() => null)
    const p = z.object({ prompt: z.string().min(3).max(1500), entity: z.string().max(80).optional() }).safeParse(b)
    if (!p.success) return c.json({ error: 'Write a prompt first.' }, 400)
    if (!campaigns.db.getCampaign(id)) return c.json({ error: 'That adventure no longer exists.' }, 404)
    try {
      const record = p.data.entity ? projectMemory(campaigns.activeEvents(campaigns.get(id), campaigns.path(campaigns.get(id))).map((x) => x.event)).entities.find((x) => x.id === p.data.entity) : undefined
      const pic = await generateImage(settings.images, await secrets.get('images'), p.data.prompt, { signal: c.req.raw.signal, wide: record?.kind === 'place' })
      const media = campaigns.db.addMedia({ campaignId: id, kind: 'generated', mime: pic.mime, data: pic.data })
      if (p.data.entity) campaigns.journal(id, { type: 'entity_edit', id: p.data.entity, image: media })
      else campaigns.setPortrait(id, media)
      return c.json({ media, view: campaigns.view(id) })
    } catch (err) {
      return c.json({ error: fail(err) }, 502)
    }
  })
}

/** What a portrait prompt says: the sheet for the player, the Journal for anyone else. */
function portraitFor(campaigns: Campaigns, settings: SettingsStore, id: string, entityId?: string): string {
  const style = settings.images.style
  const view = campaigns.view(id)
  if (entityId) {
    const e = projectMemory(campaigns.activeEvents(campaigns.get(id), campaigns.path(campaigns.get(id))).map((x) => x.event)).entities.find((x) => x.id === entityId)
    if (!e) throw new Error('That is no longer in the Journal.')
    const what = e.summary ? `${e.name}, ${e.summary.replace(/\.$/, '')}` : e.name
    if (e.kind === 'place') return scenePrompt(style, { what, details: e.facts.slice(-2) })
    if (e.kind === 'faction') return emblemPrompt(style, { what, details: e.facts.filter((f) => !/\([+−-]\d\)$/.test(f)).slice(-1) })
    if (e.kind === 'item') return stillLifePrompt(style, { what, details: e.facts.slice(-2) })
    return portraitPrompt(style, { kind: e.summary ? e.summary.replace(/\.$/, '') : e.name, details: e.facts.slice(-2) })
  }
  const b = view.state.character.build
  const sex = SEXES[view.settings.sexModifiers][b.sex].label.toLowerCase()
  const kind = `${/^[aeiou]/i.test(AGES[b.age].label) ? 'an' : 'a'} ${AGES[b.age].label.toLowerCase()} ${RACES[b.race].label.toLowerCase()} ${sex === 'male' ? 'man' : sex === 'female' ? 'woman' : sex}`
  return portraitPrompt(style, { kind, details: [BACKGROUNDS[b.background].label.toLowerCase(), b.appearance.slice(0, 500)] })
}
