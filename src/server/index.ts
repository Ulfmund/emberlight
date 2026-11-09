import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getRequestListener } from '@hono/node-server'
import { z } from 'zod'
import {
  ChatRequest,
  Connection,
  type SettingsView,
  type StreamEvent,
  type TestResult,
  type UpdateStatus
} from '@shared/types'
import { findPreset } from '@shared/presets'
import { SettingsStore } from './store/settings'
import { SecretStore, type Cipher } from './store/secrets'
import { createProvider } from './ai/providers'
import { NARRATOR_SYSTEM } from './ai/narrator'

export type ServerOptions = {
  dataDir: string
  cipher: Cipher
  /** Built UI to serve (production). In development the Vite dev server serves the UI instead. */
  staticDir?: string
  /** Extra origins allowed to call the API (the Vite dev server in development). */
  devOrigins?: string[]
  host?: string
  port: number
  /** Try the next ports if the first is taken. */
  portFallback?: boolean
  /** The desktop app's self-updater (absent when there's nothing to update, e.g. tests). */
  updates?: {
    status(): UpdateStatus
    check(): Promise<void>
    download(): Promise<void>
    install(): void
  }
}

/**
 * The local game server. The desktop window and (later) the phone both talk to this same
 * HTTP API, so there is exactly one code path for everything the UI does.
 */
