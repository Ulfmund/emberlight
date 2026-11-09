import type { ContextReport, ModelInfo, StreamEvent } from '@shared/types'
import {
  type ChatOptions,
  type CompleteOptions,
  type Provider,
  friendlyError,
  getJson,
  JSON_ONLY,
  parseJsonReply,
  readHttpError,
  readLines,
  ThinkTagSplitter,
  toJsonSchema
} from './types'
import { describeContext } from './context'

/** Ollama's default context is small unless you raise it, so we ask for this much by default. */
const AUTO_CONTEXT = 16384

/**
 * Ollama, through its native API rather than the OpenAI-compatible one, because only the
 * native API lets us set the context size (num_ctx) per request. That fixes the classic
 * "my model only remembers 4k tokens" problem without the player touching Ollama settings.
 */
export class OllamaProvider implements Provider {
  constructor(
    private baseUrl: string,
    private contextSize: number
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    try {
      const j = await getJson<{ models?: { name: string }[] }>(`${this.baseUrl}/api/tags`, { signal }, 6000)
      return (j.models ?? []).map((m) => ({ id: m.name }))
    } catch (err) {
      throw new Error(friendlyError(err, 'Ollama'))
    }
  }

  private async maxContext(model: string): Promise<number | undefined> {
    try {
      const j = await getJson<{ model_info?: Record<string, unknown> }>(
        `${this.baseUrl}/api/show`,
        { method: 'POST', body: JSON.stringify({ model }), headers: { 'Content-Type': 'application/json' } },
        4000
      )
      const entry = Object.entries(j.model_info ?? {}).find(([k]) => k.endsWith('.context_length'))
      return typeof entry?.[1] === 'number' ? entry[1] : undefined
    } catch {
      return undefined
    }
  }

  private async numCtx(model: string): Promise<number> {
    if (this.contextSize > 0) return this.contextSize
    const max = await this.maxContext(model)
    return max ? Math.min(max, AUTO_CONTEXT) : AUTO_CONTEXT
  }

  async inspectContext(model: string): Promise<ContextReport> {
    const max = await this.maxContext(model)
    const requested = this.contextSize > 0 ? this.contextSize : max ? Math.min(max, AUTO_CONTEXT) : AUTO_CONTEXT
    return describeContext(
      { max, requested },
      'You can raise it under Advanced on the Connect screen (bigger uses more memory).'
    )
  }

  async complete<T>(model: string, opts: CompleteOptions<T>): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: opts.signal ?? AbortSignal.timeout(120_000),
        body: JSON.stringify({
          model,
          stream: false,
          // Ollama constrains the output to this JSON Schema.
          format: toJsonSchema(opts.schema),
          messages: [{ role: 'system', content: opts.system + JSON_ONLY }, ...opts.messages],
          options: { num_ctx: await this.numCtx(model), temperature: 0.3, num_predict: 1500 }
        })
      })
    } catch (err) {
      throw new Error(friendlyError(err, 'Ollama'))
    }
    if (!res.ok) throw new Error(await readHttpError(res))
    const j = (await res.json()) as { message?: { content?: string } }
    return parseJsonReply(j.message?.content ?? '', opts.schema)
  }

  async *chat(model: string, opts: ChatOptions): AsyncIterable<StreamEvent> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: opts.signal,
        body: JSON.stringify({
          model,
          stream: true,
          messages: [{ role: 'system', content: opts.system }, ...opts.messages],
          options: { num_ctx: await this.numCtx(model), temperature: 0.9, num_predict: 1200 }
        })
      })
    } catch (err) {
      yield { type: 'error', message: friendlyError(err, 'Ollama') }
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
        if (!line.trim()) continue
        let j: { message?: { content?: string; thinking?: string }; done?: boolean; done_reason?: string; error?: string }
        try {
          j = JSON.parse(line)
        } catch {
          continue
        }
        if (j.error) {
          yield { type: 'error', message: j.error }
          return
        }
        if (j.message?.thinking) yield { type: 'thinking', text: j.message.thinking }
        if (j.message?.content) for (const ev of splitter.push(j.message.content)) yield ev
        if (j.done) {
          stopReason = j.done_reason ?? 'stop'
          break
        }
      }
    } catch (err) {
      yield { type: 'error', message: friendlyError(err, 'Ollama') }
      return
    }
    for (const ev of splitter.flush()) yield ev
    yield { type: 'done', stopReason }
  }
}
