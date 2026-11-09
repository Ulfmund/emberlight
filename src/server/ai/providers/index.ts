import type { Connection } from '@shared/types'
import { findPreset } from '@shared/presets'
import type { Provider } from './types'
import { OpenAICompatProvider } from './openaiCompat'
import { OllamaProvider } from './ollama'
import { AnthropicProvider } from './anthropic'

export function createProvider(c: Pick<Connection, 'kind' | 'baseUrl' | 'presetId' | 'contextSize'>, apiKey?: string): Provider {
  const name = findPreset(c.presetId)?.label ?? 'the model server'
  switch (c.kind) {
    case 'anthropic':
      return new AnthropicProvider(apiKey)
    case 'ollama':
      return new OllamaProvider(c.baseUrl, c.contextSize ?? 0)
    case 'openai':
      return new OpenAICompatProvider(c.baseUrl, apiKey, name)
  }
}

export type { Provider } from './types'
