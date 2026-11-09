import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { DEFAULT_SETTINGS, type CharacterBuild } from '@shared/rules'
import { GameDb } from '../store/db'
import { crc32, makeZip } from '../store/zip'
import { Campaigns } from './campaigns'
import { CardLibrary } from '../cards/library'
import { parseCardFile, zipEntries, zipRead } from '../cards/parse'
import { writeCardPng } from '../cards/export'
import { exportCampaign, importCampaign } from './portable'

const build: CharacterBuild = {
  name: 'Brenna Rook',
  race: 'human',
  sex: 'female',
  age: 'adult',
  background: 'hunter',
  humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 },
  skills: { perception: 3, stealth: 3 },
  appearance: 'Tall, freckled.',
  personality: 'Quiet.'
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])))
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, crc])
}
/** A 1×1 PNG. */
function tinyPng() {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 200, 80, 40]))), chunk('IEND', Buffer.alloc(0))])
}
const elara = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Elara', description: 'An elf archer.', personality: 'Sharp.', scenario: '', first_mes: 'Hello.', mes_example: '', alternate_greetings: [], tags: ['elf'], creator: 'Mira' } }

describe('files that travel', () => {
  let dirs: string[]
  let db: GameDb
  const fresh = () => {
    const d = mkdtempSync(join(tmpdir(), 'emberlight-port-'))
    dirs.push(d)
    return new GameDb(d)
  }
  beforeEach(() => {
    dirs = []
    db = fresh()
  })
  afterEach(() => {
    db.close()
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  it('zips and unzips', () => {
    const big = Buffer.from('the river runs high '.repeat(200))
    const zip = makeZip([
      { name: 'a.txt', data: Buffer.from('short') },
      { name: 'folder/ünïcode.txt', data: big }
    ])
    const entries = zipEntries(zip)
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'folder/ünïcode.txt'])
    expect(Buffer.from(zipRead(zip, entries[1])).toString()).toBe(big.toString())
    expect(entries[1].method).toBe(8)
  })

  it('writes character cards other apps can read, keeping the portrait', () => {
    const png = writeCardPng(tinyPng(), { v2: elara })
    const parsed = parseCardFile(png, 'elara.png')
    expect(parsed.data).toMatchObject({ name: 'Elara', description: 'An elf archer.', creator: 'Mira' })
    expect(parsed.image?.mime).toBe('image/png')
    // Exporting a library card gives the same card back; old card text in the PNG is replaced.
    const lib = new CardLibrary(db)
    const { card } = lib.import(png, 'elara.png')
    const out = lib.exportFile(card.id)!
    expect(out).toMatchObject({ name: 'Elara.png', type: 'image/png' })
    const again = parseCardFile(writeCardPng(out.bytes, { v2: { ...elara, data: { ...elara.data, name: 'Elara Two' } } }), 'x.png')
    expect(again.data.name).toBe('Elara Two')
  })

  it('exports an adventure and brings it back as a new one, ids and all', () => {
    const campaigns = new Campaigns(db)
    const lib = new CardLibrary(db)
    const { card } = lib.import(writeCardPng(tinyPng(), { v2: elara }), 'elara.png')
    db.saveLorebook({ id: 'lb_test', name: 'Test lore', description: 'Things.', entries: [] })
    const id = campaigns.create(build, { ...DEFAULT_SETTINGS, persona: `card:${card.id}` }, 'Export test', { cast: [lib.castMember(card.id, 'companion', build.name)], lorebooks: ['lb_test'] })
    const opening = campaigns.get(id).head_id!
    db.addMessage({ id: 'msg_a', campaign_id: id, parent_id: opening, role: 'assistant', content: 'Rain falls.', thinking: '', meta: { kind: 'narration' } })
    db.addMessage({ id: 'msg_b', campaign_id: id, parent_id: 'msg_a', role: 'user', content: 'I wait.', thinking: '', meta: { kind: 'action', answers: 'msg_a' } })
    db.addEvents(id, 'msg_b', 'grp_1', 'engine', [{ type: 'coins', delta: 25 }])
    db.addEvents(id, 'msg_b', 'grp_2', 'engine', [{ type: 'coins', delta: 5 }])
    db.supersedeGroup('grp_2')
    db.addEvents(id, 'msg_a', 'mem_1', 'ai', [{ type: 'summary', summary: { level: 'scene', title: 'Rain', text: 'It rained.', from: opening, to: 'msg_a', fromDay: 1, toDay: 1 } }])
    db.setHead(id, 'msg_b')
    db.addSave(id, 'Before the wait', 'msg_a')
    const face = db.addMedia({ campaignId: id, kind: 'portrait', mime: 'image/png', data: tinyPng() })
    campaigns.setPortrait(id, face)
    const before = campaigns.view(id)

    const { bytes, name } = exportCampaign(db, id)
    expect(name).toBe('Export test')
    const copy = importCampaign(db, bytes)
    const after = campaigns.view(copy)
    expect(copy).not.toBe(id)
    expect(after.name).toBe('Export test (imported)')
    // The portrait comes along as a picture of its own (a new id, the same bytes).
    const copied = after.state.character.portrait!
    expect(copied).not.toBe(face)
    expect(Buffer.from(db.getMedia(copied)!.data)).toEqual(tinyPng())
    expect({ ...after.state, character: { ...after.state.character, portrait: face } }).toEqual(before.state)
    expect(after.state.character.coins).toBe(50 + 25)
    expect(after.messages.map((m) => m.content)).toEqual(before.messages.map((m) => m.content))
    expect(after.messages.some((m) => before.messages.some((b) => b.id === m.id))).toBe(false)
    // Message ids inside the story follow along: summaries, answered rolls, save slots.
    expect(after.memory.scenes[0].to).toBe(after.messages[1].id)
    expect(db.getMessage(after.messages[2].id)?.meta.answers).toBe(after.messages[1].id)
    expect(after.saves[0]).toMatchObject({ name: 'Before the wait', messageId: after.messages[1].id })
    // The same card and lorebook are reused, not duplicated.
    expect(after.cast[0].cardId).toBe(card.id)
    expect(campaigns.get(copy).settings.persona).toBe(`card:${card.id}`)
    expect(lib.list()).toHaveLength(1)
    expect(after.lorebooks.map((b) => b.id)).toEqual(['lb_test'])
    // And again: the same file can come in twice.
    expect(importCampaign(db, bytes)).not.toBe(copy)

    // Into another copy of the app: the card (with its portrait) and the lorebook come along.
    const db2 = fresh()
    const other = new Campaigns(db2)
    const v2 = other.view(importCampaign(db2, bytes))
    expect(v2.name).toBe('Export test')
    expect(v2.cast[0].cardId).not.toBe(card.id)
    expect(db2.cardImage(v2.cast[0].cardId)?.mime).toBe('image/png')
    expect(v2.lorebooks).toEqual([{ id: 'lb_test', name: 'Test lore', entries: 0 }])
    expect(db2.getMedia(v2.state.character.portrait!)?.mime).toBe('image/png')
    // The card's companion follows their card to its new id.
    expect(v2.state.party.map((a) => [a.id, a.card])).toEqual([[v2.cast[0].cardId, v2.cast[0].cardId]])
    const asBefore = v2.state.party.map((a) => ({ ...a, id: card.id, card: card.id }))
    expect({ ...v2.state, party: asBefore, character: { ...v2.state.character, portrait: face } }).toEqual(before.state)
    db2.close()
  })

  it('refuses files that are not adventures, or are from a newer app', () => {
    expect(() => importCampaign(db, Buffer.from('not a zip at all'))).toThrow(/isn't an Emberlight adventure/)
    expect(() => importCampaign(db, makeZip([{ name: 'other.json', data: Buffer.from('{}') }]))).toThrow(/isn't an Emberlight adventure/)
    expect(() => importCampaign(db, makeZip([{ name: 'campaign.json', data: Buffer.from('{"format":"emberlight-campaign","version":99}') }]))).toThrow(/newer version/)
    expect(() => importCampaign(db, makeZip([{ name: 'campaign.json', data: Buffer.from('{"format":"emberlight-campaign","version":1}') }]))).toThrow(/damaged/)
  })
})
