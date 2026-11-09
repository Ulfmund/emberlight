import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { Connection } from '@shared/types'

/**
 * App settings, saved as JSON in the app's user-data folder.
 * (Campaign data moves to SQLite in Milestone 1; settings stay a small JSON file.)
 */
type SettingsFile = { version: 1; connection: Connection | null }

export class SettingsStore {
  private file: string
  private data: SettingsFile

  constructor(dataDir: string) {
    this.file = join(dataDir, 'settings.json')
    this.data = this.load()
  }

  private load(): SettingsFile {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'))
      const parsed = Connection.safeParse(raw.connection)
      return { version: 1, connection: parsed.success ? parsed.data : null }
    } catch {
      return { version: 1, connection: null }
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
}
