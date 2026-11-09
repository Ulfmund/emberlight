import type { Connection, RemoteView, SettingsView, TestResult, UpdateStatus } from '@shared/types'
import type { CampaignSettings, CharacterBuild, Attr, CompanionRole, HomeKind, SkillId } from '@shared/rules'
import type { CampaignSummary, CampaignView, TurnEvent } from '@shared/view'
import type { CardDetail, CardSummary } from '@shared/cards'
import type { MemoryEvent } from '@shared/memory'
import type { Lorebook, LorebookSummary } from '@shared/lore'
import type { ImageSettings } from '@shared/images'
import type { EmbeddingSettings } from '@shared/embeddings'

export type CreateOptions = { playerCard?: string; companions?: string[]; useGreeting?: boolean; lorebooks?: string[]; world?: string }

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}

/**
 * The head of the story on this screen, sent with every change: the server refuses to move a
 * story the screen hasn't caught up with (sync.ts).
 */
let shownHead: string | null | undefined
export const showingHead = (head: string | null | undefined) => (shownHead = head)
const headers = (): Record<string, string> => ({ 'Content-Type': 'application/json', ...(shownHead !== undefined ? { 'X-Emberlight-Head': shownHead ?? '' } : {}) })

const post = (url: string, body?: unknown) => fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body ?? {}) })
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
  stamp: (id: string) => fetch(`/api/campaigns/${id}/stamp`).then((r) => json<{ stamp: string; answering: boolean }>(r)),
  createCampaign: (build: CharacterBuild, settings: CampaignSettings, opts: CreateOptions = {}) =>
    post('/api/campaigns', { build, settings, ...opts }).then((r) => json<{ id: string }>(r)),

  /** After a death: a new character (or the dead one's child) takes up the tale. */
  successor: (id: string, build: CharacterBuild, childId?: string) => post(`/api/campaigns/${id}/successor`, { build, childId }).then((r) => json<CampaignView>(r)),

  // ---- renaming
  renamePreview: (id: string, from: string, to: string) =>
    post(`/api/campaigns/${id}/rename/preview`, { from, to }).then((r) => json<{ messages: { id: string; role: 'user' | 'assistant'; before: string; after: string; count: number }[]; memory: number; total: number }>(r)),
  rename: (id: string, body: { from: string; to: string; mode: 'retcon' | 'story'; target: { kind: 'player' } | { kind: 'entity'; id: string }; skip?: string[] }) =>
    post(`/api/campaigns/${id}/rename`, body).then((r) => json<CampaignView>(r)),

  // ---- lorebooks
  lorebooks: () => fetch('/api/lorebooks').then((r) => json<LorebookSummary[]>(r)),
  lorebook: (id: string) => fetch(`/api/lorebooks/${encodeURIComponent(id)}`).then((r) => json<Lorebook>(r)),
  createLorebook: (name: string) => post('/api/lorebooks', { name }).then((r) => json<Lorebook>(r)),
  saveLorebook: (b: Lorebook) => put(`/api/lorebooks/${encodeURIComponent(b.id)}`, b).then((r) => json<Lorebook>(r)),
  importLorebook: (file: File) =>
    fetch('/api/lorebooks/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
      body: file
    }).then((r) => json<Lorebook>(r)),
  deleteLorebook: (id: string) => fetch(`/api/lorebooks/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<LorebookSummary[]>(r)),
  lorebookExportUrl: (id: string) => `/api/lorebooks/${encodeURIComponent(id)}/export`,
  campaignExportUrl: (id: string) => `/api/campaigns/${encodeURIComponent(id)}/export`,
  // ---- pictures
  uploadMedia: (id: string, file: File, kind: 'portrait' | 'story') =>
    fetch(`/api/campaigns/${encodeURIComponent(id)}/media?kind=${kind}`, { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } }).then((r) => json<{ id: string }>(r)),
  setPortrait: (id: string, media: string | null, describe = false) =>
    post(`/api/campaigns/${encodeURIComponent(id)}/portrait`, { media, describe }).then((r) => json<{ view: CampaignView; description?: string; note?: string }>(r)),
  setAppearance: (id: string, appearance: string) => post(`/api/campaigns/${encodeURIComponent(id)}/appearance`, { appearance }).then((r) => json<CampaignView>(r)),
  // ---- companions
  partyJoin: (id: string, name: string, role?: CompanionRole) => post(`/api/campaigns/${encodeURIComponent(id)}/party`, { join: { name, ...(role ? { role } : {}) } }).then((r) => json<CampaignView>(r)),
  partyLeave: (id: string, companion: string) => post(`/api/campaigns/${encodeURIComponent(id)}/party`, { leave: companion }).then((r) => json<CampaignView>(r)),
  family: (id: string, act: { marry: string } | { child: { name: string; sex: 'male' | 'female' } }) =>
    post(`/api/campaigns/${encodeURIComponent(id)}/family`, act).then((r) => json<CampaignView>(r)),
  life: (id: string, act: { home: HomeKind } | { leaveHome: true } | { job: { title: string; skill: SkillId; board: boolean } } | { quitJob: true }) =>
    post(`/api/campaigns/${encodeURIComponent(id)}/life`, act).then((r) => json<CampaignView>(r)),
  partyRole: (id: string, companion: string, role: CompanionRole) => post(`/api/campaigns/${encodeURIComponent(id)}/party`, { role: { id: companion, role } }).then((r) => json<CampaignView>(r)),
  entityImage: (id: string, entity: string, media: string | null) => post(`/api/campaigns/${encodeURIComponent(id)}/entity-image`, { entity, media }).then((r) => json<CampaignView>(r)),
  imagePrompt: (id: string, entity?: string) =>
    fetch(`/api/campaigns/${encodeURIComponent(id)}/images/prompt${entity ? `?entity=${encodeURIComponent(entity)}` : ''}`).then((r) => json<{ prompt: string; ready: boolean }>(r)),
  generateImage: (id: string, prompt: string, entity?: string, signal?: AbortSignal) =>
    fetch(`/api/campaigns/${encodeURIComponent(id)}/images/generate`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, entity }) }).then((r) => json<{ media: string; view: CampaignView }>(r)),
  imageSettings: () => fetch('/api/images/settings').then((r) => json<ImageSettings & { hasKey: boolean }>(r)),
  embeddingSettings: () => fetch('/api/embeddings/settings').then((r) => json<EmbeddingSettings & { hasKey: boolean; ready: boolean }>(r)),
  saveEmbeddingSettings: (s: EmbeddingSettings) => put('/api/embeddings/settings', s).then((r) => json<EmbeddingSettings & { hasKey: boolean; ready: boolean }>(r)),
  testEmbeddings: () => post('/api/embeddings/settings/test', {}).then((r) => json<{ dims: number; alike: number; unlike: number }>(r)),
  saveImageSettings: (s: ImageSettings) => put('/api/images/settings', s).then((r) => json<ImageSettings & { hasKey: boolean }>(r)),
  /** A test picture from the generator, as an object URL. */
  testImages: async () => {
    const r = await fetch('/api/images/settings/test', { method: 'POST' })
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${r.status})`)
    return URL.createObjectURL(await r.blob())
  },
  cardExportUrl: (id: string) => `/api/cards/${encodeURIComponent(id)}/export`,
  characterCardUrl: (id: string) => `/api/campaigns/${encodeURIComponent(id)}/character-card`,
  importCampaign: (file: File) =>
    fetch('/api/campaigns/import', { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } }).then((r) => json<{ id: string }>(r)),
  suggest: (id: string, signal?: AbortSignal) =>
    fetch(`/api/campaigns/${encodeURIComponent(id)}/suggest`, { method: 'POST', signal }).then((r) => json<{ suggestions: { kind: 'bold' | 'careful' | 'say'; text: string }[] }>(r)),
  ghost: (id: string, text: string, signal?: AbortSignal) =>
    fetch(`/api/campaigns/${encodeURIComponent(id)}/ghost`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).then((r) => json<{ continuation: string }>(r)),
  setCampaignLorebooks: (id: string, ids: string[]) => put(`/api/campaigns/${id}/lorebooks`, { ids }).then((r) => json<CampaignView>(r)),

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
  inventory: (id: string, action: 'equip' | 'unequip' | 'use' | 'drop', name: string, slot?: string) =>
    post(`/api/campaigns/${id}/inventory`, { action, name, slot }).then((r) => json<CampaignView>(r)),
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
        headers: headers(),
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
