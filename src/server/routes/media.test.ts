import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { startServer } from '../index'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9])
const build = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: { perception: 3, stealth: 3 }, appearance: 'Tall.', personality: 'Quiet.'
}

describe('pictures', () => {
  let dir: string
  let server: Awaited<ReturnType<typeof startServer>>
  let sd: Server
  let sdUrl = ''
  let B = ''
  let id = ''
  const j = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(B + path, init)
    return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> }
  }
  const post = (path: string, body: unknown) => j(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const upload = (bytes: Buffer, type: string) => j(`/api/campaigns/${id}/media?kind=portrait`, { method: 'POST', headers: { 'Content-Type': type }, body: new Uint8Array(bytes) })

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emberlight-media-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, connection: null }))
    server = await startServer({ dataDir: dir, cipher: { available: false, encrypt: async (s) => Buffer.from(s), decrypt: async (b) => b.toString() }, port: 41795 })
    B = `http://127.0.0.1:${server.port}`
    sd = createServer((req, res) => {
      req.resume()
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ images: [PNG.toString('base64')] }))
      })
    })
    await new Promise<void>((r) => sd.listen(0, '127.0.0.1', () => r()))
    sdUrl = `http://127.0.0.1:${(sd.address() as AddressInfo).port}`
    id = String((await post('/api/campaigns', { build })).body.id)
  })
  afterAll(() => {
    server.close()
    sd.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('asks someone along, changes their role and parts ways, over the app', async () => {
    const joined = await post(`/api/campaigns/${id}/party`, { join: { name: 'Mira', role: 'healer' } })
    expect(joined.status).toBe(200)
    const party = (joined.body.state as { party: { id: string; name: string; role: string }[] }).party
    expect(party.map((a) => [a.name, a.role])).toEqual([['Mira', 'healer']])
    expect((await post(`/api/campaigns/${id}/party`, { role: { id: party[0].id, role: 'wizard' } })).status).toBe(400)
    expect((await post(`/api/campaigns/${id}/party`, { role: { id: party[0].id, role: 'mage' } })).status).toBe(200)
    expect((await post(`/api/campaigns/${id}/party`, { join: { name: 'Mira' } })).body.error).toMatch(/already travelling/)
    const left = await post(`/api/campaigns/${id}/party`, { leave: party[0].id })
    expect((left.body.state as { party: unknown[] }).party).toEqual([])
  })

  it('takes pictures, but only real ones', async () => {
    const ok = await upload(PNG, 'image/png')
    expect(ok.status).toBe(200)
    const r = await fetch(`${B}/api/media/${ok.body.id}`)
    expect(r.headers.get('content-type')).toBe('image/png')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Buffer.from(await r.arrayBuffer())).toEqual(PNG)
    expect((await upload(Buffer.from('<svg onload=alert(1)>'), 'image/png')).body.error).toMatch(/isn't the picture it says/)
    expect((await upload(Buffer.from('<svg/>'), 'image/svg+xml')).status).toBe(400)
  })

  it('a picture becomes the character’s portrait; a picture from another story does not', async () => {
    const pic = String((await upload(PNG, 'image/png')).body.id)
    const r = await post(`/api/campaigns/${id}/portrait`, { media: pic })
    expect((r.body.view as { state: { character: { portrait?: string } } }).state.character.portrait).toBe(pic)
    const other = String((await post('/api/campaigns', { build })).body.id)
    expect((await post(`/api/campaigns/${other}/portrait`, { media: pic })).status).toBe(404)
    const gone = await post(`/api/campaigns/${id}/portrait`, { media: null })
    expect((gone.body.view as { state: { character: { portrait?: string } } }).state.character.portrait).toBeUndefined()
  })

  it('makes a portrait with the image generator', async () => {
    expect((await j(`/api/campaigns/${id}/images/prompt`)).body).toMatchObject({ ready: false })
    const saved = await j('/api/images/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backend: 'sdwebui', baseUrl: sdUrl, model: '', style: 'oil painting', negative: '', size: 512, steps: 20, workflow: '' }) })
    expect(saved.body).toMatchObject({ backend: 'sdwebui', hasKey: false })
    const prompt = (await j(`/api/campaigns/${id}/images/prompt`)).body
    expect(prompt).toMatchObject({ ready: true })
    // Race, sex and age in years, as people in the Journal are painted (an adult starts at 27).
    expect(prompt.prompt).toBe('oil painting, portrait of a 27-year-old human woman, hunter, Tall')
    const made = await post(`/api/campaigns/${id}/images/generate`, { prompt: prompt.prompt })
    expect(made.status).toBe(200)
    expect((made.body.view as { state: { character: { portrait?: string } } }).state.character.portrait).toBe(made.body.media)
  })
})
