import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cosine, DEFAULT_EMBEDDING_SETTINGS, standouts, type EmbeddingSettings } from '@shared/embeddings'
import { projectMemory, relevantEntities, storySoFar, type MemoryEvent } from '@shared/memory'
import { normalizeEntry } from '@shared/lore'
import type { Connection } from '@shared/types'
import { GameDb } from '../store/db'
import { Embedder } from './embeddings'
import { recallByMeaning } from './recall'

/** A pretend embedding model: a text's vector counts its words about each of a few topics. */
const TOPICS = [/wol(f|ves)|howl|fang|pack/gi, /\binn\b|tavern|ale|hearth/gi, /river|ford|ferry|water/gi, /tower|library|scroll/gi]
export const vecFor = (t: string) => TOPICS.map((re) => (t.match(re)?.length ?? 0) + 0.01)

function fakeServer() {
  const calls: { url: string; auth?: string; input: string[] }[] = []
  const fetcher = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { model: string; input: string[] }
    calls.push({ url, auth: (init.headers as Record<string, string>).Authorization, input: body.input })
    if (body.model === 'missing') return new Response('model not found', { status: 404 })
    if (body.model === 'short') return Response.json({ data: [] })
    return Response.json({ data: body.input.map((t, index) => ({ index, embedding: vecFor(t) })).reverse() })
  }) as unknown as typeof fetch
  return { calls, fetcher }
}

const LM: Connection = { presetId: 'lmstudio', kind: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'qwen', contextSize: 0 }

