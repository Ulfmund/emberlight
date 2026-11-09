import { z } from 'zod'
import type { ChatMessage, ContextReport, ModelInfo, StreamEvent } from '@shared/types'

export type ChatOptions = {
  system: string
  messages: ChatMessage[]
  signal: AbortSignal
}

export type CompleteOptions<T> = {
  system: string
  messages: ChatMessage[]
  /** The shape the answer must have. Used to constrain the model where the server supports it. */
  schema: z.ZodType<T>
  /** Short name for the schema (some servers require one). */
  name: string
  signal?: AbortSignal
  /** Pictures for the model to look at, with the last message (vision models only). */
  images?: { mime: string; data: string }[]
}

/**
 * Every model server is wrapped in one of these. Adding a new kind of server means
 * writing one new file that implements this interface; nothing else changes.
 */
export interface Provider {
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  /** Best-effort look at the model's context size. Never throws. */
  inspectContext(model: string, signal?: AbortSignal): Promise<ContextReport>
  /** Streams story text. */
  chat(model: string, opts: ChatOptions): AsyncIterable<StreamEvent>
  /** A short structured answer (JSON matching `schema`). Throws if the model can't produce one. */
  complete<T>(model: string, opts: CompleteOptions<T>): Promise<T>
}

/**
 * Stops waiting on a model that has gone quiet: up to `firstMs` for the first piece of text
 * (big local models can take a while to start), then `gapMs` between pieces.
 */
export function stallGuard(outer: AbortSignal, firstMs = 240_000, gapMs = 90_000) {
  const ctl = new AbortController()
  let timer = setTimeout(() => ctl.abort(), firstMs)
  const onAbort = () => ctl.abort()
  outer.addEventListener('abort', onAbort)
  return {
    signal: ctl.signal,
    /** Call whenever text arrives. */
    poke() {
      clearTimeout(timer)
      timer = setTimeout(() => ctl.abort(), gapMs)
    },
    done() {
      clearTimeout(timer)
      outer.removeEventListener('abort', onAbort)
    },
    get stalled() {
      return ctl.signal.aborted && !outer.aborted
    }
  }
}

export const STALLED = 'The model stopped responding. Try again, or check that the model server is still running.'

/** JSON Schema for servers that take one (LM Studio, llama.cpp, Ollama…). */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>
  delete js.$schema
  return js
}

/**
 * Pulls a JSON object out of a model reply, tolerating thinking tags, code fences and chatter
 * around it, then checks it against the schema. Throws with a readable reason on failure.
 */
export function parseJsonReply<T>(text: string, schema: z.ZodType<T>): T {
  let s = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s)
  if (fence) s = fence[1]
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('The model did not reply with JSON.')
  let parsed: unknown
  try {
    parsed = JSON.parse(s.slice(start, end + 1))
  } catch {
    throw new Error('The model replied with broken JSON.')
  }
  const result = schema.safeParse(parsed)
  if (!result.success) throw new Error(`The model's JSON didn't match: ${result.error.issues[0]?.message ?? 'invalid'}`)
  return result.data
}

export const JSON_ONLY =
  '\n\nReply with a single JSON object only, matching the requested format. No other text.'

/** The system prompt with the format written in, for when the server can't be handed the schema itself. */
export function withFormat(system: string, schema: z.ZodType): string {
  return `${system}\n\nAnswer with one JSON object and nothing else, matching this JSON Schema:\n${JSON.stringify(toJsonSchema(schema))}`
}

/** A short, readable error for the UI, from whatever fetch/HTTP failure happened. */
export function friendlyError(err: unknown, serverName: string): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string } }
  if (e?.name === 'AbortError') return 'Stopped.'
  const code = e?.cause?.code
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET') {
    return `Couldn't reach ${serverName}. Is it running, and is the address right?`
  }
  if (e?.name === 'TimeoutError') return `${serverName} took too long to answer.`
  return e?.message || String(err)
}

export async function readHttpError(res: Response): Promise<string> {
  let detail = ''
  try {
    const body = await res.text()
    try {
      const j = JSON.parse(body)
      detail = j?.error?.message ?? j?.error ?? j?.message ?? body
    } catch {
      detail = body
    }
  } catch {
    /* ignore */
  }
  if (res.status === 401 || res.status === 403) return `The server rejected the API key (${res.status}).`
  if (res.status === 404) return `Not found (404). Check the address and model name. ${detail}`.trim()
  return `Server error ${res.status}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`
}

/** Reads a fetch body line by line (for SSE and NDJSON streams). */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '')
        buf = buf.slice(nl + 1)
        yield line
      }
    }
    buf += decoder.decode()
    if (buf) yield buf
  } finally {
    reader.releaseLock()
  }
}

/**
 * Many local reasoning models (Qwen, DeepSeek…) put their thinking inside
 * <think>…</think> in the normal text. This splits it out so the UI can hide it.
 * Tags can arrive split across chunks, so partial tags are held back.
 */
export class ThinkTagSplitter {
  private inThink = false
  private pending = ''

  push(chunk: string): StreamEvent[] {
    let s = this.pending + chunk
    this.pending = ''
    const out: StreamEvent[] = []
    while (s.length) {
      const tag = this.inThink ? '</think>' : '<think>'
      const i = s.indexOf(tag)
      if (i >= 0) {
        if (i > 0) out.push({ type: this.inThink ? 'thinking' : 'text', text: s.slice(0, i) })
        this.inThink = !this.inThink
        s = s.slice(i + tag.length)
        continue
      }
      // Hold back a trailing piece that could be the start of a tag.
      let keep = 0
      for (let k = Math.min(tag.length - 1, s.length); k > 0; k--) {
        if (tag.startsWith(s.slice(-k))) {
          keep = k
          break
        }
      }
      const emit = s.slice(0, s.length - keep)
      if (emit) out.push({ type: this.inThink ? 'thinking' : 'text', text: emit })
      this.pending = s.slice(s.length - keep)
      break
    }
    return out
  }

  flush(): StreamEvent[] {
    const rest = this.pending
    this.pending = ''
    return rest ? [{ type: this.inThink ? 'thinking' : 'text', text: rest }] : []
  }
}

export async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T> {
  const res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(await readHttpError(res))
  return (await res.json()) as T
}
