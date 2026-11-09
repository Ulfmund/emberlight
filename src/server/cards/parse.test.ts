import { describe, expect, it } from 'vitest'
import { deflateRawSync, deflateSync } from 'node:zlib'
import { parseCardFile, pngTextChunks } from './parse'
import { activeLore, fillMacros, guessFromCard, tagline, type CardBookEntry } from '@shared/cards'

// ---- tiny file builders ---------------------------------------------------------------------

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, data.length)
  out.set(Buffer.from(type, 'latin1'), 4)
  out.set(data, 8)
  return out // CRC left as zero: the reader doesn't check it
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
const text = (s: string) => new Uint8Array(Buffer.from(s, 'latin1'))
const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function png(chunks: Uint8Array[]) {
  return concat(sig, chunk('IHDR', new Uint8Array(13)), ...chunks, chunk('IEND', new Uint8Array()))
}
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')

function zip(files: Record<string, Uint8Array>, deflate = false) {
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const [name, raw] of Object.entries(files)) {
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw
    const n = Buffer.from(name, 'utf8')
    const h = new Uint8Array(30 + n.length)
    const hv = new DataView(h.buffer)
    hv.setUint32(0, 0x04034b50, true)
    hv.setUint16(8, deflate ? 8 : 0, true)
    hv.setUint32(18, data.length, true)
    hv.setUint32(22, raw.length, true)
    hv.setUint16(26, n.length, true)
    h.set(n, 30)
    const c = new Uint8Array(46 + n.length)
    const cv = new DataView(c.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, deflate ? 8 : 0, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, n.length, true)
    cv.setUint32(42, offset, true)
    c.set(n, 46)
    local.push(h, data)
    central.push(c)
    offset += h.length + data.length
  }
  const cd = concat(...central)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, central.length, true)
  ev.setUint16(10, central.length, true)
  ev.setUint32(12, cd.length, true)
  ev.setUint32(16, offset, true)
  return concat(...local, cd, end)
}

const V2 = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: 'Mira',
    description: '{{char}} is a halfling scout. She keeps her knives sharp and her mouth shut.',
    personality: 'wry, loyal',
    scenario: '{{char}} has been hired to guide {{user}} through the marsh.',
    first_mes: '*Mira looks up.* "You\'re late, {{user}}."',
    mes_example: '<START>\n{{char}}: "Mud again."',
    alternate_greetings: ['"Took your time."', ''],
    tags: ['fantasy', 'female'],
    creator: 'someone',
    character_book: {
      entries: [
        { keys: ['marsh'], content: 'The Weeping Marsh swallows the careless.', enabled: true, insertion_order: 10 },
        { keys: [], content: 'Halflings are lucky.', constant: true, enabled: true }
      ]
    }
  }
}

// ---- tests ----------------------------------------------------------------------------------

