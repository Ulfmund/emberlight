import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ContextReport, ModelInfo, StreamEvent } from '@shared/types'
import { parseJsonReply, STALLED, stallGuard, withFormat, type ChatOptions, type CompleteOptions, type Provider } from './types'
import { describeContext } from './context'

/** Models that take adaptive thinking (and reject a fixed thinking budget). */
const ADAPTIVE = /^claude-(fable|mythos|opus-5|opus-4-[6-9]|sonnet-5|sonnet-4-6|haiku-5)/
/** Models that support the server-side refusal fallback ("default" routing). */
const FALLBACK_DEFAULT = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

/**
 * Jobs whose answer format is too big for Claude's strict output (it compiles each format into
 * a grammar, with a size limit). They're asked for plain JSON instead, checked here.
 */
const TOO_BIG = new Set<string>()
const tooBig = (err: unknown) => err instanceof Anthropic.APIError && err.status === 400 && /grammar is too large/i.test(err.message)

/** Claude, through the official Anthropic SDK. */
export class AnthropicProvider implements Provider {
  private client: Anthropic

  constructor(apiKey: string | undefined, baseURL?: string) {
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) })
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const out: ModelInfo[] = []
      for await (const m of this.client.models.list()) {
        const extra = m as unknown as { max_input_tokens?: number }
        out.push({ id: m.id, label: m.display_name, maxContext: extra.max_input_tokens })
      }
      return out
    } catch (err) {
      throw new Error(describeAnthropicError(err))
    }
  }

  async inspectContext(model: string): Promise<ContextReport> {
    try {
      const m = (await this.client.models.retrieve(model)) as unknown as { max_input_tokens?: number }
      return describeContext({ max: m.max_input_tokens, loaded: m.max_input_tokens })
    } catch {
      return {}
    }
  }

  async complete<T>(model: string, opts: CompleteOptions<T>): Promise<T> {
    const messages: Anthropic.MessageParam[] = opts.messages.map((m, i) =>
      i === opts.messages.length - 1 && opts.images?.length
        ? {
            role: m.role,
            content: [
              ...opts.images.map((img) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: img.mime as 'image/png', data: img.data } })),
              { type: 'text' as const, text: m.content }
            ]
          }
        : { role: m.role, content: m.content }
    )
    if (messages[0]?.role !== 'user') messages.unshift({ role: 'user', content: '(Begin.)' })
    // Bookkeeping jobs are simple: keep reasoning light so they're quick and cheap.
    const effort = ADAPTIVE.test(model) ? { effort: 'low' } : {}
    if (!TOO_BIG.has(opts.name)) {
      const params: Record<string, unknown> = { model, max_tokens: 8000, system: opts.system, messages, output_config: { format: zodOutputFormat(opts.schema), ...effort } }
      try {
        const response = await this.client.messages.parse(
          params as unknown as Parameters<typeof this.client.messages.parse>[0],
          { signal: opts.signal }
        )
        if (response.stop_reason === 'refusal') throw new Error('The model declined this request.')
        const parsed = (response as unknown as { parsed_output: T | null }).parsed_output
        if (parsed == null) throw new Error("The model's answer didn't match the expected format.")
        return parsed
      } catch (err) {
        if (!tooBig(err)) {
          if (err instanceof Error && !(err instanceof Anthropic.APIError)) throw err
          throw new Error(describeAnthropicError(err))
        }
        TOO_BIG.add(opts.name)
      }
    }
    // The format is written into the prompt instead, and the answer checked here.
    const system = withFormat(opts.system, opts.schema)
    try {
      const response = await this.client.messages.create(
        { model, max_tokens: 8000, system, messages, ...(ADAPTIVE.test(model) ? { output_config: effort } : {}) } as unknown as Parameters<typeof this.client.messages.create>[0],
        { signal: opts.signal }
      )
      const message = response as Anthropic.Message
      if (message.stop_reason === 'refusal') throw new Error('The model declined this request.')
      return parseJsonReply(message.content.map((b) => (b.type === 'text' ? b.text : '')).join(''), opts.schema)
    } catch (err) {
      if (err instanceof Error && !(err instanceof Anthropic.APIError)) throw err
      throw new Error(describeAnthropicError(err))
    }
  }

  async *chat(model: string, opts: ChatOptions): AsyncIterable<StreamEvent> {
    // The API requires the conversation to start with the player.
    const messages: Anthropic.Beta.BetaMessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }))
    if (messages[0]?.role !== 'user') messages.unshift({ role: 'user', content: '(Begin.)' })

    const params: Record<string, unknown> = {
      model,
      max_tokens: 64000,
      system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
      messages
    }
    if (ADAPTIVE.test(model)) {
      // Show a readable summary of the DM's reasoning in the collapsible "thinking" panel.
      params.thinking = { type: 'adaptive', display: 'summarized' }
    }
    if (FALLBACK_DEFAULT.has(model)) {
      // If a request is declined by a safety classifier, let the API retry it on a suitable model.
      params.betas = ['server-side-fallback-2026-07-01']
      params.fallbacks = 'default'
    }

    const guard = stallGuard(opts.signal)
    try {
      const stream = this.client.beta.messages.stream(
        params as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming,
        { signal: guard.signal }
      )
      for await (const event of stream) {
        guard.poke()
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') yield { type: 'text', text: event.delta.text }
          else if (event.delta.type === 'thinking_delta') yield { type: 'thinking', text: event.delta.thinking }
        }
      }
      const final = await stream.finalMessage()
      if (final.stop_reason === 'refusal') {
        yield { type: 'notice', message: 'The model declined to continue this scene.' }
      }
      yield { type: 'done', stopReason: final.stop_reason ?? null }
    } catch (err) {
      yield { type: 'error', message: guard.stalled ? STALLED : describeAnthropicError(err) }
    } finally {
      guard.done()
    }
  }
}

function describeAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.APIUserAbortError) return 'Stopped.'
  if (err instanceof Anthropic.AuthenticationError) return 'Claude rejected the API key. Check it on the Connect screen.'
  if (err instanceof Anthropic.PermissionDeniedError) return 'This API key does not have access to that model.'
  if (err instanceof Anthropic.NotFoundError) return 'Claude did not recognise that model name.'
  if (err instanceof Anthropic.RateLimitError) return 'Claude is rate-limiting requests. Wait a moment and try again.'
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message}`
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check your internet connection."
  if (err instanceof Anthropic.APIError) return `Claude error ${err.status ?? ''}: ${err.message}`.trim()
  return (err as Error)?.message ?? String(err)
}
