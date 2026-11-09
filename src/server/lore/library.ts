import { fromWorldInfo, LoreError, normalizeEntry, toWorldInfo, type Lorebook, type LorebookSummary } from '@shared/lore'
import { WORLDS } from '@shared/worlds'
import { newId, type GameDb, type LorebookRow } from '../store/db'

export const MAX_LORE_FILE = 16 * 1024 * 1024

/** The lorebook library: imported, written by hand, or shipped with a starter world. */
export class LoreLibrary {
  constructor(private db: GameDb) {
    // Starter worlds' lorebooks go in once; after that they're the player's to edit.
    for (const w of WORLDS) if (!db.getLorebook(w.lorebook.id)) db.saveLorebook(w.lorebook, true)
  }

  list(): LorebookSummary[] {
    return this.db.listLorebooks().map(summary)
  }

  get(id: string): Lorebook | null {
    const r = this.db.getLorebook(id)
    return r ? { id: r.id, name: r.name, description: r.description, entries: r.entries.map(normalizeEntry) } : null
  }

  create(name: string): Lorebook {
    const book: Lorebook = { id: newId('lore'), name: name.trim() || 'New lorebook', description: '', entries: [] }
    this.db.saveLorebook(book)
    return book
  }

  save(book: Lorebook): Lorebook {
    if (!this.db.getLorebook(book.id)) throw new LoreError('That lorebook no longer exists.')
    const clean = { ...book, name: book.name.trim() || 'Untitled lorebook', entries: book.entries.map(normalizeEntry) }
    this.db.saveLorebook(clean)
    return clean
  }

  import(bytes: Uint8Array, filename: string): Lorebook {
    if (bytes.length > MAX_LORE_FILE) throw new LoreError('This file is too large (over 16 MB).')
    let raw: unknown
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, ''))
    } catch {
      throw new LoreError("This file isn't a lorebook (lorebooks are .json files).")
    }
    const parsed = fromWorldInfo(raw, filename.replace(/\.json$/i, '') || 'Imported lorebook')
    if (!parsed.entries.length) throw new LoreError('This lorebook has no usable entries.')
    const book: Lorebook = { id: newId('lore'), ...parsed }
    this.db.saveLorebook(book)
    return book
  }

  export(id: string): { name: string; json: unknown } | null {
    const b = this.get(id)
    return b ? { name: b.name, json: toWorldInfo(b) } : null
  }

  delete(id: string) {
    this.db.deleteLorebook(id)
  }

  /** All enabled entries of the given books (books deleted since are skipped). */
  entriesFor(ids: string[]) {
    return ids.flatMap((id) => this.get(id)?.entries ?? [])
  }
}

function summary(r: LorebookRow): LorebookSummary {
  return { id: r.id, name: r.name, description: r.description, entries: r.entries.length, builtin: r.builtin, updatedAt: r.updated_at }
}
