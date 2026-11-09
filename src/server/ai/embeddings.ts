import { createHash } from 'node:crypto'
import type { Connection } from '@shared/types'
import type { EmbeddingSettings } from '@shared/embeddings'
import type { GameDb } from '../store/db'

/**
 * Embeddings for memory by meaning (docs/spec/07-memory-and-lore.md#memory-by-meaning), from an
 * OpenAI-compatible `/embeddings` endpoint: LM Studio, Ollama, llama.cpp, or a cloud API. Each
 * text is embedded once per model and kept in the save file, so a turn only asks for what's new.
 */

export class EmbedError extends Error {}

const trimUrl = (u: string) => u.trim().replace(/\/+$/, '')
const keyOf = (model: string, text: string) => createHash('sha1').update(model).update('\0').update(text).digest('hex')

export class Embedder {
  constructor(
    private db: GameDb,
    private config: () => { embeddings: EmbeddingSettings; connection: Connection | null },
    private secret: (id: string) => Promise<string | undefined>,
    /** Swappable for tests. */
    private fetcher: typeof fetch = fetch
  ) {}

  /**
   * Where embeddings come from: the address set for them, or else the story model's own server
   * when that's a local one (Claude has no embedding models).
   */
  endpoint(): { url: string; model: string; own: boolean } | null {
    const { embeddings: s, connection: c } = this.config()
    if (!s.enabled || !s.model.trim()) return null
    if (s.baseUrl.trim()) return { url: `${trimUrl(s.baseUrl)}/embeddings`, model: s.model.trim(), own: true }
    if (!c || c.kind === 'anthropic' || !c.baseUrl.trim()) return null
    const base = c.kind === 'ollama' ? `${trimUrl(c.baseUrl)}/v1` : trimUrl(c.baseUrl)
    return { url: `${base}/embeddings`, model: s.model.trim(), own: false }
  }

  ready(): boolean {
    return this.endpoint() !== null
  }

  /** One vector per text, in order. Asks the server only for texts it hasn't seen with this model. */
  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    const ep = this.endpoint()
    if (!ep) throw new EmbedError('Memory by meaning is off, or has no model set.')
    const keys = texts.map((t) => keyOf(ep.model, t))
    const have = this.db.getEmbeddings(keys)
    const missing = [...new Set(texts.filter((_, i) => !have.has(keys[i])))]
    for (let i = 0; i < missing.length; i += 32) {
      const batch = missing.slice(i, i + 32)
      const vecs = await this.request(ep, batch, signal)
      const rows = batch.map((t, j) => ({ key: keyOf(ep.model, t), vec: vecs[j] }))
      this.db.putEmbeddings(rows)
      for (const r of rows) have.set(r.key, r.vec)
    }
    return keys.map((k) => have.get(k)!)
  }

  private async request(ep: { url: string; model: string; own: boolean }, input: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    const key = ep.own ? await this.secret('embeddings') : await this.secret(this.config().connection?.presetId ?? '')
    const timeout = AbortSignal.timeout(20_000)
    let res: Response
    try {
      res = await this.fetcher(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model: ep.model, input }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout
      })
    } catch (err) {
      throw new EmbedError(`Couldn't reach the embeddings server at ${ep.url} (${(err as Error).message}).`)
    }
    if (!res.ok) {
      const said = (await res.text().catch(() => '')).slice(0, 200)
      throw new EmbedError(res.status === 404 ? `No embeddings at ${ep.url}: check the address, and that an embedding model ("${ep.model}") is loaded.` : `The embeddings server said ${res.status}${said ? `: ${said}` : ''}.`)
    }
    const body = (await res.json().catch(() => null)) as { data?: { embedding?: number[]; index?: number }[] } | null
    const data = [...(body?.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    if (data.length !== input.length || data.some((d) => !Array.isArray(d.embedding) || !d.embedding.length)) throw new EmbedError("The embeddings server's answer didn't have one embedding per text.")
    return data.map((d) => Float32Array.from(d.embedding!))
  }
}
