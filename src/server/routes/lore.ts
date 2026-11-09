import type { Hono } from 'hono'
import { z } from 'zod'
import { LoreError } from '@shared/lore'
import { MAX_LORE_FILE, type LoreLibrary } from '../lore/library'

const EntrySchema = z.object({
  id: z.string().max(80),
  name: z.string().max(200),
  keys: z.array(z.string().max(200)).max(60),
  secondaryKeys: z.array(z.string().max(200)).max(60),
  logic: z.enum(['and_any', 'and_all', 'not_any', 'not_all']),
  content: z.string().max(20_000),
  constant: z.boolean(),
  enabled: z.boolean(),
  caseSensitive: z.boolean(),
  wholeWords: z.boolean(),
  priority: z.number().int().min(-10_000).max(10_000),
  probability: z.number().min(0).max(100),
  group: z.string().max(80),
  scanDepth: z.number().int().min(1).max(100).nullable(),
  preventRecursion: z.boolean(),
  excludeRecursion: z.boolean(),
  position: z.enum(['before_char', 'after_char', 'scene', 'depth']).default('scene'),
  depth: z.number().int().min(0).max(100).default(4),
  sticky: z.number().int().min(0).max(100).default(0),
  cooldown: z.number().int().min(0).max(100).default(0),
  delay: z.number().int().min(0).max(10_000).default(0),
  characters: z.array(z.string().max(120)).max(40).default([]),
  excludeCharacters: z.boolean().default(false)
})
const BookSchema = z.object({
  id: z.string().max(80),
  name: z.string().max(120),
  description: z.string().max(2000),
  entries: z.array(EntrySchema).max(2000),
  global: z.boolean().optional(),
  budget: z.number().int().min(0).max(200_000).optional()
})

/** The lorebook library: list, import, edit, export. */
export function registerLoreRoutes(app: Hono, lore: LoreLibrary) {
  const fail = (err: unknown) => (err instanceof LoreError ? err.message : `Something went wrong (${(err as Error).message}).`)

  app.get('/api/lorebooks', (c) => c.json(lore.list()))

  app.post('/api/lorebooks', async (c) => {
    const b = z.object({ name: z.string().max(120) }).safeParse(await c.req.json().catch(() => null))
    return c.json(lore.create(b.success ? b.data.name : ''))
  })

  /** The file's bytes are the body; its name comes in `X-Filename`. */
  app.post('/api/lorebooks/import', async (c) => {
    const size = Number(c.req.header('content-length') ?? 0)
    if (size > MAX_LORE_FILE) return c.json({ error: 'This file is too large (over 16 MB).' }, 413)
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    try {
      return c.json(lore.import(bytes, decodeURIComponent(c.req.header('x-filename') ?? '')))
    } catch (err) {
      return c.json({ error: fail(err) }, 400)
    }
  })

  app.get('/api/lorebooks/:id', (c) => {
    const b = lore.get(c.req.param('id'))
    return b ? c.json(b) : c.json({ error: 'That lorebook no longer exists.' }, 404)
  })

  app.put('/api/lorebooks/:id', async (c) => {
    const b = BookSchema.safeParse(await c.req.json().catch(() => null))
    if (!b.success || b.data.id !== c.req.param('id')) return c.json({ error: 'That lorebook could not be read.' }, 400)
    try {
      return c.json(lore.save(b.data))
    } catch (err) {
      return c.json({ error: fail(err) }, 400)
    }
  })

  app.get('/api/lorebooks/:id/export', (c) => {
    const out = lore.export(c.req.param('id'))
    if (!out) return c.json({ error: 'That lorebook no longer exists.' }, 404)
    const file = `${out.name.replace(/[^\w\- ]+/g, '').trim() || 'lorebook'}.json`
    return c.body(JSON.stringify(out.json, null, 2), 200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${file}"`
    })
  })

  app.delete('/api/lorebooks/:id', (c) => {
    lore.delete(c.req.param('id'))
    return c.json(lore.list())
  })
}
