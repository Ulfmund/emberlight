import type { ProviderKind } from './types'

export type Preset = {
  id: string
  label: string
  kind: ProviderKind
  /** Address filled in when the preset is picked. */
  baseUrl: string
  /** Other addresses to try when the default doesn't answer (local servers only). */
  probeUrls?: string[]
  needsKey: boolean
  local: boolean
  /** Icon name from the renderer's icon set. */
  icon: string
  blurb: string
  /** Environment variable used as a fallback key during development. */
  envKey?: string
  /** Suggested model when the server lists several. */
  defaultModel?: string
}

export const PRESETS: Preset[] = [
  {
    id: 'lmstudio',
    label: 'LM Studio',
    kind: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    local: true,
    icon: 'crystal',
    blurb: 'Models running in LM Studio on this PC'
  },
  {
    id: 'ollama',
    label: 'Ollama',
    kind: 'ollama',
    baseUrl: 'http://localhost:11434',
    needsKey: false,
    local: true,
    icon: 'flask',
    blurb: 'Models running in Ollama on this PC'
  },
  {
    id: 'strata',
    label: 'Strata',
    kind: 'openai',
    // Strata exposes an OpenAI-compatible local API. Its default port isn't confirmed
    // yet, so we also try a few common ones.
    baseUrl: 'http://localhost:8080/v1',
    probeUrls: ['http://localhost:8000/v1', 'http://localhost:5000/v1', 'http://localhost:8081/v1'],
    needsKey: false,
    local: true,
    icon: 'strata',
    blurb: 'Big Qwen models squeezed onto a home GPU'
  },
  {
    id: 'koboldcpp',
    label: 'KoboldCpp',
    kind: 'openai',
    baseUrl: 'http://localhost:5001/v1',
    needsKey: false,
    local: true,
    icon: 'candle',
    blurb: 'Models running in KoboldCpp on this PC'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    local: false,
    icon: 'signpost',
    blurb: 'Hundreds of cloud models with one key',
    envKey: 'OPENROUTER_API_KEY'
  },
  {
    id: 'claude',
    label: 'Claude',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    needsKey: true,
    local: false,
    icon: 'star',
    blurb: "Anthropic's Claude models in the cloud",
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-opus-5-5'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com',
    needsKey: true,
    local: false,
    icon: 'drop',
    blurb: "DeepSeek's own models in the cloud, with a key from platform.deepseek.com",
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat'
  },
  {
    id: 'custom',
    label: 'Custom',
    kind: 'openai',
    baseUrl: 'http://localhost:8080/v1',
    needsKey: false,
    local: true,
    icon: 'key',
    blurb: 'Any OpenAI-compatible server'
  }
]

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

const hostOf = (url: string) => {
  try {
    return new URL(url.trim()).host.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * A Custom address that belongs to a cloud service with its own preset (DeepSeek's, say): that
 * preset's id, so the connection can move over to its button. Null for anything else.
 */
export function presetForAddress(presetId: string, baseUrl: string): Preset | null {
  if (presetId !== 'custom') return null
  const host = hostOf(baseUrl)
  if (!host) return null
  return PRESETS.find((p) => !p.local && p.kind === 'openai' && hostOf(p.baseUrl) === host) ?? null
}
