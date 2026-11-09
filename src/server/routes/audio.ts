import type { Hono } from 'hono'
import { z } from 'zod'
import { TRACK_TAGS } from '@shared/scene'
import { AudioError, MAX_AUDIO, type AudioLibrary } from '../audio/library'

/** The player's own music and sounds: list, add, tag, play, remove. */
export function registerAudioRoutes(app: Hono, library: AudioLibrary) {
  const fail = (err: unknown) => (err instanceof AudioError ? err.message : `Something went wrong (${(err as Error).message}).`)

  app.get('/api/audio', (c) => c.json(library.list()))

  /** The file's bytes are the body; its name comes in `X-Filename`. */
  app.post('/api/audio/import', async (c) => {
    if (Number(c.req.header('content-length') ?? 0) > MAX_AUDIO) return c.json({ error: 'That file is too large (over 40 MB).' }, 413)
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (!bytes.length) return c.json({ error: 'That file is empty.' }, 400)
    const raw = c.req.header('x-filename') ?? ''
    let filename = raw
    try {
      filename = decodeURIComponent(raw)
    } catch {
      /* not encoded; use it as it came */
    }
    try {
      return c.json(library.import(bytes, filename))
    } catch (err) {
      return c.json({ error: fail(err) }, 400)
    }
  })

  app.put('/api/audio/:id', async (c) => {
    const p = z
      .object({
        name: z.string().max(80).optional(),
        kind: z.enum(['music', 'ambience']).optional(),
        tags: z.array(z.enum(TRACK_TAGS)).max(20).optional(),
        volume: z.number().min(0).max(1).optional()
      })
      .safeParse(await c.req.json().catch(() => null))
    if (!p.success) return c.json({ error: 'That change could not be read.' }, 400)
    try {
      return c.json(library.update(c.req.param('id'), p.data))
    } catch (err) {
      return c.json({ error: fail(err) }, 404)
    }
  })

  app.delete('/api/audio/:id', (c) => {
    library.delete(c.req.param('id'))
    return c.json({ ok: true })
  })

  app.get('/api/audio/:id/file', (c) => {
    const f = library.read(c.req.param('id'))
    if (!f) return c.body(null, 404)
    return c.body(f.data as unknown as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' })
  })
}
