import type { CardData } from '@shared/cards'
import { crc32 } from '../store/zip'

/**
 * Character Card export (docs/spec/03-characters-and-cards.md): a PNG with the card in its
 * text chunks ("chara" for V2, "ccv3" for V3), which SillyTavern and friends read; or plain
 * JSON when there's no PNG portrait to carry it.
 */

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
export const isPng = (b: Uint8Array) => b.length > 8 && PNG_SIG.every((x, i) => b[i] === x)

/** The card as V2 and (if it was one) V3 JSON, from what was imported. */
export function cardJson(raw: unknown, data: CardData): { v2: Obj; v3?: Obj } {
  const r = isObj(raw) ? raw : {}
  if (r.spec === 'chara_card_v3' && isObj(r.data)) return { v2: { spec: 'chara_card_v2', spec_version: '2.0', data: r.data }, v3: r }
  if (r.spec === 'chara_card_v2' && isObj(r.data)) return { v2: r }
  // V1 cards (flat), or anything else: rebuild from what the library understood.
  return { v2: { spec: 'chara_card_v2', spec_version: '2.0', data: v2Data(data) } }
}

/** A V2 card's data from the library's view of a card (or from a character built in the app). */
export function v2Data(d: Partial<CardData> & { name: string }): Obj {
  return {
    name: d.name,
    description: d.description ?? '',
    personality: d.personality ?? '',
    scenario: d.scenario ?? '',
    first_mes: d.firstMes ?? '',
    mes_example: d.mesExample ?? '',
    creator_notes: d.creatorNotes ?? '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: d.alternateGreetings ?? [],
    tags: d.tags ?? [],
    creator: d.creator ?? '',
    character_version: '',
    extensions: {}
  }
}

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(body)])), 0)
  return Buffer.concat([head, Buffer.from(body), crc])
}

/** The portrait, with the card written into it (any old card text in it is replaced). */
export function writeCardPng(png: Uint8Array, json: { v2: Obj; v3?: Obj }): Buffer {
  const b = Buffer.from(png)
  const out: Buffer[] = [b.subarray(0, 8)]
  let p = 8
  const text = (key: string, value: Obj) => chunk('tEXt', Buffer.from(`${key}\0${Buffer.from(JSON.stringify(value), 'utf8').toString('base64')}`, 'latin1'))
  while (p + 8 <= b.length) {
    const len = b.readUInt32BE(p)
    const type = b.toString('latin1', p + 4, p + 8)
    const end = p + 12 + len
    if (type === 'IEND') {
      out.push(text('chara', json.v2))
      if (json.v3) out.push(text('ccv3', json.v3))
      out.push(b.subarray(p, end))
      break
    }
    const key = type === 'tEXt' || type === 'iTXt' || type === 'zTXt' ? b.toString('latin1', p + 8, Math.min(end - 4, p + 8 + 8)).split('\0')[0] : ''
    if (!(key === 'chara' || key === 'ccv3')) out.push(b.subarray(p, end))
    p = end
  }
  return Buffer.concat(out)
}

/** A safe file name from a character's name. */
export const fileName = (name: string, ext: string) => `${name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'character'}.${ext}`
