import type { Hono } from 'hono'
import { CardError } from '../cards/parse'
import { MAX_CARD_FILE, type CardLibrary } from '../cards/library'

/** A download, with the file's real name (and an ASCII fallback for old browsers). */
export const attachment = (name: string) => `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`

/** The character library: import, list, look at, delete. */
export function registerCardRoutes(app: Hono, library: CardLibrary) {
  app.get('/api/cards', (c) => c.json(library.list()))

  /** The file's bytes are the request body; its name comes in the `X-Filename` header. */
  app.post('/api/cards/import', async (c) => {
    const size = Number(c.req.header('content-length') ?? 0)
    if (size > MAX_CARD_FILE) return c.json({ error: 'This file is too large (over 40 MB).' }, 413)
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (!bytes.length) return c.json({ error: 'That file is empty.' }, 400)
    const filename = decodeURIComponent(c.req.header('x-filename') ?? '')
    try {
      return c.json(library.import(bytes, filename))
    } catch (err) {
      const message = err instanceof CardError ? err.message : `This card couldn't be read (${(err as Error).message}).`
      return c.json({ error: message }, 400)
    }
  })

  app.get('/api/cards/:id', (c) => {
    const card = library.detail(c.req.param('id'))
    return card ? c.json(card) : c.json({ error: 'That character is no longer in your library.' }, 404)
  })

  app.get('/api/cards/:id/image', (c) => {
    const img = library.image(c.req.param('id'))
    if (!img) return c.body(null, 404)
    return c.body(img.bytes as Uint8Array<ArrayBuffer>, 200, {
      'Content-Type': img.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    })
  })

  /** The card as a file to share (a PNG card, or JSON). */
  app.get('/api/cards/:id/export', (c) => {
    const f = library.exportFile(c.req.param('id'))
    if (!f) return c.json({ error: 'That character is no longer in your library.' }, 404)
    return c.body(f.bytes as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': f.type, 'Content-Disposition': attachment(f.name), 'X-Content-Type-Options': 'nosniff' })
  })

  app.delete('/api/cards/:id', (c) => {
    library.delete(c.req.param('id'))
    return c.json(library.list())
  })
}
