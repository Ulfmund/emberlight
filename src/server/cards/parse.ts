import { inflateRawSync, inflateSync } from 'node:zlib'
import type { CardBookEntry, CardData } from '@shared/cards'
import { fromWorldInfo } from '@shared/lore'

/**
 * Reads Character Card V1/V2/V3 files: PNG with the card in a text chunk (`chara` for V2,
 * `ccv3` for V3), plain `.json`, and V3 `.charx` (a zip with `card.json` and assets).
 */

export type ParsedCard = {
  data: CardData
  /** The card as it was, for exporting later. */
  raw: unknown
  image?: { bytes: Uint8Array; mime: string }
}

export class CardError extends Error {}

const MAX_JSON = 8 * 1024 * 1024

export function parseCardFile(bytes: Uint8Array, filename = ''): ParsedCard {
  const lower = filename.toLowerCase()
  if (isPng(bytes)) return fromPng(bytes)
  if (isZip(bytes) || lower.endsWith('.charx')) return fromCharx(bytes)
  if (isJpeg(bytes) || isWebp(bytes)) {
    throw new CardError('This picture has no character card inside it. Cards are PNG images (or .json / .charx files).')
  }
  const text = new TextDecoder().decode(bytes).replace(/^﻿/, '')
  if (/^\s*[{[]/.test(text)) return { ...fromJson(text) }
  throw new CardError("This file isn't a character card. Try a card's PNG, .json or .charx file.")
}

// ---- PNG ----------------------------------------------------------------------------------

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const isPng = (b: Uint8Array) => b.length > 8 && PNG_SIG.every((v, i) => b[i] === v)
const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8
const isWebp = (b: Uint8Array) => b.length > 12 && String.fromCharCode(...b.slice(8, 12)) === 'WEBP'

/** The text chunks in a PNG (tEXt, zTXt and iTXt). */
export function pngTextChunks(b: Uint8Array): Map<string, string> {
  const out = new Map<string, string>()
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const latin1 = new TextDecoder('latin1')
  const utf8 = new TextDecoder()
  let p = 8
  while (p + 8 <= b.length) {
    const len = view.getUint32(p)
    const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7])
    const start = p + 8
    const end = start + len
    if (end > b.length) break
    const chunk = b.subarray(start, end)
    try {
      if (type === 'tEXt') {
        const z = chunk.indexOf(0)
        if (z > 0) out.set(latin1.decode(chunk.subarray(0, z)), latin1.decode(chunk.subarray(z + 1)))
      } else if (type === 'zTXt') {
        const z = chunk.indexOf(0)
        if (z > 0) out.set(latin1.decode(chunk.subarray(0, z)), latin1.decode(inflateSync(chunk.subarray(z + 2))))
      } else if (type === 'iTXt') {
        const z = chunk.indexOf(0)
        const compressed = chunk[z + 1] === 1
        let q = z + 3
        q = chunk.indexOf(0, q) + 1 // language tag
        q = chunk.indexOf(0, q) + 1 // translated keyword
        const body = chunk.subarray(q)
        out.set(latin1.decode(chunk.subarray(0, z)), utf8.decode(compressed ? inflateSync(body) : body))
      }
    } catch {
      /* a broken chunk shouldn't hide the others */
    }
    if (type === 'IEND') break
    p = end + 4 // skip CRC
  }
  return out
}

function decodeBase64Json(s: string): string {
  const trimmed = s.trim()
  // Some tools store plain JSON instead of base64.
  if (trimmed.startsWith('{')) return trimmed
  return Buffer.from(trimmed, 'base64').toString('utf8')
}

function fromPng(b: Uint8Array): ParsedCard {
  const chunks = pngTextChunks(b)
  const v3 = chunks.get('ccv3')
  const v2 = chunks.get('chara')
  const payload = v3 ?? v2
  if (!payload) throw new CardError('This picture has no character card inside it. It may have been re-saved or shrunk by a website, which strips the card.')
  let parsed: ParsedCard
  try {
    parsed = fromJson(decodeBase64Json(payload))
  } catch (err) {
    // A broken V3 block with a good V2 one beside it: use the V2 one.
    if (v3 && v2) parsed = fromJson(decodeBase64Json(v2))
    else throw err
  }
  return { ...parsed, image: { bytes: b, mime: 'image/png' } }
}

// ---- JSON ---------------------------------------------------------------------------------

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = 60_000) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').slice(0, max)
const strs = (v: unknown, maxItems = 64) => (Array.isArray(v) ? v.map((x) => str(x)).filter((x) => x.trim()).slice(0, maxItems) : [])

