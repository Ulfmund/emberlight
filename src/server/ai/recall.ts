import type { LoreEntry } from '@shared/lore'
import type { Entity, Memory } from '@shared/memory'
import { cosine, spreadOf, standouts } from '@shared/embeddings'
import type { Embedder } from './embeddings'

/**
 * Memory by meaning, for one turn: of everything remembered, what bears on the scene right now,
 * whether or not it's named. The turn uses it to choose which people, which older chapters and
 * which lore the DM is reminded of (names and keywords still count first).
 */

export type Recalled = { entities: string[]; summaries: string[]; lore: string[] }
export const NOTHING_RECALLED: Recalled = { entities: [], summaries: [], lore: [] }

const entityText = (e: Entity) =>
  `${e.name}${e.kind === 'place' ? ' (a place)' : e.kind === 'faction' ? ' (a group)' : ''}: ${e.summary || 'no description'}${e.facts.length ? `. ${e.facts.slice(-4).join('. ')}` : ''}`.slice(0, 1200)

export async function recallByMeaning(
  embedder: Embedder,
  recent: string,
  memory: Memory,
  lore: LoreEntry[],
  signal?: AbortSignal,
  max = { entities: 4, summaries: 3, lore: 2 }
): Promise<Recalled> {
  const query = recent.trim().slice(-2400)
  if (!query) return NOTHING_RECALLED
  const ents = memory.entities.slice(-200)
  const sums = [...memory.chapters, ...memory.scenes].slice(-80)
  const books = lore.filter((e) => e.enabled !== false && !e.constant && e.content.trim()).slice(0, 300)
  if (!ents.length && !sums.length && !books.length) return NOTHING_RECALLED
  const texts = [
    query,
    ...ents.map(entityText),
    ...sums.map((s) => `${s.title}. ${s.text}`.slice(0, 1200)),
    ...books.map((e) => `${e.keys.join(', ')}: ${e.content}`.slice(0, 1200))
  ]
  const vecs = await embedder.embed(texts, signal)
  const q = vecs[0]
  let i = 1
  const score = <T>(items: T[]) => items.map((item) => ({ item, sim: cosine(q, vecs[i++]) }))
  const e = score(ents)
  const s = score(sums)
  const l = score(books)
  // What stands out is measured against everything remembered, not each kind on its own.
  const pool = spreadOf([...e, ...s, ...l].map((x) => x.sim))
  return {
    entities: standouts(e, max.entities, pool).map((x) => x.id),
    summaries: standouts(s, max.summaries, pool).map((x) => x.to),
    lore: standouts(l, max.lore, pool).map((x) => x.id)
  }
}