describe('card files', () => {
  it('reads a V2 PNG card and keeps the picture', () => {
    const file = png([chunk('tEXt', concat(text('chara'), new Uint8Array([0]), text(b64(V2))))])
    const card = parseCardFile(file, 'mira.png')
    expect(card.data.spec).toBe('v2')
    expect(card.data.name).toBe('Mira')
    expect(card.data.alternateGreetings).toEqual(['"Took your time."'])
    expect(card.data.book).toHaveLength(2)
    expect(card.image?.mime).toBe('image/png')
    expect(card.image?.bytes.length).toBe(file.length)
  })

  it('prefers the V3 block when a PNG has both', () => {
    const v3 = { ...V2, spec: 'chara_card_v3', data: { ...V2.data, name: 'Mira the Third', nickname: 'Mira' } }
    const file = png([
      chunk('tEXt', concat(text('chara'), new Uint8Array([0]), text(b64(V2)))),
      chunk('tEXt', concat(text('ccv3'), new Uint8Array([0]), text(b64(v3))))
    ])
    const card = parseCardFile(file)
    expect(card.data.spec).toBe('v3')
    expect(card.data.nickname).toBe('Mira')
  })

  it('reads compressed and international text chunks', () => {
    const z = chunk('zTXt', concat(text('chara'), new Uint8Array([0, 0]), new Uint8Array(deflateSync(Buffer.from(b64(V2))))))
    expect(parseCardFile(png([z])).data.name).toBe('Mira')
    const i = chunk('iTXt', concat(text('chara'), new Uint8Array([0, 0, 0, 0, 0]), new Uint8Array(Buffer.from(b64(V2)))))
    expect(pngTextChunks(png([i])).get('chara')).toBe(b64(V2))
  })

  it('explains a PNG without a card', () => {
    expect(() => parseCardFile(png([]))).toThrow(/no character card/)
  })

  it('reads V1 and V2 JSON', () => {
    const v1 = { name: 'Old Tam', description: 'A ferryman.', first_mes: 'Hm.', personality: 'gruff', scenario: '', mes_example: '' }
    expect(parseCardFile(new TextEncoder().encode(JSON.stringify(v1)), 'tam.json').data).toMatchObject({ spec: 'v1', name: 'Old Tam', firstMes: 'Hm.' })
    expect(parseCardFile(new TextEncoder().encode(JSON.stringify(V2)), 'mira.json').data.name).toBe('Mira')
  })

  it('turns away lorebooks and junk politely', () => {
    expect(() => parseCardFile(new TextEncoder().encode('{"entries":{"0":{"key":["a"]}}}'), 'world.json')).toThrow(/lorebook/)
    expect(() => parseCardFile(new TextEncoder().encode('hello'), 'x.txt')).toThrow(/isn't a character card/)
  })

  it('reads a .charx with its embedded icon', () => {
    const icon = png([])
    const card = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: { ...V2.data, assets: [{ type: 'icon', uri: 'embeded://assets/icon/images/main.png', name: 'main', ext: 'png' }] }
    }
    for (const deflate of [false, true]) {
      const file = zip({ 'card.json': new TextEncoder().encode(JSON.stringify(card)), 'assets/icon/images/main.png': icon }, deflate)
      const parsed = parseCardFile(file, 'mira.charx')
      expect(parsed.data.spec).toBe('v3')
      expect(parsed.image?.mime).toBe('image/png')
      expect(Array.from(parsed.image!.bytes)).toEqual(Array.from(icon))
    }
  })
})

describe('card helpers', () => {
  it('fills placeholders', () => {
    expect(fillMacros('{{char}} greets {{User}}. <BOT> and <USER>.', 'Mira', 'Bram')).toBe('Mira greets Bram. Mira and Bram.')
  })

  it('makes a short tagline', () => {
    const t = tagline({ ...parseCardFile(new TextEncoder().encode(JSON.stringify(V2))).data, creatorNotes: '' })
    expect(t).toMatch(/^Mira is a halfling scout/)
  })

  it('guesses race and sex from the text', () => {
    expect(guessFromCard({ description: 'She is a halfling scout. Her knives are sharp; she is quiet.', personality: '', tags: [] })).toEqual({ race: 'halfling', sex: 'female' })
    expect(guessFromCard({ description: 'A mysterious figure.', personality: '', tags: [] })).toEqual({ race: undefined, sex: undefined })
  })

  it('picks lorebook entries by keyword', () => {
    const e = (p: Partial<CardBookEntry>): CardBookEntry => ({ keys: [], secondaryKeys: [], content: 'x', constant: false, enabled: true, selective: false, caseSensitive: false, priority: 0, name: '', ...p })
    const book = [
      e({ keys: ['marsh'], content: 'marsh lore' }),
      e({ constant: true, content: 'always' }),
      e({ keys: ['tower'], content: 'tower lore' }),
      e({ keys: ['king'], secondaryKeys: ['crown'], selective: true, content: 'royal lore' }),
      e({ keys: ['/drag(on|oness)/i'], content: 'dragon lore' }),
      e({ keys: ['marsh'], content: 'off', enabled: false })
    ]
    const picked = activeLore(book, 'We cross the Marsh. The king is here. A DRAGONESS watches.').map((x) => x.content)
    expect(picked).toEqual(['always', 'marsh lore', 'dragon lore'])
    // Whole words only: "marshal" is not "marsh".
    expect(activeLore(book, 'The marshal nods.').map((x) => x.content)).toEqual(['always'])
  })
})