export function fromJson(text: string): ParsedCard {
  if (text.length > MAX_JSON) throw new CardError('This card is too large to read.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new CardError("This card's data is damaged and can't be read.")
  }
  if (!isObj(raw)) throw new CardError("This file isn't a character card.")
  const spec = str(raw.spec)
  // V2 and V3 keep everything under `data`; V1 has the fields at the top.
  const d = (spec === 'chara_card_v2' || spec === 'chara_card_v3') && isObj(raw.data) ? raw.data : isObj(raw.data) && !raw.name ? raw.data : raw
  const name = str(d.name ?? d.char_name, 200).trim()
  if (!name) {
    if (Array.isArray(raw.entries) || isObj(raw.entries)) throw new CardError('This is a lorebook, not a character card. Lorebook import comes in a later update.')
    throw new CardError("This file isn't a character card (it has no character name).")
  }
  const data: CardData = {
    spec: spec === 'chara_card_v3' ? 'v3' : spec === 'chara_card_v2' ? 'v2' : 'v1',
    name,
    nickname: str(d.nickname, 200).trim(),
    description: str(d.description ?? d.char_persona),
    personality: str(d.personality),
    scenario: str(d.scenario ?? d.world_scenario),
    firstMes: str(d.first_mes ?? d.char_greeting),
    alternateGreetings: strs(d.alternate_greetings),
    mesExample: str(d.mes_example ?? d.example_dialogue),
    creatorNotes: str(d.creator_notes ?? d.creatorcomment, 4000),
    creator: str(d.creator, 200),
    tags: strs(d.tags, 30).map((t) => t.slice(0, 40)),
    book: readBook(d.character_book)
  }
  return { data, raw }
}

function readBook(book: unknown): CardBookEntry[] {
  if (!isObj(book)) return []
  try {
    return fromWorldInfo(book).entries.slice(0, 500)
  } catch {
    return []
  }
}

// ---- CHARX (zip) ----------------------------------------------------------------------------

type ZipEntry = { name: string; method: number; compressedSize: number; offset: number }

/** Lists a zip's files from its central directory. */
export function zipEntries(b: Uint8Array): ZipEntry[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  // The end-of-central-directory record is in the last 64 KB.
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new CardError('This .charx file is damaged (not a complete zip).')
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const utf8 = new TextDecoder()
  const out: ZipEntry[] = []
  for (let i = 0; i < count && p + 46 <= b.length; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const offset = view.getUint32(p + 42, true)
    out.push({ name: utf8.decode(b.subarray(p + 46, p + 46 + nameLen)), method, compressedSize, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

export function zipRead(b: Uint8Array, e: ZipEntry): Uint8Array {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (view.getUint32(e.offset, true) !== 0x04034b50) throw new CardError('This .charx file is damaged.')
  const nameLen = view.getUint16(e.offset + 26, true)
  const extraLen = view.getUint16(e.offset + 28, true)
  const start = e.offset + 30 + nameLen + extraLen
  const data = b.subarray(start, start + e.compressedSize)
  if (e.method === 0) return data
  if (e.method === 8) return inflateRawSync(data)
  throw new CardError('This .charx file uses a kind of compression the app can’t read.')
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }

function fromCharx(b: Uint8Array): ParsedCard {
  const entries = zipEntries(b)
  const cardEntry = entries.find((e) => e.name.toLowerCase() === 'card.json')
  if (!cardEntry) throw new CardError('This .charx file has no card inside it.')
  const parsed = fromJson(new TextDecoder().decode(zipRead(b, cardEntry)))
  const raw = parsed.raw as Obj
  const assets = isObj(raw.data) && Array.isArray(raw.data.assets) ? raw.data.assets.filter(isObj) : []
  const icons = assets.filter((a) => str(a.type) === 'icon')
  const icon = icons.find((a) => str(a.name) === 'main') ?? icons[0]
  let image: ParsedCard['image']
  const pick = (path: string) => {
    const e = entries.find((x) => x.name === path)
    if (!e) return undefined
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    return MIME[ext] ? { bytes: zipRead(b, e), mime: MIME[ext] } : undefined
  }
  if (icon) {
    const uri = str(icon.uri)
    const m = /^embed+ed:\/\/(.+)$/i.exec(uri)
    if (m) image = pick(m[1])
  }
  // No icon listed: use the first picture under assets/icon.
  if (!image) {
    const first = entries.find((e) => /^assets\/icon\/.+\.(png|jpe?g|webp|gif|avif)$/i.test(e.name))
    if (first) image = pick(first.name)
  }
  return { ...parsed, image }
}
