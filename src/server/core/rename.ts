import { newId } from '../store/db'
import { projectMemory, type MemoryEvent } from '@shared/memory'
import type { Campaigns } from './campaigns'

/**
 * Renaming someone (docs/spec/03-characters-and-cards.md#editing-characters-and-updating-the-story).
 * A retcon ("they were always called this") rewrites the name everywhere it was written; an
 * in-story rename ("they've taken a new name") keeps the old one and tells the DM.
 */

export type RenameTarget = { kind: 'player' } | { kind: 'entity'; id: string }
export type RenameMode = 'retcon' | 'story'

export type RenamePreview = {
  messages: { id: string; role: 'user' | 'assistant'; before: string; after: string; count: number }[]
  memory: number
  total: number
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Replaces a name as a whole word, matching capitals exactly (so renaming "Rook" leaves the
 * bird alone). A first name on its own follows too ("Mira" → "Wren" when "Mira Ashdown" → "Wren Fenwick").
 */
export function renameIn(text: string, from: string, to: string): { text: string; count: number } {
  const pairs: [string, string][] = [[from.trim(), to.trim()]]
  const [f1] = from.trim().split(/\s+/)
  const [t1] = to.trim().split(/\s+/)
  if (f1 && t1 && f1 !== from.trim() && f1.length >= 3 && f1 !== t1) pairs.push([f1, t1])
  let count = 0
  let out = text
  for (const [a, b] of pairs) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(a)}(?![\\p{L}\\p{N}])`, 'gu')
    out = out.replace(re, () => {
      count++
      return b
    })
  }
  return { text: out, count }
}

function snippet(text: string, word: string): string {
  const i = text.indexOf(word)
  if (i < 0) return text.slice(0, 120)
  const start = Math.max(0, i - 50)
  return `${start > 0 ? '…' : ''}${text.slice(start, i + word.length + 60).replace(/\s+/g, ' ')}${i + word.length + 60 < text.length ? '…' : ''}`
}

/** Memory edits (Journal events) that rewrite a name in everything remembered. */
function memoryEdits(campaigns: Campaigns, id: string, from: string, to: string): MemoryEvent[] {
  const c = campaigns.get(id)
  const memory = projectMemory(campaigns.activeEvents(c, campaigns.path(c)).map((e) => e.event))
  const r = (s: string) => renameIn(s, from, to)
  const edits: MemoryEvent[] = []
  for (const e of memory.entities) {
    const name = r(e.name)
    const summary = r(e.summary)
    const facts = e.facts.map(r)
    const aliases = e.aliases.map(r)
    if (name.count || summary.count || facts.some((f) => f.count) || aliases.some((a) => a.count)) {
      edits.push({ type: 'entity_edit', id: e.id, name: name.text, summary: summary.text, facts: facts.map((f) => f.text), aliases: aliases.map((a) => a.text) })
    }
  }
  for (const s of [...memory.scenes, ...memory.chapters]) {
    const title = r(s.title)
    const text = r(s.text)
    if (title.count || text.count) edits.push({ type: 'summary_edit', level: s.level, to: s.to, title: title.text, text: text.text })
  }
  const arc = r(memory.arc)
  if (arc.count) edits.push({ type: 'arc', text: arc.text })
  for (const n of memory.notes) {
    const t = r(n.text)
    if (t.count) edits.push({ type: 'note', id: n.id, text: t.text })
  }
  return edits
}

export function previewRename(campaigns: Campaigns, id: string, from: string, to: string): RenamePreview {
  const messages = campaigns.db
    .messagesFor(id)
    .filter((m) => !m.meta.hidden || m.meta.kind === 'opening')
    .map((m) => {
      const r = renameIn(m.content, from, to)
      return { id: m.id, role: m.role, before: snippet(m.content, from.split(/\s+/)[0]), after: snippet(r.text, to.split(/\s+/)[0]), count: r.count }
    })
    .filter((m) => m.count > 0)
  const memory = memoryEdits(campaigns, id, from, to).length
  return { messages, memory, total: messages.reduce((n, m) => n + m.count, 0) }
}

export function applyRename(
  campaigns: Campaigns,
  id: string,
  opts: { from: string; to: string; mode: RenameMode; target: RenameTarget; skip?: string[] }
) {
  const from = opts.from.trim()
  const to = opts.to.trim()
  if (!from || !to || from === to) throw new Error('Type the new name first.')
  const c = campaigns.get(id)
  const edits: MemoryEvent[] = []

  if (opts.mode === 'retcon') {
    const skip = new Set(opts.skip ?? [])
    for (const m of campaigns.db.messagesFor(id)) {
      if (skip.has(m.id)) continue
      const r = renameIn(m.content, from, to)
      if (r.count) campaigns.db.updateMessage(m.id, { content: r.text })
    }
    edits.push(...memoryEdits(campaigns, id, from, to))
  } else if (opts.target.kind === 'entity') {
    const target = opts.target
    const memory = projectMemory(campaigns.activeEvents(c, campaigns.path(c)).map((e) => e.event))
    const e = memory.entities.find((x) => x.id === target.id)
    // The old name stays as another name (the Journal edit keeps it); the DM learns of the change.
    if (e) edits.push({ type: 'entity_edit', id: e.id, name: to, facts: [...e.facts, `Now goes by ${to} (formerly ${from})`] })
  } else {
    edits.push({ type: 'note', id: newId('note'), text: `The player character, formerly known as ${from}, now goes by ${to}.` })
  }

  if (opts.target.kind === 'player') {
    const swap = (s: string) => (opts.mode === 'retcon' ? renameIn(s, from, to).text : s)
    campaigns.db.updateCampaign(id, {
      build: { ...c.build, name: to, appearance: swap(c.build.appearance), personality: swap(c.build.personality) },
      // A retcon renames the adventure too; after an in-story rename it's still the tale of who they were.
      name: opts.mode === 'retcon' && c.name === `The tale of ${from}` ? `The tale of ${to}` : c.name
    })
  } else if (opts.mode === 'retcon' && !edits.some((x) => x.type === 'entity_edit' && x.id === (opts.target as { id: string }).id)) {
    // The record's name may only be in its title: rename it all the same.
    edits.push({ type: 'entity_edit', id: opts.target.id, name: to })
  }
  for (const ed of edits) campaigns.journal(id, ed)
}
