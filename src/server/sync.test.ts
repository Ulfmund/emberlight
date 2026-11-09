import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { startServer } from './index'

/** A request to the app's server, the way a screen sends it (with the head of the story it shows). */
function call(port: number, path: string, opts: { method?: string; body?: unknown; head?: string } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body)
    const headers: Record<string, string> = { host: `127.0.0.1:${port}`, ...(data ? { 'content-type': 'application/json' } : {}), ...(opts.head !== undefined ? { 'x-emberlight-head': opts.head } : {}) }
    const req = request({ host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

const cipher = { available: true, encrypt: async (s: string) => Buffer.from(s), decrypt: async (b: Buffer) => b.toString() }
const build = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}

describe('one adventure, several screens', () => {
  it('gives each screen a stamp to catch up by, and turns away moves from a screen that is behind', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'emberlight-sync-'))
    const port = 41797
    const server = await startServer({ dataDir: dir, cipher, port })
    try {
      const { id } = JSON.parse((await call(port, '/api/campaigns', { method: 'POST', body: { build } })).body)
      const view = JSON.parse((await call(port, `/api/campaigns/${id}`)).body)
      expect(view).toMatchObject({ answering: false })
      expect(typeof view.stamp).toBe('string')
      const stamp = JSON.parse((await call(port, `/api/campaigns/${id}/stamp`)).body)
      expect(stamp).toEqual({ stamp: view.stamp, answering: false })

      // A screen that shows an older head can't rewind or act blind: it's sent the story as it stands.
      const behind = await call(port, `/api/campaigns/${id}/rewind`, { method: 'POST', body: { messageId: 'msg_whatever' }, head: 'msg_long_gone' })
      expect(behind.status).toBe(409)
      expect(JSON.parse(behind.body)).toMatchObject({ stale: true, error: expect.stringMatching(/moved on/) })
      const acted = await call(port, `/api/campaigns/${id}/act`, { method: 'POST', body: { text: 'I look around.' }, head: 'msg_long_gone' })
      expect(acted.body).toMatch(/moved on from another screen/)
      expect(acted.body).toContain('"type":"view"')
      // A screen that's up to date gets the usual answer (this message doesn't exist).
      const current = await call(port, `/api/campaigns/${id}/rewind`, { method: 'POST', body: { messageId: 'msg_whatever' }, head: view.headId ?? '' })
      expect(current.status).toBe(400)

      // Anything that changes the adventure changes its stamp.
      await call(port, `/api/campaigns/${id}/settings`, { method: 'PUT', body: { tone: 'grim' } })
      expect(JSON.parse((await call(port, `/api/campaigns/${id}/stamp`)).body).stamp).not.toBe(view.stamp)
    } finally {
      server.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
