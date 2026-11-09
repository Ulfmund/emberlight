import { z } from 'zod'

/**
 * Image generation (docs/spec/03-characters-and-cards.md#image-generation): optional, set up
 * once on the Connect screen. Portraits for the player and the people of the story.
 */

export const IMAGE_BACKENDS = {
  sdwebui: { label: 'Stable Diffusion WebUI / Forge', url: 'http://127.0.0.1:7860', hint: 'Start it with the --api option. Leave the model empty to use the one it has loaded.' },
  comfyui: { label: 'ComfyUI', url: 'http://127.0.0.1:8188', hint: 'Model: the checkpoint file name, e.g. sd_xl_base_1.0.safetensors. Or paste your own workflow (API format).' },
  openai: { label: 'OpenAI-compatible images API', url: 'https://api.openai.com/v1', hint: 'Model: e.g. gpt-image-1 or dall-e-3. Needs an API key.' }
} as const
export type ImageBackend = 'none' | keyof typeof IMAGE_BACKENDS

export const ImageSettingsSchema = z.object({
  backend: z.enum(['none', 'sdwebui', 'comfyui', 'openai']),
  baseUrl: z.string().max(300),
  model: z.string().max(200),
  /** Added to every portrait prompt: the look of the art. */
  style: z.string().max(600),
  negative: z.string().max(600),
  size: z.union([z.literal(512), z.literal(768), z.literal(1024)]),
  steps: z.number().int().min(4).max(80),
  /** ComfyUI: a workflow in API format, with {{prompt}}, {{negative}}, {{seed}}, {{width}}, {{height}}, {{steps}} and {{model}} where they go. */
  workflow: z.string().max(100_000)
})
export type ImageSettings = z.infer<typeof ImageSettingsSchema>

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  backend: 'none',
  baseUrl: '',
  model: '',
  style: 'painterly fantasy portrait, head and shoulders, warm candlelight, rich detail, oil painting',
  negative: 'text, watermark, signature, blurry, deformed hands, extra fingers, modern clothing',
  size: 768,
  steps: 28,
  workflow: ''
}

export function normalizeImageSettings(x: unknown): ImageSettings {
  const p = ImageSettingsSchema.partial().safeParse(x)
  return { ...DEFAULT_IMAGE_SETTINGS, ...(p.success ? p.data : {}) }
}

/** The prompt for a portrait, from what the sheet or the Journal knows. It can be edited before generating. */
export function portraitPrompt(style: string, who: { kind: string; details: string[] }): string {
  const parts = [style.trim(), `portrait of ${who.kind}`, ...who.details.map((d) => d.trim().replace(/\.$/, ''))].filter(Boolean)
  return parts.join(', ').replace(/\s+/g, ' ').slice(0, 1500)
}

export const mediaUrl = (id: string) => `/api/media/${encodeURIComponent(id)}`
