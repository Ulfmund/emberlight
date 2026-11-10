import type { Hono } from 'hono'
import { z } from 'zod'
import { LoreError } from '@shared/lore'
import { CHUB_SORTS, type ChubSort } from '@shared/chub'
import { MAX_LORE_FILE, type LoreLibrary } from '../lore/library'
import { addFromChub, searchChub } from '../lore/chub'

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

/**
 * The lorebook library: list, import, edit, export, and find more on Chub. `chub` is swapped
 * for a stand-in in tests, so they never reach the real site.
 */
export function registerLoreRoutes(app: Hono, lore: LoreLibrary, chub = { search: searchChub, add: addFromChub }) {
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

  // ---- Finding lorebooks on Chub (chub.ts). The phone can browse too: nothing secret is used.
  app.get('/api/chub/search', async (c) => {
    const q = c.req.query()
    const sort: ChubSort = (CHUB_SORTS as readonly string[]).includes(q.sort ?? '') ? (q.sort as ChubSort) : 'downloads'
    try {
      return c.json(await chub.search({ query: q.q ?? '', page: Number(q.page) || 1, sort, nsfw: q.nsfw === '1', fantasy: q.fantasy !== '0' }))
    } catch (err) {
      return c.json({ error: fail(err) }, 502)
    }
  })

  app.post('/api/chub/add', async (c) => {
    const b = z.object({ path: z.string().max(320) }).safeParse(await c.req.json().catch(() => null))
    if (!b.success) return c.json({ error: 'Which lorebook?' }, 400)
    try {
      return c.json(await chub.add(lore, b.data.path))
    } catch (err) {
      return c.json({ error: fail(err) }, err instanceof LoreError ? 400 : 502)
    }
  })
}