export async function startServer(opts: ServerOptions): Promise<{ port: number; close: () => void }> {
  const settings = new SettingsStore(opts.dataDir)
  const secrets = new SecretStore(opts.dataDir, opts.cipher)
  const host = opts.host ?? '127.0.0.1'
  let port = opts.port

  const app = new Hono()

  // ---- Safety: only our own pages may use the API --------------------------------------
  // Blocks other websites open in a browser from calling this server (it can spend API credit),
  // and blocks DNS-rebinding tricks by checking the Host header too.
  app.use('/api/*', async (c, next) => {
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`]
    const allowedOrigins = [...allowedHosts.map((h) => `http://${h}`), ...(opts.devOrigins ?? [])]
    const hostHeader = c.req.header('host') ?? ''
    const origin = c.req.header('origin')
    const devHost = (opts.devOrigins ?? []).some((o) => o.endsWith(`//${hostHeader}`))
    if (!allowedHosts.includes(hostHeader) && !devHost) return c.json({ error: 'Forbidden host' }, 403)
    if (origin && !allowedOrigins.includes(origin)) return c.json({ error: 'Forbidden origin' }, 403)
    await next()
  })

  // ---- Settings & keys -----------------------------------------------------------------
  const settingsView = async (): Promise<SettingsView> => {
    const savedKeys: Record<string, boolean> = {}
    for (const id of ['openrouter', 'claude', 'custom', 'lmstudio', 'strata', 'koboldcpp']) savedKeys[id] = await secrets.has(id)
    return { connection: settings.connection, savedKeys, secureStorage: secrets.secure }
  }

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.get('/api/settings', async (c) => c.json(await settingsView()))

  app.put('/api/settings/connection', async (c) => {
    const parsed = Connection.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid connection settings' }, 400)
    settings.setConnection(parsed.data)
    return c.json(await settingsView())
  })

  app.put('/api/keys/:presetId', async (c) => {
    const body = z.object({ key: z.string() }).safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'Missing key' }, 400)
    try {
      await secrets.set(c.req.param('presetId'), body.data.key)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
    return c.json(await settingsView())
  })

  app.delete('/api/keys/:presetId', async (c) => {
    secrets.delete(c.req.param('presetId'))
    return c.json(await settingsView())
  })

  // ---- App updates ---------------------------------------------------------------------
  const updates = opts.updates
  app.get('/api/update', (c) => c.json<UpdateStatus>(updates?.status() ?? { state: 'disabled' }))
  app.post('/api/update/check', async (c) => {
    await updates?.check()
    return c.json<UpdateStatus>(updates?.status() ?? { state: 'disabled' })
  })
  app.post('/api/update/download', (c) => {
    void updates?.download()
    return c.json<UpdateStatus>(updates?.status() ?? { state: 'disabled' })
  })
  app.post('/api/update/install', (c) => {
    updates?.install()
    return c.json({ ok: true })
  })

  // ---- Connection test -----------------------------------------------------------------
  const TestBody = z.object({
    connection: Connection.extend({ model: z.string().default('') }),
    /** A key typed in the form but not saved yet. */
    key: z.string().optional()
  })

  app.post('/api/connection/test', async (c) => {
    const body = TestBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json<TestResult>({ ok: false, message: 'Invalid request.' }, 400)
    const conn = body.data.connection
    const preset = findPreset(conn.presetId)
    const key = body.data.key?.trim() || (await secrets.get(conn.presetId))
    if (preset?.needsKey && !key) {
      return c.json<TestResult>({ ok: false, message: `${preset.label} needs an API key.` })
    }

    // Try the entered address, then (for local presets) the other common ones.
    const candidates = [conn.baseUrl, ...(preset?.probeUrls ?? []).filter((u) => u !== conn.baseUrl)]
    let lastError = ''
    for (const baseUrl of candidates) {
      const provider = createProvider({ ...conn, baseUrl }, key)
      try {
        const models = await provider.listModels()
        if (!models.length) {
          return c.json<TestResult>({
            ok: false,
            message: `${preset?.label ?? 'The server'} is running, but no models are available. Load or download a model first.`,
            models
          })
        }
        const model =
          models.find((m) => m.id === conn.model)?.id ??
          models.find((m) => m.id === preset?.defaultModel)?.id ??
          models[0].id
        const context = await provider.inspectContext(model)
        return c.json<TestResult>({
          ok: true,
          message: `Connected. ${models.length} model${models.length === 1 ? '' : 's'} available.`,
          models,
          model,
          context,
          resolvedBaseUrl: baseUrl !== conn.baseUrl ? baseUrl : undefined
        })
      } catch (err) {
        lastError = (err as Error).message
      }
    }
    return c.json<TestResult>({ ok: false, message: lastError || 'Could not connect.' })
  })

  // ---- Chat (streamed) -----------------------------------------------------------------
  app.post('/api/chat', async (c) => {
    const body = ChatRequest.safeParse(await c.req.json().catch(() => null))
    const conn = settings.connection
    return streamSSE(c, async (stream) => {
      const send = (ev: StreamEvent) => stream.writeSSE({ data: JSON.stringify(ev) })
      if (!body.success) return void (await send({ type: 'error', message: 'Invalid chat request.' }))
      if (!conn || !conn.model) {
        return void (await send({ type: 'error', message: 'No model is connected yet. Open Connect a Model first.' }))
      }
      const controller = new AbortController()
      stream.onAbort(() => controller.abort())
      const provider = createProvider(conn, await secrets.get(conn.presetId))
      for await (const ev of provider.chat(conn.model, {
        system: NARRATOR_SYSTEM,
        messages: body.data.messages,
        signal: controller.signal
      })) {
        if (controller.signal.aborted) break
        await send(ev)
      }
    })
  })

  // ---- The UI itself (production) ------------------------------------------------------
  if (opts.staticDir) {
    const root = normalize(opts.staticDir)
    app.get('*', async (c) => {
      const urlPath = decodeURIComponent(new URL(c.req.url).pathname)
      let file = normalize(join(root, urlPath))
      if (!file.startsWith(root + sep) && file !== root) return c.text('Not found', 404)
      if (urlPath === '/' || !extname(file)) file = join(root, 'index.html')
      try {
        const data = await readFile(file)
        return c.body(data, 200, {
          'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'Content-Security-Policy': CSP
        })
      } catch {
        return c.text('Not found', 404)
      }
    })
  }

  // ---- Listen ----------------------------------------------------------------------------
  const listener = getRequestListener(app.fetch)
  const server = createHttpServer(listener)
  const tries = opts.portFallback ? 20 : 1
  for (let i = 0; i < tries; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
          server.off('error', reject)
          resolve()
        })
      })
      return { port, close: () => server.close() }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || i === tries - 1) throw err
      port++
    }
  }
  throw new Error('Could not start the local server.')
}

/** Production pages may only load code and data from this server. */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'"

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg'
}
