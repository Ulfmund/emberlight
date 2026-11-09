import type { ChatMessage, Connection, SettingsView, StreamEvent, TestResult, UpdateStatus } from '@shared/types'

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}

export const api = {
  settings: () => fetch('/api/settings').then((r) => json<SettingsView>(r)),

  saveConnection: (c: Connection) =>
    fetch('/api/settings/connection', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c)
    }).then((r) => json<SettingsView>(r)),

  saveKey: (presetId: string, key: string) =>
    fetch(`/api/keys/${encodeURIComponent(presetId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    }).then((r) => json<SettingsView>(r)),

  deleteKey: (presetId: string) =>
    fetch(`/api/keys/${encodeURIComponent(presetId)}`, { method: 'DELETE' }).then((r) => json<SettingsView>(r)),

  updateStatus: () => fetch('/api/update').then((r) => json<UpdateStatus>(r)),
  downloadUpdate: () => fetch('/api/update/download', { method: 'POST' }).then((r) => json<UpdateStatus>(r)),
  installUpdate: () => fetch('/api/update/install', { method: 'POST' }).then((r) => json<{ ok: boolean }>(r)),

  testConnection: (connection: Connection, key?: string) =>
    fetch('/api/connection/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection, key })
    }).then((r) => json<TestResult>(r)),

  /** Streams the DM's response. Calls onEvent for every chunk; resolves when the stream ends. */
  async chat(messages: ChatMessage[], onEvent: (ev: StreamEvent) => void, signal: AbortSignal) {
    let res: Response
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      onEvent({ type: 'error', message: "Couldn't reach the app's local server." })
      return
    }
    if (!res.ok || !res.body) {
      onEvent({ type: 'error', message: `The local server answered ${res.status}.` })
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, sep)
          buf = buf.slice(sep + 2)
          const data = block
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n')
          if (data) {
            try {
              onEvent(JSON.parse(data) as StreamEvent)
            } catch {
              /* ignore malformed chunk */
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') onEvent({ type: 'error', message: 'The connection dropped mid-story.' })
    }
  }
}
