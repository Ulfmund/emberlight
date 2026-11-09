import type { Connection, RemoteView, SettingsView, TestResult, UpdateStatus } from '@shared/types'
import type { CampaignSettings, CharacterBuild, Attr } from '@shared/rules'
import type { CampaignSummary, CampaignView, TurnEvent } from '@shared/view'
import type { CardDetail, CardSummary } from '@shared/cards'
import type { MemoryEvent } from '@shared/memory'

export type CreateOptions = { playerCard?: string; companions?: string[]; useGreeting?: boolean }

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
const put = (url: string, body: unknown) =>
  fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const api = {
  // ---- settings & connection
  settings: () => fetch('/api/settings').then((r) => json<SettingsView>(r)),
  saveConnection: (c: Connection) => put('/api/settings/connection', c).then((r) => json<SettingsView>(r)),
  saveKey: (presetId: string, key: string) => put(`/api/keys/${encodeURIComponent(presetId)}`, { key }).then((r) => json<SettingsView>(r)),
  deleteKey: (presetId: string) =>
    fetch(`/api/keys/${encodeURIComponent(presetId)}`, { method: 'DELETE' }).then((r) => json<SettingsView>(r)),
  testConnection: (connection: Connection, key?: string) =>
    post('/api/connection/test', { connection, key }).then((r) => json<TestResult>(r)),

  // ---- play on phone (this computer only)
  remote: () => fetch('/api/remote').then((r) => json<RemoteView>(r)),
  setRemote: (patch: { wifi?: boolean; link?: boolean }) => put('/api/remote', patch).then((r) => json<RemoteView>(r)),
  newRemoteKey: () => post('/api/remote/new-key').then((r) => json<RemoteView>(r)),

  // ---- updates
  updateStatus: () => fetch('/api/update').then((r) => json<UpdateStatus>(r)),
  downloadUpdate: () => post('/api/update/download').then((r) => json<UpdateStatus>(r)),
  installUpdate: () => post('/api/update/install').then((r) => json<{ ok: boolean }>(r)),

  // ---- campaigns
  campaigns: () => fetch('/api/campaigns').then((r) => json<CampaignSummary[]>(r)),
  campaign: (id: string) => fetch(`/api/campaigns/${id}`).then((r) => json<CampaignView>(r)),
  createCampaign: (build: CharacterBuild, settings: CampaignSettings, opts: CreateOptions = {}) =>
    post('/api/campaigns', { build, settings, ...opts }).then((r) => json<{ id: string }>(r)),

  // ---- character library
  cards: () => fetch('/api/cards').then((r) => json<CardSummary[]>(r)),
  card: (id: string) => fetch(`/api/cards/${encodeURIComponent(id)}`).then((r) => json<CardDetail>(r)),
  importCard: (file: File) =>
    fetch('/api/cards/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
      body: file
    }).then((r) => json<{ card: CardSummary; existing: boolean }>(r)),
  deleteCard: (id: string) => fetch(`/api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<CardSummary[]>(r)),
  deleteCampaign: (id: string) => fetch(`/api/campaigns/${id}`, { method: 'DELETE' }).then((r) => json<{ ok: boolean }>(r)),
  updateCampaignSettings: (id: string, s: CampaignSettings) => put(`/api/campaigns/${id}/settings`, s).then((r) => json<CampaignView>(r)),
  swipe: (id: string, messageId: string) => post(`/api/campaigns/${id}/swipe`, { messageId }).then((r) => json<CampaignView>(r)),
  rewind: (id: string, messageId: string) => post(`/api/campaigns/${id}/rewind`, { messageId }).then((r) => json<CampaignView>(r)),
  spend: (id: string, attr: Attr) => post(`/api/campaigns/${id}/spend`, { attr }).then((r) => json<CampaignView>(r)),
  journal: (id: string, edit: MemoryEvent) => post(`/api/campaigns/${id}/journal`, { edit }).then((r) => json<CampaignView>(r)),
  addSave: (id: string, name: string) => post(`/api/campaigns/${id}/saves`, { name }).then((r) => json<CampaignView>(r)),
  loadSave: (id: string, saveId: string) => post(`/api/campaigns/${id}/saves/${saveId}/load`).then((r) => json<CampaignView>(r)),
  deleteSave: (id: string, saveId: string) =>
    fetch(`/api/campaigns/${id}/saves/${saveId}`, { method: 'DELETE' }).then((r) => json<CampaignView>(r)),

  /** Runs a streamed turn endpoint, calling onEvent for every step. */
  async stream(url: string, body: unknown, onEvent: (ev: TurnEvent) => void, signal: AbortSignal) {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal
      })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') onEvent({ type: 'error', message: "Couldn't reach the app's local server." })
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
              onEvent(JSON.parse(data) as TurnEvent)
            } catch {
              /* ignore a malformed chunk */
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') onEvent({ type: 'error', message: 'The connection dropped mid-story.' })
    }
  }
}
