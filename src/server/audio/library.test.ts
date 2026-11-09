import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AudioLibrary, audioType, guessTags, MAX_AUDIO } from './library'
import { startServer } from '../index'

const bytes = (head: number[] | string, len = 64) => {
  const h = typeof head === 'string' ? [...Buffer.from(head, 'latin1')] : head
  const b = new Uint8Array(len)
  b.set(h)
  return b
}
const MP3 = bytes('ID3\x04\x00')
const OGG = bytes('OggS')
const WAV = (() => {
  const b = bytes('RIFF')
  b.set([...Buffer.from('WAVE')], 8)
  return b
})()

describe('the music and sounds library', () => {
  it('knows a sound file by its first bytes, never by its name', () => {
    expect(audioType(MP3)).toEqual({ ext: 'mp3', mime: 'audio/mpeg' })
    expect(audioType(bytes([0xff, 0xfb, 0x90]))?.ext).toBe('mp3')
    expect(audioType(OGG)?.mime).toBe('audio/ogg')
    expect(audioType(WAV)?.ext).toBe('wav')
    expect(audioType(bytes('fLaC'))?.ext).toBe('flac')
    expect(audioType(bytes('\x00\x00\x00\x20ftypM4A '))?.mime).toBe('audio/mp4')
    expect(audioType(bytes([0x1a, 0x45, 0xdf, 0xa3]))?.ext).toBe('webm')
    expect(audioType(bytes([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(audioType(bytes('<script>alert(1)</script>'))).toBeNull()
    expect(audioType(bytes('RIFF\x00\x00\x00\x00AVI '))).toBeNull()
  })

  it('guesses what a file is for from its name', () => {
    expect(guessTags('battle_theme.mp3')).toEqual({ kind: 'music', tags: ['combat'] })
    expect(guessTags('Boss Fight 2.ogg')).toEqual({ kind: 'music', tags: ['combat'] })
    expect(guessTags('battle2.mp3').tags).toEqual(['combat'])
    expect(guessTags('TavernTheme.mp3')).toEqual({ kind: 'music', tags: ['town'] })
    expect(guessTags('Tavern ambience.ogg')).toEqual({ kind: 'ambience', tags: ['tavern'] })
    expect(guessTags('rain_loop.wav')).toEqual({ kind: 'ambience', tags: ['rain'] })
    expect(guessTags('Campfire crackle.ogg')).toEqual({ kind: 'ambience', tags: ['fire'] })
    expect(guessTags('Ocean Waves 10 hours.mp3')).toEqual({ kind: 'ambience', tags: ['sea'] })
    expect(guessTags('Dark Forest Ambience.mp3')).toEqual({ kind: 'ambience', tags: ['birds'] })
    expect(guessTags('Requiem.flac')).toEqual({ kind: 'music', tags: ['sorrow'] })
    expect(guessTags('moonlit_road.mp3')).toEqual({ kind: 'music', tags: ['night', 'explore'] })
    // Whole words only: no sea in a season, no rain in a brain, no war in a warm hearth.
    expect(guessTags('Season of Mist.mp3')).toEqual({ kind: 'music', tags: ['explore'] })
    expect(guessTags('brainwave.mp3').tags).toEqual(['explore'])
    expect(guessTags('warm hearth.ogg')).toEqual({ kind: 'ambience', tags: ['fire'] })
    // Nothing to go on: music for the road, or ambience the player tags themself.
    expect(guessTags('Track 07.mp3')).toEqual({ kind: 'music', tags: ['explore'] })
    expect(guessTags('ambience_01.ogg')).toEqual({ kind: 'ambience', tags: [] })
  })

  describe('on disk', () => {
    let dir: string
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'emberlight-audio-'))
    })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    it('adds, tags, plays back and removes tracks, and remembers them', () => {
      const lib = new AudioLibrary(dir)
      expect(lib.list()).toEqual([])
      const t = lib.import(MP3, 'rain_loop.mp3')
      expect(t).toMatchObject({ name: 'rain loop', kind: 'ambience', tags: ['rain'], mime: 'audio/mpeg', size: MP3.length })
      expect(t).not.toHaveProperty('ext')
      expect(lib.read(t.id)).toEqual({ data: Buffer.from(MP3), mime: 'audio/mpeg' })

      const u = lib.update(t.id, { name: '  Soft rain  ', tags: ['rain', 'storm', 'rain', 'nonsense' as 'rain'], volume: 3 })
      expect(u).toMatchObject({ name: 'Soft rain', tags: ['rain', 'storm'], volume: 1 })
      expect(lib.update(t.id, { name: '   ' }).name).toBe('Soft rain')
      expect(() => lib.update('aud_gone', { volume: 0.5 })).toThrow(/no longer in your library/)

      // A new start reads the same library back.
      const again = new AudioLibrary(dir)
      expect(again.list()).toEqual(lib.list())
      again.delete(t.id)
      expect(again.list()).toEqual([])
      expect(again.read(t.id)).toBeNull()
      expect(readdirSync(join(dir, 'audio'))).toEqual(['manifest.json'])
      again.delete(t.id) // twice is fine
    })

    it("refuses files that aren't sound, and ones too large", () => {
      const lib = new AudioLibrary(dir)
      expect(() => lib.import(bytes([0x89, 0x50, 0x4e, 0x47]), 'song.mp3')).toThrow(/isn't a sound file/)
      expect(() => lib.import(new Uint8Array(MAX_AUDIO + 1), 'huge.mp3')).toThrow(/too large/)
      expect(lib.list()).toEqual([])
    })

    it('forgets tracks whose file has gone, and survives a broken manifest', () => {
      const lib = new AudioLibrary(dir)
      const keep = lib.import(OGG, 'birds.ogg')
      const lost = lib.import(WAV, 'owls.wav')
      rmSync(join(dir, 'audio', `${lost.id}.wav`))
      expect(new AudioLibrary(dir).list().map((t) => t.id)).toEqual([keep.id])
      writeFileSync(join(dir, 'audio', 'manifest.json'), '{ not json')
      expect(new AudioLibrary(dir).list()).toEqual([])
      expect(existsSync(join(dir, 'audio', `${keep.id}.ogg`))).toBe(true)
    })
  })

  describe('over the app', () => {
    let dir: string
    let server: Awaited<ReturnType<typeof startServer>>
    let B = ''
    const j = async (path: string, init: RequestInit = {}) => {
      const r = await fetch(B + path, init)
      return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> }
    }
    const upload = (b: Uint8Array<ArrayBuffer>, name: string) => j('/api/audio/import', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': name }, body: b })

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), 'emberlight-audio-app-'))
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, connection: null }))
      server = await startServer({ dataDir: dir, cipher: { available: false, encrypt: async (s) => Buffer.from(s), decrypt: async (b) => b.toString() }, port: 41796 })
      B = `http://127.0.0.1:${server.port}`
    })
    afterAll(() => {
      server.close()
      rmSync(dir, { recursive: true, force: true })
    })

    it('adds a file, lists it, plays it back, retags it and removes it', async () => {
      const added = await upload(OGG, encodeURIComponent('Battle – the bridge.ogg'))
      expect(added.status).toBe(200)
      expect(added.body).toMatchObject({ name: 'Battle – the bridge', kind: 'music', tags: ['combat'] })
      const id = String(added.body.id)
      expect(((await j('/api/audio')).body as unknown as { id: string }[]).map((t) => t.id)).toEqual([id])

      const file = await fetch(`${B}/api/audio/${id}/file`)
      expect(file.headers.get('content-type')).toBe('audio/ogg')
      expect(file.headers.get('x-content-type-options')).toBe('nosniff')
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(OGG)

      const put = (body: unknown) => j(`/api/audio/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      expect((await put({ tags: ['combat', 'tension'], volume: 0.4 })).body).toMatchObject({ tags: ['combat', 'tension'], volume: 0.4 })
      expect((await put({ tags: ['not-a-mood'] })).status).toBe(400)
      expect((await put({ volume: 2 })).status).toBe(400)
      expect((await j('/api/audio/aud_nope', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(404)

      expect((await j(`/api/audio/${id}`, { method: 'DELETE' })).status).toBe(200)
      expect((await j('/api/audio')).body).toEqual([])
      expect((await fetch(`${B}/api/audio/${id}/file`)).status).toBe(404)
    })

    it("turns away what isn't sound, and takes an oddly written name as it is", async () => {
      expect((await upload(bytes('<svg onload=alert(1)>'), 'song.mp3')).body.error).toMatch(/isn't a sound file/)
      expect((await upload(new Uint8Array(0), 'empty.mp3')).status).toBe(400)
      const odd = await upload(MP3, 'rain%E0%A4%A.mp3')
      expect(odd.status).toBe(200)
      expect(odd.body.kind).toBe('ambience')
    })
  })
})
