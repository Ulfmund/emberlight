import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { startServer } from './index'
import { SettingsStore } from './store/settings'

/** Plain HTTP with full control over headers (fetch won't let tests set Host). */
function call(port: number, path: string, opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body)
    const req = request(
      { host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: { host: `127.0.0.1:${port}`, ...(data ? { 'content-type': 'application/json' } : {}), ...opts.headers } },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

describe('the phone key', () => {
  it('is made once and kept across restarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'emberlight-key-'))
    const first = new SettingsStore(dir).remote.key
    expect(new SettingsStore(dir).remote.key).toBe(first)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('playing from other devices', () => {
  let dir: string
  let server: Awaited<ReturnType<typeof startServer>>
  let link: number
  let key: string
  let cookie: string
  const MAIN = 41790

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'emberlight-remote-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, connection: { presetId: 'claude', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5', contextSize: 0 } }))
    server = await startServer({
      dataDir: dir,
      cipher: { available: false, encrypt: async (s) => Buffer.from(s), decrypt: async (b) => b.toString() },
      port: MAIN
    })
    // Switch the link on from this computer, and read the key it hands out.
    const r = JSON.parse((await call(MAIN, '/api/remote', { method: 'PUT', body: { link: true } })).body)
    link = r.link.port
    key = new URLSearchParams(r.link.path.slice(1)).get('key')!
    expect(r.link.running).toBe(true)
    expect(key.length).toBeGreaterThanOrEqual(24)
  })
  afterAll(() => {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('treats this computer as local', async () => {
    const r = await call(MAIN, '/api/settings')
    expect(r.status).toBe(200)
    expect(JSON.parse(r.body).remote).toBe(false)
  })

  it('turns away devices without the key', async () => {
    expect((await call(link, '/api/settings')).status).toBe(401)
    expect((await call(link, '/api/campaigns')).status).toBe(401)
    const page = await call(link, '/?key=not-the-key')
    expect(page.status).toBe(401)
    expect(page.body).toContain("isn't connected yet")
  })

  it('pairs with the key and then works by cookie', async () => {
    const r = await call(link, `/?key=${encodeURIComponent(key)}`)
    expect(r.status).toBe(302)
    expect(r.headers.location).toBe('/')
    const set = String(r.headers['set-cookie'])
    expect(set).toContain('HttpOnly')
    expect(set).toContain('SameSite=Lax')
    cookie = set.split(';')[0]
    const s = await call(link, '/api/settings', { headers: { cookie } })
    expect(s.status).toBe(200)
    expect(JSON.parse(s.body).remote).toBe(true)
  })

  it("never lets a remote device touch keys, updates or the phone settings", async () => {
    const h = { cookie }
    expect((await call(link, '/api/keys/claude', { method: 'PUT', headers: h, body: { key: 'sk-evil' } })).status).toBe(403)
    expect((await call(link, '/api/keys/claude', { method: 'DELETE', headers: h })).status).toBe(403)
    expect((await call(link, '/api/update/install', { method: 'POST', headers: h })).status).toBe(403)
    expect((await call(link, '/api/remote', { headers: h })).status).toBe(403)
    expect((await call(link, '/api/remote/new-key', { method: 'POST', headers: h })).status).toBe(403)
  })

  it("can change the model, but can't send the saved key to a new address", async () => {
    const h = { cookie }
    const evil = { presetId: 'claude', kind: 'anthropic', baseUrl: 'https://evil.example', model: 'x', contextSize: 0 }
    expect((await call(link, '/api/settings/connection', { method: 'PUT', headers: h, body: evil })).status).toBe(403)
    expect((await call(link, '/api/connection/test', { method: 'POST', headers: h, body: { connection: evil } })).status).toBe(403)
    const ok = { ...evil, baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5' }
    expect((await call(link, '/api/settings/connection', { method: 'PUT', headers: h, body: ok })).status).toBe(200)
  })

  it('refuses other websites, even with the cookie', async () => {
    const r = await call(link, '/api/campaigns', { headers: { cookie, origin: 'https://evil.example' } })
    expect(r.status).toBe(403)
    const same = await call(link, '/api/campaigns', { headers: { cookie, origin: `http://127.0.0.1:${link}` } })
    expect(same.status).toBe(200)
  })

  it('treats proxied requests on the main port as remote', async () => {
    // A tunnel pointed at the main port by mistake still needs the key.
    expect((await call(MAIN, '/api/settings', { headers: { 'cf-ray': 'abc' } })).status).toBe(401)
    expect((await call(MAIN, '/api/settings', { headers: { 'x-forwarded-for': '1.2.3.4', cookie } })).status).toBe(200)
  })

  it('unpairs everyone with a new key, and closes when switched off', async () => {
    await call(MAIN, '/api/remote/new-key', { method: 'POST' })
    expect((await call(link, '/api/settings', { headers: { cookie } })).status).toBe(401)
    const off = JSON.parse((await call(MAIN, '/api/remote', { method: 'PUT', body: { link: false } })).body)
    expect(off.link.running).toBe(false)
    await expect(call(link, '/api/settings')).rejects.toThrow()
  })
})
