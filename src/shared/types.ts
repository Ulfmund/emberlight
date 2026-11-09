import { z } from 'zod'

/** Which adapter talks to the model server. */
export const ProviderKind = z.enum(['openai', 'ollama', 'anthropic'])
export type ProviderKind = z.infer<typeof ProviderKind>

/** The one model connection the player has chosen (Advanced per-job models come later). */
export const Connection = z.object({
  presetId: z.string(),
  kind: ProviderKind,
  baseUrl: z.string(),
  model: z.string(),
  /** Context size to request where the server lets us choose it (Ollama). 0 = automatic. */
  contextSize: z.number().int().min(0).default(0)
})
export type Connection = z.infer<typeof Connection>

export const ChatMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string()
})
export type ChatMessage = z.infer<typeof ChatMessage>

export const ChatRequest = z.object({
  messages: z.array(ChatMessage).min(1)
})
export type ChatRequest = z.infer<typeof ChatRequest>

/** Events streamed from the server to the UI while the DM writes. */
export type StreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'notice'; message: string }
  | { type: 'done'; stopReason: string | null }
  | { type: 'error'; message: string }

export type ModelInfo = {
  id: string
  label?: string
  /** Largest context the model supports, if the server says. */
  maxContext?: number
}

export type ContextReport = {
  /** Context the model is actually running with right now, if known. */
  loaded?: number
  /** Largest context the model supports, if known. */
  max?: number
  /** Context the app will request (Ollama only). */
  requested?: number
  /** Plain-English warning when the context is small. */
  warning?: string
}

export type TestResult =
  | {
      ok: true
      message: string
      models: ModelInfo[]
      /** The model the context report is about (the chosen one, or the suggested default). */
      model?: string
      context?: ContextReport
      /** Set when the server answered on a different address than the one entered. */
      resolvedBaseUrl?: string
    }
  | { ok: false; message: string; models?: ModelInfo[] }

export type SettingsView = {
  connection: Connection | null
  /** Which presets have a saved key (keys themselves never leave the server). */
  savedKeys: Record<string, boolean>
  /** True when keys are encrypted by the operating system. */
  secureStorage: boolean
}

/** Below this, long campaigns will struggle no matter what the app does. */
export const SMALL_CONTEXT = 8192
