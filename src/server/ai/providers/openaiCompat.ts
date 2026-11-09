import type { ContextReport, ModelInfo, StreamEvent } from '@shared/types'
import {
  type ChatOptions,
  type Provider,
  friendlyError,
  getJson,
  readHttpError,
  readLines,
  ThinkTagSplitter
} from './types'
import { describeContext } from './context'

/**
 * Any server that speaks the OpenAI chat-completions API: LM Studio, Strata, KoboldCpp,
 * llama.cpp, vLLM, OpenRouter, OpenAI…
 */
export class OpenAICompatProvider implements Provider {
  constructor(
    private baseUrl: string,
    private apiKey: string | undefined,
    private serverName: string
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`
    if (this.baseUrl.includes('openrouter.ai')) h['X-Title'] = 'Emberlight'
    return h
  }

  /** Server root without the trailing /v1, for the non-OpenAI endpoints some servers add. */
  private get root(): string {
    return this.baseUrl.replace(/\/v1$/, '')
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      const j = await getJson<{ data?: { id: string; context_length?: number }[] }>(
        `${this.baseUrl}/models`,
        { headers: this.headers(), signal },
        6000
      )
      return (j.data ?? []).map((m) => ({ id: m.id, maxContext: m.context_length }))
    } catch (err) {
      throw new Error(friendlyError(err, this.serverName))
    }
  }

  async inspectContext(model: string): Promise<ContextReport> {
    // Each server reports this differently (or not at all). Try the known ones quietly.
    const tries: Array<() => Promise<ContextReport | null>> = [
      // LM Studio's own REST API
      async () => {
        const j = await getJson<{ data?: Record<string, unknown>[] }>(`${this.root}/api/v0/models`, {}, 2500)
        const m = j.data?.find((d) => d.id === model)
        if (!m) return null
        const loaded = num(m.loaded_context_length) ?? num(m.context_length)
        return { loaded: m.state === 'loaded' ? loaded : undefined, max: num(m.max_context_length) }
      },
      // llama.cpp server (and engines built on it)
      async () => {
        const j = await getJson<{ default_generation_settings?: { n_ctx?: number }; n_ctx?: number }>(
          `${this.root}/props`,
          {},
          2500
        )
        const n = num(j.default_generation_settings?.n_ctx) ?? num(j.n_ctx)
        return n ? { loaded: n } : null
      },
      // KoboldCpp
      async () => {
        const j = await getJson<{ value?: number }>(`${this.root}/api/extra/true_max_context_length`, {}, 2500)
        return num(j.value) ? { loaded: num(j.value) } : null
      }
    ]
    if (this.baseUrl.startsWith('https://')) {
      // Cloud services: rely on what /models reported.
      const models = await this.listModels().catch(() => [])
      const max = models.find((m) => m.id === model)?.maxContext
      return describeContext({ max })
    }
    for (const t of tries) {
      try {
        const r = await t()
        if (r && (r.loaded || r.max)) return describeContext(r)
      } catch {
        /* this server doesn't have that endpoint */
      }
    }
    return {}
  }

  async *chat(model: string, opts: ChatOptions): AsyncIterable<StreamEvent> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        signal: opts.signal,
        body: JSON.stringify({
          model,
          stream: true,
          messages: [{ role: 'system', content: opts.system }, ...opts.messages],
          temperature: 0.9,
          max_tokens: 1200
        })
      })
    } catch (err) {
      yield { type: 'error', message: friendlyError(err, this.serverName) }
      return
    }
    if (!res.ok || !res.body) {
      yield { type: 'error', message: await readHttpError(res) }
      return
    }

    const splitter = new ThinkTagSplitter()
    let stopReason: string | null = null
    try {
      for await (const line of readLines(res.body)) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') break
        let j: {
          choices?: { delta?: { content?: string; reasoning_content?: string; reasoning?: string }; finish_reason?: string }[]
          error?: { message?: string }
        }
        try {
          j = JSON.parse(data)
        } catch {
          continue
        }
        if (j.error) {
          yield { type: 'error', message: j.error.message ?? 'The server reported an error.' }
          return
        }
        const choice = j.choices?.[0]
        const d = choice?.delta
        const reasoning = d?.reasoning_content ?? d?.reasoning
        if (reasoning) yield { type: 'thinking', text: reasoning }
        if (d?.content) for (const ev of splitter.push(d.content)) yield ev
        if (choice?.finish_reason) stopReason = choice.finish_reason
      }
    } catch (err) {
      yield { type: 'error', message: friendlyError(err, this.serverName) }
      return
    }
    for (const ev of splitter.flush()) yield ev
    yield { type: 'done', stopReason }
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && v > 0 ? v : undefined
}
