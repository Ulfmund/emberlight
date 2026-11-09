import type { Hono } from 'hono'
import { cosine, EmbeddingSettingsSchema } from '@shared/embeddings'
import type { SettingsStore } from '../store/settings'
import type { SecretStore } from '../store/secrets'
import type { Embedder } from '../ai/embeddings'

/** Memory by meaning: its settings (the computer only, like the image generator's) and a test. */
export function registerEmbeddingRoutes(app: Hono, settings: SettingsStore, secrets: SecretStore, embedder: Embedder) {
  const view = async () => ({ ...settings.embeddings, hasKey: await secrets.has('embeddings'), ready: embedder.ready() })

  app.get('/api/embeddings/settings', async (c) => c.json(await view()))

  app.put('/api/embeddings/settings', async (c) => {
    const p = EmbeddingSettingsSchema.safeParse(await c.req.json().catch(() => null))
    if (!p.success) return c.json({ error: 'Invalid settings for memory by meaning.' }, 400)
    settings.setEmbeddings(p.data)
    return c.json(await view())
  })

  /** Three sentences: two that mean much the same, one that doesn't. A working model tells them apart. */
  app.post('/api/embeddings/settings/test', async (c) => {
    try {
      const [a, b, x] = await embedder.embed(['The innkeeper pours you a mug of ale by the fire.', 'A tavern keeper serves the traveller a drink near the hearth.', 'A wolf bares its fangs in the snow.'], c.req.raw.signal)
      return c.json({ dims: a.length, alike: Math.round(cosine(a, b) * 100) / 100, unlike: Math.round(cosine(a, x) * 100) / 100 })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502)
    }
  })
}
