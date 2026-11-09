import { createServer as createHttpServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
import { z } from 'zod'
import { Connection, type RemoteView, type SettingsView, type TestResult, type UpdateStatus } from '@shared/types'
import { findPreset } from '@shared/presets'
import { newRemoteKey, SettingsStore } from './store/settings'
import { accessGate, isRemote, lanAddresses, LINK_PORT, WIFI_PORT } from './remote'
import { SecretStore, type Cipher } from './store/secrets'
import { GameDb } from './store/db'
import { createProvider } from './ai/providers'
import { Campaigns } from './core/campaigns'
import { TurnEngine } from './core/turn'
import { registerGameRoutes } from './routes/game'
import { registerCardRoutes } from './routes/cards'
import { CardLibrary } from './cards/library'

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
  /** Listeners for other devices (Wi-Fi, tunnel link), started and stopped from the settings. */
  const extra: { wifi: { server: Server; port: number } | null; link: { server: Server; port: number } | null } = { wifi: null, link: null }
  const settings = new SettingsStore(opts.dataDir)
  const secrets = new SecretStore(opts.dataDir, opts.cipher)
  const host = opts.host ?? '127.0.0.1'
  let port = opts.port

  const app = new Hono()

  // ---- Safety: who may use the server ------------------------------------------------------
  // This computer's own app window, or another device holding the secret key (see remote.ts).
  const ports = { main: () => port, wifi: () => extra.wifi?.port ?? null, link: () => extra.link?.port ?? null }
  app.use('*', accessGate({ ports, remote: () => settings.remote, devOrigins: opts.devOrigins }))

  /**
   * Another device may pick a different model, but never send the saved API key somewhere new:
   * only a preset's own addresses (or the one already saved) are allowed from there.
   */
  const remoteMayUse = (c: Parameters<typeof isRemote>[0], conn: Connection) => {
    if (!isRemote(c, ports)) return true
    const preset = findPreset(conn.presetId)
    const allowed = [preset?.baseUrl, ...(preset?.probeUrls ?? []), settings.connection?.presetId === conn.presetId ? settings.connection?.baseUrl : undefined]
    return allowed.includes(conn.baseUrl)
  }

  // ---- Settings & keys -----------------------------------------------------------------
  const settingsView = async (c?: Parameters<typeof isRemote>[0]): Promise<SettingsView> => {
    const savedKeys: Record<string, boolean> = {}
    for (const id of ['openrouter', 'claude', 'custom', 'lmstudio', 'strata', 'koboldcpp']) savedKeys[id] = await secrets.has(id)
    return { connection: settings.connection, savedKeys, secureStorage: secrets.secure, remote: c ? isRemote(c, ports) : false }
  }

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.get('/api/settings', async (c) => c.json(await settingsView(c)))

  app.put('/api/settings/connection', async (c) => {
    const parsed = Connection.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid connection settings' }, 400)
    if (!remoteMayUse(c, parsed.data)) return c.json({ error: 'A new server address can only be set on the computer running Emberlight.' }, 403)
    settings.setConnection(parsed.data)
    return c.json(await settingsView(c))
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
    if (!remoteMayUse(c, conn)) return c.json<TestResult>({ ok: false, message: 'A new server address can only be set on the computer running Emberlight.' }, 403)
    const remote = isRemote(c, ports)
    const key = (remote ? '' : body.data.key?.trim()) || (await secrets.get(conn.presetId))
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

  // ---- Playing from other devices (this computer only: the gate refuses these remotely) ----
  const remoteView = (): RemoteView => {
    const r = settings.remote
    const q = `?key=${encodeURIComponent(r.key)}`
    return {
      wifi: { on: r.wifi, running: Boolean(extra.wifi), urls: extra.wifi ? lanAddresses().map((ip) => `http://${ip}:${extra.wifi!.port}/${q}`) : [] },
      link: { on: r.link, running: Boolean(extra.link), port: extra.link?.port ?? null, path: `/${q}` },
      error: remoteError
    }
  }
  let remoteError: string | undefined
  const applyRemote = async () => {
    remoteError = undefined
    const r = settings.remote
    for (const way of ['wifi', 'link'] as const) {
      if (r[way] && !extra[way]) {
        try {
          extra[way] = await listen(way === 'wifi' ? '0.0.0.0' : '127.0.0.1', way === 'wifi' ? WIFI_PORT : LINK_PORT, 10)
        } catch (err) {
          remoteError = `Couldn't open the ${way === 'wifi' ? 'Wi-Fi' : 'link'} connection: ${(err as Error).message}`
        }
      } else if (!r[way] && extra[way]) {
        extra[way]!.server.close()
        // Drop paired devices' open streams too.
        extra[way]!.server.closeAllConnections?.()
        extra[way] = null
      }
    }
  }
  app.get('/api/remote', (c) => c.json(remoteView()))
  app.put('/api/remote', async (c) => {
    const b = z.object({ wifi: z.boolean().optional(), link: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null))
    if (!b.success) return c.json({ error: 'Invalid settings' }, 400)
    settings.setRemote(b.data)
    await applyRemote()
    return c.json(remoteView())
  })
  app.post('/api/remote/new-key', async (c) => {
    // A new key unpairs every device: they must scan the new code.
    settings.setRemote({ key: newRemoteKey() })
    for (const way of ['wifi', 'link'] as const) extra[way]?.server.closeAllConnections?.()
    return c.json(remoteView())
  })

  // ---- The game (campaigns, turns, saves) -----------------------------------------------
  const db = new GameDb(opts.dataDir)
  const campaigns = new Campaigns(db)
  const turns = new TurnEngine(campaigns, () => settings.connection, (id) => secrets.get(id))
  const library = new CardLibrary(db)
  registerCardRoutes(app, library)
  registerGameRoutes(app, campaigns, turns, library)

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
  /** Opens a listener on the first free port from `from`. */
  async function listen(on: string, from: number, tries: number): Promise<{ server: Server; port: number }> {
    const srv = createHttpServer(listener)
    for (let i = 0, p = from; i < tries; i++, p++) {
      try {
        await new Promise<void>((resolve, reject) => {
          srv.once('error', reject)
          srv.listen(p, on, () => {
            srv.off('error', reject)
            resolve()
          })
        })
        return { server: srv, port: p }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || i === tries - 1) throw err
      }
    }
    throw new Error('No free port.')
  }

  const main = await listen(host, port, opts.portFallback ? 20 : 1).catch((err) => {
    throw err instanceof Error && err.message === 'No free port.' ? new Error('Could not start the local server.') : err
  })
  port = main.port
  await applyRemote()
  return {
    port,
    close: () => {
      main.server.close()
      extra.wifi?.server.close()
      extra.link?.server.close()
      db.close()
    }
  }
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
