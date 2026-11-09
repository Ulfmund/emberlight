import { z } from 'zod'

/**
 * Memory by meaning (docs/spec/07-memory-and-lore.md#memory-by-meaning): with an embedding
 * model, the DM is reminded of the people, places, older chapters and lore that bear on the
 * scene even when nothing in it says their name. Optional: without one, names and keywords
 * decide, as before.
 */

export const EmbeddingSettingsSchema = z.object({
  enabled: z.boolean(),
  /** An OpenAI-compatible server (…/v1). Empty: the story model's own server, when it's a local one. */
  baseUrl: z.string().max(300),
  model: z.string().max(200)
})
export type EmbeddingSettings = z.infer<typeof EmbeddingSettingsSchema>

export const DEFAULT_EMBEDDING_SETTINGS: EmbeddingSettings = { enabled: false, baseUrl: '', model: '' }

export function normalizeEmbeddingSettings(x: unknown): EmbeddingSettings {
  const p = EmbeddingSettingsSchema.partial().safeParse(x)
  return { ...DEFAULT_EMBEDDING_SETTINGS, ...(p.success ? p.data : {}) }
}

/** How alike two texts are, by their embeddings: about 1 for the same meaning, about 0 for unrelated. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export type Spread = { mean: number; sd: number; size: number }

/** The average and spread of a set of scores. */
export function spreadOf(sims: number[]): Spread {
  const size = sims.length
  if (!size) return { mean: 0, sd: 0, size }
  const mean = sims.reduce((n, x) => n + x, 0) / size
  return { mean, sd: Math.sqrt(sims.reduce((n, x) => n + (x - mean) ** 2, 0) / size), size }
}

/** How many spreads above the average a score must be to count (tuned on nomic-embed-text: true matches 1.4–3.7, the rest 0.9 and under). */
export const STANDOUT_Z = 1.3
/** Fewer things than this to compare, and the spread means little: nothing is recalled. */
export const MIN_POOL = 6

/**
 * The few that stand out: the most alike, but only those clearly closer than everything else
 * compared (`pool`). Models score on different scales (one calls unrelated texts 0.5, another
 * 0.1), so the bar is measured in spreads above the average rather than as a fixed number.
 */
export function standouts<T>(scored: { item: T; sim: number }[], max: number, pool: Spread = spreadOf(scored.map((s) => s.sim))): T[] {
  if (!scored.length || max <= 0 || pool.size < MIN_POOL || pool.sd <= 1e-6) return []
  return scored
    .filter((s) => (s.sim - pool.mean) / pool.sd >= STANDOUT_Z)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, max)
    .map((s) => s.item)
}
