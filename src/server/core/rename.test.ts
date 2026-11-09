import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, randomBuild } from '@shared/rules'
import { GameDb, newId } from '../store/db'
import { Campaigns } from './campaigns'
import { applyRename, previewRename, renameIn } from './rename'

describe('renaming text', () => {
  it('swaps whole names, first names too, and leaves other words alone', () => {
    expect(renameIn("Mira Ashdown smiles. Mira's knife. Miracle. mira.", 'Mira Ashdown', 'Wren Fenwick')).toEqual({ text: "Wren Fenwick smiles. Wren's knife. Miracle. mira.", count: 2 })
    expect(renameIn('Brenna Rook, the rook-feathered hunter. A rook caws.', 'Rook', 'Crane').text).toBe('Brenna Crane, the rook-feathered hunter. A rook caws.')
  })
})

describe('renaming in a story', () => {
  let dir: string
  let db: GameDb
  let campaigns: Campaigns
  let id: string
  const msg = (role: 'user' | 'assistant', content: string, parent: string) => {
    const m = db.addMessage({ id: newId('msg'), campaign_id: id, parent_id: parent, role, content, thinking: '', meta: {} })
    db.setHead(id, m.id)
    return m.id
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'emberlight-rename-'))
    db = new GameDb(dir)
    campaigns = new Campaigns(db)
    let seed = 3
    const build = { ...randomBuild(() => ((seed = (seed * 16807) % 2147483647) / 2147483647), 'realistic', 'Mira Ashdown'), name: 'Mira Ashdown', appearance: 'Mira has copper curls.' }
    id = campaigns.create(build, DEFAULT_SETTINGS)
    const root = campaigns.path(campaigns.get(id))[0].id
    const a = msg('assistant', 'Old Tam squints at you. "Mira Ashdown, is it?"', root)
    const b = msg('user', '"Yes, Mira," I say.', a)
    msg('assistant', 'Tam nods.', b)
    db.addEvents(id, a, newId('grp'), 'ai', [{ type: 'entity', kind: 'person', name: 'Old Tam', summary: 'ferryman who distrusts Mira', day: 1 }])
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('previews a retcon, then rewrites everything except what was unticked', () => {
    const p = previewRename(campaigns, id, 'Mira Ashdown', 'Wren Fenwick')
    expect(p.messages).toHaveLength(2)
    expect(p.total).toBe(2)
    expect(p.memory).toBe(1) // Old Tam's summary mentions her
    const keep = p.messages.find((m) => m.role === 'user')!.id
    applyRename(campaigns, id, { from: 'Mira Ashdown', to: 'Wren Fenwick', mode: 'retcon', target: { kind: 'player' }, skip: [keep] })
    const v = campaigns.view(id)
    expect(v.name).toBe('The tale of Wren Fenwick')
    expect(v.build).toMatchObject({ name: 'Wren Fenwick', appearance: 'Wren has copper curls.' })
    expect(v.messages.map((m) => m.content)).toEqual([expect.any(String), 'Old Tam squints at you. "Wren Fenwick, is it?"', '"Yes, Mira," I say.', 'Tam nods.'])
    expect(v.memory.entities[0].summary).toBe('ferryman who distrusts Wren')
    expect(v.memory.notes).toEqual([])
  })

  it('an in-story rename keeps the past and tells the DM', () => {
    applyRename(campaigns, id, { from: 'Mira Ashdown', to: 'the Grey Widow', mode: 'story', target: { kind: 'player' } })
    const v = campaigns.view(id)
    expect(v.build.name).toBe('the Grey Widow')
    expect(v.name).toBe('The tale of Mira Ashdown')
    expect(v.messages[1].content).toContain('Mira Ashdown')
    expect(v.memory.notes[0].text).toBe('The player character, formerly known as Mira Ashdown, now goes by the Grey Widow.')
  })

  it('renames people in the Journal either way', () => {
    applyRename(campaigns, id, { from: 'Old Tam', to: 'Tamas the Ferryman', mode: 'story', target: { kind: 'entity', id: 'person:old tam' } })
    let e = campaigns.view(id).memory.entities[0]
    expect(e).toMatchObject({ name: 'Tamas the Ferryman', aliases: ['Old Tam'] })
    expect(e.facts.at(-1)).toBe('Now goes by Tamas the Ferryman (formerly Old Tam)')

    applyRename(campaigns, id, { from: 'Tamas the Ferryman', to: 'Tamsin', mode: 'retcon', target: { kind: 'entity', id: 'person:old tam' } })
    e = campaigns.view(id).memory.entities[0]
    expect(e.name).toBe('Tamsin')
    // The retcon rewrote the earlier note too.
    expect(e.facts.at(-1)).toBe('Now goes by Tamsin (formerly Old Tam)')
  })
})
