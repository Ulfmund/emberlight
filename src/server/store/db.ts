import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, copyFileSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { CampaignSettings, CharacterBuild, GameEvent } from '@shared/rules'

/**
 * The save file: one SQLite database in the app's user-data folder.
 * Built on Node's own SQLite, so there's nothing native to install.
 */

export type MessageMeta = {
  /** Sent to the model but not shown (the "begin the adventure" nudge, roll responses). */
  hidden?: boolean
  kind?: 'opening' | 'action' | 'roll_response' | 'narration'
  error?: string
  notice?: string
  /** A roll the DM asked for at the end of this narration (DM-initiated check). */
  requestCheck?: { skill: string; difficulty: string; reason: string; hidden: boolean }
  /** Which DM message this roll answers. */
  answers?: string
  /** Facts the Scribe recorded for this narration (shown in the change log). */
  scribed?: boolean
}

export type MessageRow = {
  id: string
  campaign_id: string
  parent_id: string | null
  role: 'user' | 'assistant'
  content: string
  thinking: string
  meta: MessageMeta
  created_at: number
}

export type CampaignRow = {
  id: string
  name: string
  created_at: number
  updated_at: number
  head_id: string | null
  settings: CampaignSettings
  build: CharacterBuild
}

export type EventRow = {
  id: number
  campaign_id: string
  message_id: string
  group_id: string
  event: GameEvent
  source: 'engine' | 'ai' | 'player'
  superseded: boolean
  created_at: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  head_id TEXT,
  settings TEXT NOT NULL,
  build TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  parent_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  thinking TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_campaign ON messages(campaign_id);
CREATE INDEX IF NOT EXISTS messages_parent ON messages(parent_id);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  source TEXT NOT NULL,
  superseded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_campaign ON events(campaign_id);
CREATE TABLE IF NOT EXISTS saves (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export class GameDb {
  private db: DatabaseSync

  constructor(private dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
    const file = join(dataDir, 'emberlight.sqlite')
    this.backup(file)
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    this.db.exec(SCHEMA)
    this.db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')").run()
  }

  /** Keeps one backup per day for the last 7 days (docs/spec/05-game-state-and-saves.md). */
  private backup(file: string) {
    if (!existsSync(file)) return
    const dir = join(this.dataDir, 'backups')
    mkdirSync(dir, { recursive: true })
    const today = new Date().toISOString().slice(0, 10)
    const target = join(dir, `emberlight-${today}.sqlite`)
    try {
      if (!existsSync(target)) copyFileSync(file, target)
      const old = readdirSync(dir)
        .filter((f) => f.startsWith('emberlight-'))
        .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .slice(7)
      for (const o of old) unlinkSync(join(dir, o.f))
    } catch {
      /* a failed backup must never stop the game from starting */
    }
  }

  close() {
    this.db.close()
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const r = fn()
      this.db.exec('COMMIT')
      return r
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  // ---- campaigns ----------------------------------------------------------------------

  createCampaign(c: Omit<CampaignRow, 'created_at' | 'updated_at'>) {
    const now = Date.now()
    this.db
      .prepare('INSERT INTO campaigns (id, name, created_at, updated_at, head_id, settings, build) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(c.id, c.name, now, now, c.head_id, JSON.stringify(c.settings), JSON.stringify(c.build))
  }

  getCampaign(id: string): CampaignRow | null {
    const r = this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return r ? toCampaign(r) : null
  }

  listCampaigns(): CampaignRow[] {
    return (this.db.prepare('SELECT * FROM campaigns ORDER BY updated_at DESC').all() as Record<string, unknown>[]).map(toCampaign)
  }

  setHead(id: string, headId: string | null) {
    this.db.prepare('UPDATE campaigns SET head_id = ?, updated_at = ? WHERE id = ?').run(headId, Date.now(), id)
  }

  updateCampaign(id: string, patch: Partial<Pick<CampaignRow, 'name' | 'settings' | 'build'>>) {
    const c = this.getCampaign(id)
    if (!c) return
    this.db
      .prepare('UPDATE campaigns SET name = ?, settings = ?, build = ?, updated_at = ? WHERE id = ?')
      .run(patch.name ?? c.name, JSON.stringify(patch.settings ?? c.settings), JSON.stringify(patch.build ?? c.build), Date.now(), id)
  }

  deleteCampaign(id: string) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM events WHERE campaign_id = ?').run(id)
      this.db.prepare('DELETE FROM messages WHERE campaign_id = ?').run(id)
      this.db.prepare('DELETE FROM saves WHERE campaign_id = ?').run(id)
      this.db.prepare('DELETE FROM campaigns WHERE id = ?').run(id)
    })
  }

  // ---- messages -----------------------------------------------------------------------

  addMessage(m: Omit<MessageRow, 'created_at'> & { created_at?: number }): MessageRow {
    const row: MessageRow = { ...m, created_at: m.created_at ?? Date.now() }
    this.db
      .prepare('INSERT INTO messages (id, campaign_id, parent_id, role, content, thinking, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(row.id, row.campaign_id, row.parent_id, row.role, row.content, row.thinking, JSON.stringify(row.meta), row.created_at)
    return row
  }

  updateMessage(id: string, patch: Partial<Pick<MessageRow, 'content' | 'thinking' | 'meta'>>) {
    const m = this.getMessage(id)
    if (!m) return
    this.db
      .prepare('UPDATE messages SET content = ?, thinking = ?, meta = ? WHERE id = ?')
      .run(patch.content ?? m.content, patch.thinking ?? m.thinking, JSON.stringify(patch.meta ?? m.meta), id)
  }

  getMessage(id: string): MessageRow | null {
    const r = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return r ? toMessage(r) : null
  }

  messagesFor(campaignId: string): MessageRow[] {
    return (
      this.db.prepare('SELECT * FROM messages WHERE campaign_id = ? ORDER BY created_at, rowid').all(campaignId) as Record<string, unknown>[]
    ).map(toMessage)
  }

  // ---- events -------------------------------------------------------------------------

  addEvents(campaignId: string, messageId: string, groupId: string, source: EventRow['source'], events: GameEvent[]) {
    const stmt = this.db.prepare(
      'INSERT INTO events (campaign_id, message_id, group_id, type, payload, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    const now = Date.now()
    for (const ev of events) stmt.run(campaignId, messageId, groupId, ev.type, JSON.stringify(ev), source, now)
  }

  eventsFor(campaignId: string): EventRow[] {
    return (
      this.db.prepare('SELECT * FROM events WHERE campaign_id = ? ORDER BY id').all(campaignId) as Record<string, unknown>[]
    ).map((r) => ({
      id: Number(r.id),
      campaign_id: String(r.campaign_id),
      message_id: String(r.message_id),
      group_id: String(r.group_id),
      event: JSON.parse(String(r.payload)) as GameEvent,
      source: String(r.source) as EventRow['source'],
      superseded: Number(r.superseded) === 1,
      created_at: Number(r.created_at)
    }))
  }

  supersedeGroup(groupId: string) {
    this.db.prepare('UPDATE events SET superseded = 1 WHERE group_id = ?').run(groupId)
  }

  // ---- save slots ---------------------------------------------------------------------

  addSave(campaignId: string, name: string, messageId: string) {
    const id = newId('save')
    this.db.prepare('INSERT INTO saves (id, campaign_id, name, message_id, created_at) VALUES (?, ?, ?, ?, ?)').run(id, campaignId, name, messageId, Date.now())
    return id
  }

  savesFor(campaignId: string) {
    return this.db.prepare('SELECT * FROM saves WHERE campaign_id = ? ORDER BY created_at DESC').all(campaignId) as {
      id: string
      name: string
      message_id: string
      created_at: number
    }[]
  }

  deleteSave(id: string) {
    this.db.prepare('DELETE FROM saves WHERE id = ?').run(id)
  }
}

function toCampaign(r: Record<string, unknown>): CampaignRow {
  return {
    id: String(r.id),
    name: String(r.name),
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    head_id: r.head_id == null ? null : String(r.head_id),
    settings: JSON.parse(String(r.settings)),
    build: JSON.parse(String(r.build))
  }
}

function toMessage(r: Record<string, unknown>): MessageRow {
  return {
    id: String(r.id),
    campaign_id: String(r.campaign_id),
    parent_id: r.parent_id == null ? null : String(r.parent_id),
    role: String(r.role) as MessageRow['role'],
    content: String(r.content),
    thinking: String(r.thinking),
    meta: JSON.parse(String(r.meta)),
    created_at: Number(r.created_at)
  }
}
