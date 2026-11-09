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
  STALLED,
  stallGuard,
  ThinkTagSplitter,
  toJsonSchema
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

  complete<T>(model: string, opts: CompleteOptions<T>): Promise<T> {
    return openAiComplete(this.baseUrl, this.headers(), this.serverName, model, opts)
  }

  async *chat(model: string, opts: ChatOptions): AsyncIterable<StreamEvent> {
    const guard = stallGuard(opts.signal)
    try {
      yield* this.streamChat(model, opts, guard)
    } finally {
      guard.done()
    }
  }

  private async *streamChat(model: string, opts: ChatOptions, guard: ReturnType<typeof stallGuard>): AsyncIterable<StreamEvent> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        signal: guard.signal,
        body: JSON.stringify({
          model,
          stream: true,
          messages: [{ role: 'system', content: opts.system }, ...opts.messages],
          temperature: 0.9,
          max_tokens: 1200
        })
      })
    } catch (err) {
      yield { type: 'error', message: guard.stalled ? STALLED : friendlyError(err, this.serverName) }
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
        guard.poke()
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
      yield { type: 'error', message: guard.stalled ? STALLED : friendlyError(err, this.serverName) }
      return
    }
    for (const ev of splitter.flush()) yield ev
    yield { type: 'done', stopReason }
  }
}

/** Remembers servers that rejected `response_format`, so we don't keep asking. */
const noSchemaSupport = new Set<string>()

/** The last message with the pictures attached, the way OpenAI-style servers take them. */
function withImages<T>(opts: CompleteOptions<T>): unknown[] {
  if (!opts.images?.length) return opts.messages
  return opts.messages.map((m, i) =>
    i === opts.messages.length - 1
      ? { role: m.role, content: [{ type: 'text', text: m.content }, ...opts.images!.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } }))] }
      : m
  )
}

export async function openAiComplete<T>(
  baseUrl: string,
  headers: Record<string, string>,
  serverName: string,
  model: string,
  opts: CompleteOptions<T>
): Promise<T> {
  const useSchema = !noSchemaSupport.has(baseUrl)
  const body = (withSchema: boolean) =>
    JSON.stringify({
      model,
      stream: false,
      temperature: 0.3,
      max_tokens: 1500,
      messages: [{ role: 'system', content: opts.system + JSON_ONLY }, ...withImages(opts)],
      ...(withSchema
        ? { response_format: { type: 'json_schema', json_schema: { name: opts.name, schema: toJsonSchema(opts.schema) } } }
        : {})
    })
  const send = async (withSchema: boolean) => {
    try {
      return await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: body(withSchema),
        signal: opts.signal ?? AbortSignal.timeout(120_000)
      })
    } catch (err) {
      throw new Error(friendlyError(err, serverName))
    }
  }

  let res = await send(useSchema)
  if (useSchema && (res.status === 400 || res.status === 422 || res.status === 500)) {
    // This server doesn't understand schema-constrained output; fall back to plain JSON.
    noSchemaSupport.add(baseUrl)
    res = await send(false)
  }
  if (!res.ok) throw new Error(await readHttpError(res))
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = j.choices?.[0]?.message?.content ?? ''
  return parseJsonReply(text, opts.schema)
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && v > 0 ? v : undefined
}
