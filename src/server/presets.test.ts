import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { startServer } from './index'
import { findPreset, presetForAddress } from '@shared/presets'

function call(port: number, path: string, opts: { method?: string; body?: unknown } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const data = opts.body === undefined ? undefined : JSON.stringify(opts.body)
    const req = request({ host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers: { host: `127.0.0.1:${port}`, ...(data ? { 'content-type': 'application/json' } : {}) } }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// Keys "encrypted" as plain base64, so the test can see where they went.
const cipher = { available: true, encrypt: async (s: string) => Buffer.from(s), decrypt: async (b: Buffer) => b.toString() }
const secretsOf = (dir: string) => JSON.parse(readFileSync(join(dir, 'secrets.json'), 'utf8')).keys as Record<string, string>

describe('the DeepSeek preset', () => {
  it("knows DeepSeek's address, under Custom or not", () => {
    expect(findPreset('deepseek')).toMatchObject({ baseUrl: 'https://api.deepseek.com', needsKey: true, kind: 'openai' })
    expect(presetForAddress('custom', 'https://api.deepseek.com')?.id).toBe('deepseek')
    expect(presetForAddress('custom', ' https://API.deepseek.com/v1/ ')?.id).toBe('deepseek')
    expect(presetForAddress('custom', 'https://openrouter.ai/api/v1')?.id).toBe('openrouter')
    expect(presetForAddress('custom', 'http://localhost:8080/v1')).toBeNull()
    expect(presetForAddress('custom', 'api.deepseek')).toBeNull()
    expect(presetForAddress('lmstudio', 'https://api.deepseek.com')).toBeNull()
  })

  it('moves a Custom connection to DeepSeek over to its button, key and all, on start and on save', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'emberlight-deepseek-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, connection: { presetId: 'custom', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', contextSize: 0 } }))
    writeFileSync(join(dir, 'secrets.json'), JSON.stringify({ version: 1, keys: { custom: Buffer.from('sk-test-deepseek').toString('base64') } }))
    const port = 41795
    const server = await startServer({ dataDir: dir, cipher, port })
    try {
      const s = JSON.parse((await call(port, '/api/settings')).body)
      expect(s.connection).toMatchObject({ presetId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })
      expect(s.savedKeys).toMatchObject({ deepseek: true, custom: false })
      expect(Buffer.from(secretsOf(dir).deepseek, 'base64').toString()).toBe('sk-test-deepseek')

      // Saved as Custom again (an older screen, say): it moves straight back; a key DeepSeek already has stays.
      await call(port, '/api/keys/custom', { method: 'PUT', body: { key: 'sk-other' } })
      const again = JSON.parse((await call(port, '/api/settings/connection', { method: 'PUT', body: { presetId: 'custom', kind: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', contextSize: 0 } })).body)
      expect(again.connection.presetId).toBe('deepseek')
      expect(Buffer.from(secretsOf(dir).deepseek, 'base64').toString()).toBe('sk-test-deepseek')

      // Any other Custom server is left alone.
      const local = JSON.parse((await call(port, '/api/settings/connection', { method: 'PUT', body: { presetId: 'custom', kind: 'openai', baseUrl: 'http://localhost:8080/v1', model: 'x', contextSize: 0 } })).body)
      expect(local.connection.presetId).toBe('custom')
      expect(local.savedKeys.custom).toBe(true)
    } finally {
      server.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
