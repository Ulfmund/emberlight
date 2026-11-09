import { timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import type { IncomingMessage } from 'node:http'
import type { Context, Next } from 'hono'
import type { RemoteSettings } from './store/settings'

/**
 * Playing from another device (docs/spec/08-ui-ux.md#play-on-phone).
 *
 * The desktop app talks to the server on 127.0.0.1. Other devices come in through one of two
 * extra listeners: the Wi-Fi one (all network interfaces) and the link one (loopback only, for
 * a tunnel such as Cloudflare's to point at). Everything that arrives on those, or carries a
 * proxy's headers, is "remote": it needs the secret key, and it can't touch API keys, change
 * where the app sends them, or install updates.
 */

export const COOKIE = 'ember_key'
export const WIFI_PORT = 41740
export const LINK_PORT = 41750

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const PROXY_HEADERS = ['cf-ray', 'cf-connecting-ip', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip']

type Ports = { main: () => number; wifi: () => number | null; link: () => number | null }

const incomingOf = (c: Context) => (c.env as { incoming?: IncomingMessage } | undefined)?.incoming

/** Whether a request comes from another device rather than this computer's own app window. */
export function isRemote(c: Context, ports: Ports): boolean {
  const incoming = incomingOf(c)
  if (!incoming) return true // unknown: assume the worst
  if (incoming.socket.localPort !== ports.main()) return true
  if (!LOOPBACK.has(incoming.socket.remoteAddress ?? '')) return true
  return PROXY_HEADERS.some((h) => c.req.header(h) !== undefined)
}

/** Which way a remote request came in, to check that way is switched on. */
function channel(c: Context, ports: Ports): 'wifi' | 'link' {
  const local = incomingOf(c)?.socket.localPort
  return local === ports.wifi() ? 'wifi' : 'link'
}

const sameKey = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function cookieKey(c: Context): string | undefined {
  const raw = c.req.header('cookie') ?? ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return decodeURIComponent(v.join('='))
  }
  return undefined
}

const isHttps = (c: Context) => c.req.header('x-forwarded-proto') === 'https' || (c.req.header('cf-visitor') ?? '').includes('https')

/** Remote requests that are never allowed, whatever key they carry. */
function forbiddenRemotely(path: string): boolean {
  return (
    path.startsWith('/api/keys') ||
    path.startsWith('/api/remote') ||
    path.startsWith('/api/images/settings') ||
    path.startsWith('/api/update/') // checking, downloading and installing
  )
}

const NOT_PAIRED = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Emberlight</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0809;color:#e8d5a8;font:16px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box;text-align:center}h1{font-weight:600;letter-spacing:.08em;color:#f0c063}p{color:#b9a98a;max-width:28rem}</style></head>
<body><div><h1>EMBERLIGHT</h1><p>This device isn't connected yet. On the computer running Emberlight, open <b>Play on Phone</b> and scan the code, or open the link it shows.</p></div></body></html>`

/**
 * The gate every request passes. Local requests get today's checks (our own pages only).
 * Remote ones need the key: `?key=…` once (it becomes a cookie), then the cookie.
 */
export function accessGate(opts: { ports: Ports; remote: () => RemoteSettings; devOrigins?: string[] }) {
  return async (c: Context, next: Next) => {
    const url = new URL(c.req.url)
    const path = url.pathname
    const hostHeader = c.req.header('host') ?? ''
    const origin = c.req.header('origin')

    if (!isRemote(c, opts.ports)) {
      if (!path.startsWith('/api/')) return next()
      const port = opts.ports.main()
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`]
      const allowedOrigins = [...allowedHosts.map((h) => `http://${h}`), ...(opts.devOrigins ?? [])]
      const devHost = (opts.devOrigins ?? []).some((o) => o.endsWith(`//${hostHeader}`))
      // Blocks other websites open in a browser from calling this server (it can spend API
      // credit), and DNS-rebinding tricks by checking the Host header too.
      if (!allowedHosts.includes(hostHeader) && !devHost) return c.json({ error: 'Forbidden host' }, 403)
      if (origin && !allowedOrigins.includes(origin)) return c.json({ error: 'Forbidden origin' }, 403)
      return next()
    }

    const settings = opts.remote()
    const way = channel(c, opts.ports)
    if (!settings[way]) return c.text('Playing from other devices is switched off.', 403)
    // The home-screen icon and app manifest hold nothing private, and phones fetch them without the cookie.
    if (c.req.method === 'GET' && (path === '/manifest.webmanifest' || /^\/icons\/[\w-]+\.png$/.test(path))) return next()

    // Pairing: the link or QR code carries the key once; from then on it's a cookie.
    const given = url.searchParams.get('key')
    if (given !== null && c.req.method === 'GET' && !path.startsWith('/api/')) {
      if (!sameKey(given, settings.key)) return c.html(NOT_PAIRED, 401)
      url.searchParams.delete('key')
      const secure = isHttps(c) ? '; Secure' : ''
      c.header('Set-Cookie', `${COOKIE}=${encodeURIComponent(settings.key)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 60}${secure}`)
      c.header('Cache-Control', 'no-store')
      return c.redirect(`${path}${url.search}`, 302)
    }

    const key = cookieKey(c)
    if (!key || !sameKey(key, settings.key)) {
      return path.startsWith('/api/') ? c.json({ error: 'This device is not connected. Scan the code on the computer again.' }, 401) : c.html(NOT_PAIRED, 401)
    }
    // Same-origin only: another site open on the phone can't use this.
    if (origin) {
      try {
        if (new URL(origin).host !== hostHeader) return c.json({ error: 'Forbidden origin' }, 403)
      } catch {
        return c.json({ error: 'Forbidden origin' }, 403)
      }
    }
    if (forbiddenRemotely(path)) return c.json({ error: 'That can only be done on the computer running Emberlight.' }, 403)
    return next()
  }
}

/** Wi-Fi addresses of this computer, likeliest first (home networks). */
export function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address)
  }
  const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : ip.startsWith('169.254.') ? 9 : 5)
  return out.sort((a, b) => rank(a) - rank(b))
}
