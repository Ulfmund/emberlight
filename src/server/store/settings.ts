import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { Connection } from '@shared/types'
import { normalizeImageSettings, type ImageSettings } from '@shared/images'
import { normalizeEmbeddingSettings, type EmbeddingSettings } from '@shared/embeddings'

/** Playing from other devices: a phone on the same Wi-Fi, or through a tunnel link. */
export type RemoteSettings = {
  /** The secret every other device must present. Resetting it unpairs them all. */
  key: string
  wifi: boolean
  link: boolean
}

/** App settings, saved as JSON in the app's user-data folder. */
type SettingsFile = { version: 1; connection: Connection | null; remote: RemoteSettings; images: ImageSettings; embeddings: EmbeddingSettings }

export const newRemoteKey = () => randomBytes(24).toString('base64url')

export class SettingsStore {
  private file: string
  private data: SettingsFile

  constructor(dataDir: string) {
    this.file = join(dataDir, 'settings.json')
    this.data = this.load()
    // A key made just now must be kept, or every restart would unpair the phones.
    if (this.fresh) this.save()
  }

  private fresh = false

  private load(): SettingsFile {
    let raw: Record<string, unknown> = {}
    try {
      raw = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      /* first run */
    }
    const parsed = Connection.safeParse(raw.connection)
    const r = (raw.remote ?? {}) as Partial<RemoteSettings>
    this.fresh = !(typeof r.key === 'string' && r.key.length >= 24)
    return {
      version: 1,
      connection: parsed.success ? parsed.data : null,
      remote: {
        key: typeof r.key === 'string' && r.key.length >= 24 ? r.key : newRemoteKey(),
        wifi: r.wifi === true,
        link: r.link === true
      },
      images: normalizeImageSettings(raw.images),
      embeddings: normalizeEmbeddingSettings(raw.embeddings)
    }
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true })
    // Write to a temp file then rename, so a crash mid-write can't corrupt settings.
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file)
  }

  get connection(): Connection | null {
    return this.data.connection
  }

  setConnection(c: Connection) {
    this.data.connection = c
    this.save()
  }

  get remote(): RemoteSettings {
    return this.data.remote
  }

  setRemote(patch: Partial<RemoteSettings>) {
    this.data.remote = { ...this.data.remote, ...patch }
    this.save()
  }

  get images(): ImageSettings {
    return this.data.images
  }

  setImages(s: ImageSettings) {
    this.data.images = s
    this.save()
  }

  get embeddings(): EmbeddingSettings {
    return this.data.embeddings
  }

  setEmbeddings(s: EmbeddingSettings) {
    this.data.embeddings = s
    this.save()
  }
}
