import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { Connection } from '@shared/types'

/** Playing from other devices: a phone on the same Wi-Fi, or through a tunnel link. */
export type RemoteSettings = {
  /** The secret every other device must present. Resetting it unpairs them all. */
  key: string
  wifi: boolean
  link: boolean
}

/** App settings, saved as JSON in the app's user-data folder. */
type SettingsFile = { version: 1; connection: Connection | null; remote: RemoteSettings }

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
      }
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
}
