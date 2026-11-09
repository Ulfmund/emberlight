import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { DEFAULT_SETTINGS, type CharacterBuild } from '@shared/rules'
import { DEFAULT_IMAGE_SETTINGS } from '@shared/images'
import type { MemoryEvent } from '@shared/memory'
import { GameDb, newId } from '../store/db'
import { Campaigns } from '../core/campaigns'
import { SettingsStore } from '../store/settings'
import type { SecretStore } from '../store/secrets'
import { makePainter } from './media'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7])
const build: CharacterBuild = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}

describe('unasked portraits', () => {
  let sd: Server
  let sdUrl = ''
  const prompts: string[] = []
  beforeAll(async () => {
    sd = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        prompts.push((JSON.parse(raw) as { prompt: string }).prompt)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ images: [PNG.toString('base64')] }))
      })
    })
    await new Promise<void>((r) => sd.listen(0, '127.0.0.1', () => r()))
    sdUrl = `http://127.0.0.1:${(sd.address() as AddressInfo).port}`
  })
  afterAll(() => sd.close())

  let dir: string
  let db: GameDb
  let campaigns: Campaigns
  let settings: SettingsStore
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'emberlight-paint-'))
    db = new GameDb(dir)
    campaigns = new Campaigns(db)
    settings = new SettingsStore(dir)
    settings.setImages({ ...DEFAULT_IMAGE_SETTINGS, backend: 'sdwebui', baseUrl: sdUrl, style: 'oil painting', autoPortraits: true })
    prompts.length = 0
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const secrets = { get: async () => undefined } as unknown as SecretStore
  const remember = (id: string, evs: MemoryEvent[]) => db.addEvents(id, campaigns.get(id).head_id!, newId('grp'), 'engine', evs)
  const seen = (name: string, times: number, extra: Partial<Extract<MemoryEvent, { type: 'entity' }>> = {}): MemoryEvent[] =>
    Array.from({ length: times }, () => ({ type: 'entity' as const, kind: 'person' as const, name, day: 1, ...extra }))
  const image = (id: string, name: string) => campaigns.view(id).memory.entities.find((e) => e.name === name)?.image

  it('paints someone once they matter, one at a time, and never twice', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    remember(id, [...seen('Old Tam', 4, { summary: 'the ferryman at Millbrook' }), ...seen('Wenna', 1, { relation: 'friend' }), ...seen('A stranger', 1)])
    const paint = makePainter(campaigns, settings, secrets)
    // The one seen most first; while that's being painted, nobody else is started.
    const first = paint(id)
    expect(first).toBeDefined()
    expect(paint(id)).toBeUndefined()
    await first
    expect(prompts[0]).toBe('oil painting, portrait of the ferryman at Millbrook')
    expect(image(id, 'Old Tam')).toBeTruthy()
    // Then someone tied to the character, even if seen only once.
    await paint(id)
    expect(image(id, 'Wenna')).toBeTruthy()
    // A passer-by never; and nobody twice.
    expect(paint(id)).toBeUndefined()
    expect(image(id, 'A stranger')).toBeUndefined()
    expect(prompts).toHaveLength(2)
  })

  it('does nothing unless asked to, or without an image generator', () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    remember(id, seen('Old Tam', 6))
    settings.setImages({ ...settings.images, autoPortraits: false })
    expect(makePainter(campaigns, settings, secrets)(id)).toBeUndefined()
    settings.setImages({ ...settings.images, autoPortraits: true, backend: 'none' })
    expect(makePainter(campaigns, settings, secrets)(id)).toBeUndefined()
  })
})