describe('memory by meaning', () => {
  let dir: string
  let db: GameDb
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'emberlight-emb-'))
    db = new GameDb(dir)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const embedder = (s: Partial<EmbeddingSettings>, connection: Connection | null = LM, server = fakeServer()) =>
    ({ server, e: new Embedder(db, () => ({ embeddings: { ...DEFAULT_EMBEDDING_SETTINGS, ...s }, connection }), async (id) => (id === 'embeddings' ? 'sk-emb' : id === 'lmstudio' ? undefined : undefined), server.fetcher) })

  it('measures likeness, and picks only the clear standouts', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([0, 0], [1, 1])).toBe(0)
    const scored = [0.91, 0.2, 0.22, 0.18, 0.25, 0.3, 0.19].map((sim, i) => ({ item: i, sim }))
    expect(standouts(scored, 3)).toEqual([0])
    // A model that calls everything fairly alike: still only the clear standout.
    const squashed = [0.594, 0.49, 0.487, 0.484, 0.482, 0.47, 0.46, 0.45, 0.44, 0.43].map((sim, i) => ({ item: i, sim }))
    expect(standouts(squashed, 3)).toEqual([0])
    // Too few to compare: nothing stands out.
    expect(standouts([{ item: 'a', sim: 0.45 }, { item: 'b', sim: 0.92 }], 3)).toEqual([])
    expect(standouts([], 3)).toEqual([])
  })

  it("asks the story model's own server, or the one set for it; never Claude", () => {
    expect(embedder({ enabled: false, model: 'nomic' }).e.endpoint()).toBeNull()
    expect(embedder({ enabled: true, model: '' }).e.endpoint()).toBeNull()
    expect(embedder({ enabled: true, model: 'nomic' }).e.endpoint()).toEqual({ url: 'http://localhost:1234/v1/embeddings', model: 'nomic', own: false })
    expect(embedder({ enabled: true, model: 'nomic' }, { ...LM, presetId: 'ollama', kind: 'ollama', baseUrl: 'http://localhost:11434/' }).e.endpoint()?.url).toBe('http://localhost:11434/v1/embeddings')
    expect(embedder({ enabled: true, model: 'nomic' }, { ...LM, presetId: 'anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com' }).e.endpoint()).toBeNull()
    expect(embedder({ enabled: true, model: 'text-embedding-3-small', baseUrl: 'https://api.openai.com/v1/' }, null).e.endpoint()).toEqual({ url: 'https://api.openai.com/v1/embeddings', model: 'text-embedding-3-small', own: true })
  })

  it('works each text out once, in batches, in order', async () => {
    const { e, server } = embedder({ enabled: true, model: 'nomic' })
    const texts = Array.from({ length: 40 }, (_, i) => `the inn number ${i}`)
    const vecs = await e.embed(texts)
    expect(vecs).toHaveLength(40)
    expect(Array.from(vecs[7])).toEqual(vecFor('the inn number 7').map((x) => Math.fround(x)))
    expect(server.calls.map((c) => c.input.length)).toEqual([32, 8])
    // Asked again (with one new text): only the new one goes to the server.
    await e.embed([...texts.slice(0, 5), 'a wolf howls'])
    expect(server.calls.at(-1)!.input).toEqual(['a wolf howls'])
    expect(server.calls).toHaveLength(3)
  })

  it('uses the right key, and says plainly what went wrong', async () => {
    const own = embedder({ enabled: true, model: 'emb', baseUrl: 'https://api.example.com/v1' })
    await own.e.embed(['a ford'])
    expect(own.server.calls[0].auth).toBe('Bearer sk-emb')
    await expect(embedder({ enabled: true, model: 'missing' }).e.embed(['x'])).rejects.toThrow(/an embedding model \("missing"\) is loaded/)
    await expect(embedder({ enabled: true, model: 'short' }).e.embed(['x'])).rejects.toThrow(/one embedding per text/)
    await expect(embedder({ enabled: false, model: 'nomic' }).e.embed(['x'])).rejects.toThrow(/off/)
  })

  it('recalls who and what bears on the scene though nothing names them', async () => {
    const ev = (kind: 'person' | 'place' | 'faction', name: string, summary: string): MemoryEvent => ({ type: 'entity', kind, name, summary, day: 1 })
    const memory = projectMemory([
      ev('person', 'Old Mara', 'a hunter who tracks the grey wolf pack in the pines'),
      ev('person', 'Brother Ansel', 'keeps the tower library'),
      ev('place', 'The Wicker Goose', 'an inn with a warm hearth and good ale'),
      ev('person', 'Tam', 'the ferryman at the river ford'),
      ev('faction', 'the Lantern Guild', 'keepers of scroll and tower'),
      ev('person', 'Pell', 'a sergeant of the watch'),
      { type: 'summary', summary: { level: 'scene', title: 'The pack at dusk', text: 'Wolves howled and circled; a fang-scarred wolf led the pack.', from: 'm1', to: 'm2', fromDay: 1, toDay: 1 } },
      { type: 'summary', summary: { level: 'scene', title: 'A quiet supper', text: 'Ale and stew at the inn by the hearth.', from: 'm3', to: 'm4', fromDay: 1, toDay: 1 } },
      { type: 'summary', summary: { level: 'scene', title: 'The library', text: 'Old scrolls in the tower.', from: 'm5', to: 'm6', fromDay: 2, toDay: 2 } },
      { type: 'summary', summary: { level: 'scene', title: 'Crossing', text: 'The ferry over the river.', from: 'm7', to: 'm8', fromDay: 2, toDay: 2 } },
      { type: 'summary', summary: { level: 'scene', title: 'Rain', text: 'It rained all day.', from: 'm9', to: 'm10', fromDay: 3, toDay: 3 } }
    ])
    const lore = [
      normalizeEntry({ id: 'l1', keys: ['greycoats'], content: 'The greycoats are the wolf packs of the north; they hunt in silence.' }),
      normalizeEntry({ id: 'l2', keys: ['ember'], content: 'The ember festival lights every hearth at midwinter.' }),
      normalizeEntry({ id: 'l3', keys: ['salt'], content: 'Salt is taxed at the river ford.' }),
      normalizeEntry({ id: 'l4', keys: ['tower'], content: 'The tower library burned twice.' }),
      normalizeEntry({ id: 'l5', keys: ['gods'], content: 'The old gods sleep.' })
    ]
    const { e } = embedder({ enabled: true, model: 'nomic' })
    const r = await recallByMeaning(e, 'A howl rises from the pines. Somewhere out there, wolves are hunting.', memory, lore)
    expect(r.entities).toEqual(['person:old mara'])
    expect(r.summaries).toEqual(['m2'])
    expect(r.lore).toEqual(['l1'])
    // The DM is reminded of Mara after anyone named, before those merely seen lately.
    expect(relevantEntities(memory, 'A howl rises from the pines.', null, 2, [], r.entities).map((x) => x.name)).toEqual(['Old Mara', 'Pell'])
    // And the old scene with the pack is kept even when only the newest would fit.
    const told = storySoFar(memory, 200, () => false, new Set(r.summaries))
    expect(told).toContain('The pack at dusk')
    expect(told).toContain('Rain')
    expect(told.indexOf('The pack at dusk')).toBeLessThan(told.indexOf('Rain'))
    expect(storySoFar(memory, 200, () => false)).not.toContain('The pack at dusk')
  })
})
