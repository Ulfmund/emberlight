import { fromWorldInfo, LoreError, type Lorebook } from '@shared/lore'
import { CHUB_SITE, type ChubBook, type ChubResults, type ChubSearch, type ChubSort } from '@shared/chub'
import { MAX_LORE_FILE, type LoreLibrary } from './library'

/**
 * Lorebooks from Chub (docs/spec/07-memory-and-lore.md#finding-lorebooks-on-chub): the biggest
 * library of them, with a search anyone can use without an account. SillyTavern imports from it
 * the same way. Each one comes as a SillyTavern World Info file, which the library already reads.
 * Only Chub's own API is ever asked, at fixed addresses; the player's choice is checked first.
 */

const API = 'https://api.chub.ai'
const USER_AGENT = 'Emberlight (+https://github.com/Ulfmund/emberlight)'
export const CHUB_PAGE = 24
const SORT: Record<ChubSort, string> = { downloads: 'download_count', rating: 'rating', newest: 'created_at', updated: 'last_activity_at' }
/** Chub's path for a lorebook: "lorebooks/author/name", nothing more. */
const PATH = /^lorebooks\/[^/?#\s\\]{1,100}\/[^/?#\s\\]{1,200}$/

/**
 * Chub's own NSFW switch lets plenty through (in a test, the most-downloaded "SFW" lorebook was
 * "Fetish items"), so with NSFW off, books whose name, tagline or tags say so are left out too.
 */
const ADULT = /\b(nsfw|nsfl|fetish(es)?|lewd|erotic(a)?|sex|sexy|sexual|smut|porn|kinks?|kinky|bdsm|hypno(sis|tism)?|mind control|brainwash(ed|ing)?|futa|incest|rape|vore|bondage|harem|breeding|lust|nude|nudity|hentai)\b|\b18\+/i
/** Not a world: instructions for the AI, a game system, an add-on. */
const INSTRUCTIONS = /\b(instructions?|add-?ons?|prompts?|jailbreaks?|presets?|guidelines|game system|rpg system|stat tracker|trackers?|commands)\b/i

type Obj = Record<string, unknown>
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/** Markdown and HTML to one line of plain text, cut at `max` characters. */
export function plainText(s: string, max: number): string {
  const t = s
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>`~|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t
}

/** A search result as the browser shows it (null if it isn't a lorebook we can fetch). */
export function toChubBook(n: Obj): ChubBook | null {
  const path = typeof n.fullPath === 'string' ? n.fullPath.trim() : ''
  if (!PATH.test(path)) return null
  const author = path.split('/')[1]
  const name = plainText(String(n.name ?? ''), 120) || 'Untitled lorebook'
  const tags = (Array.isArray(n.topics) ? n.topics : []).filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
  const tagline = plainText(String(n.tagline ?? ''), 200)
  const said = `${name} ${tagline} ${tags.join(' ')}`
  return {
    path,
    name,
    author,
    tagline,
    description: plainText(String(n.description ?? ''), 1500),
    tags: tags.slice(0, 8),
    tokens: typeof n.nTokens === 'number' && Number.isFinite(n.nTokens) ? Math.max(0, Math.round(n.nTokens)) : 0,
    nsfw: Boolean(n.nsfw_image) || ADULT.test(said),
    instructions: INSTRUCTIONS.test(`${name} ${tags.join(' ')}`),
    url: `${CHUB_SITE}/${path}`
  }
}

async function getJson(url: string, fetcher: Fetcher, max = 4 * 1024 * 1024): Promise<unknown> {
  let res: Response
  try {
    res = await fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new LoreError("Couldn't reach Chub. Check the internet connection and try again.")
  }
  if (res.status === 404) throw new LoreError("Chub doesn't have that lorebook any more.")
  if (!res.ok) throw new LoreError(`Chub answered ${res.status}. Try again in a little while.`)
  if (Number(res.headers.get('content-length') ?? 0) > max) throw new LoreError('This lorebook is too large (over 16 MB).')
  const text = await res.text()
  if (text.length > max) throw new LoreError('This lorebook is too large (over 16 MB).')
  try {
    return JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new LoreError("Chub's answer wasn't what Emberlight expected (the site may have changed).")
  }
}

/** One page of Chub's lorebooks for a search. */
export async function searchChub(s: ChubSearch, fetcher: Fetcher = fetch): Promise<ChubResults> {
  const page = Math.max(1, Math.min(500, Math.round(s.page) || 1))
  const params = new URLSearchParams({
    namespace: 'lorebooks',
    search: s.query.replace(/\s+/g, ' ').trim().slice(0, 100),
    first: String(CHUB_PAGE),
    page: String(page),
    sort: SORT[s.sort] ?? SORT.downloads,
    nsfw: String(s.nsfw),
    nsfl: String(s.nsfw)
  })
  if (s.fantasy) params.set('topics', 'Fantasy')
  const j = (await getJson(`${API}/search?${params}`, fetcher)) as { data?: { nodes?: unknown[]; count?: unknown } }
  const nodes = Array.isArray(j?.data?.nodes) ? j.data.nodes : []
  const all = nodes.map((n) => (n && typeof n === 'object' ? toChubBook(n as Obj) : null)).filter((b): b is ChubBook => b !== null)
  const books = s.nsfw ? all : all.filter((b) => !b.nsfw)
  const total = typeof j?.data?.count === 'number' ? j.data.count : all.length
  return { books, total, page, more: page * CHUB_PAGE < total && nodes.length > 0, hidden: all.length - books.length }
}

/**
 * Adds one of Chub's lorebooks to the library, crediting its author and linking its page (in
 * the book's description). A book already added is found again rather than added twice.
 */
export async function addFromChub(lore: LoreLibrary, path: string, fetcher: Fetcher = fetch): Promise<{ book: Lorebook; existing: boolean }> {
  const p = path.trim()
  if (!PATH.test(p)) throw new LoreError("That isn't a lorebook on Chub.")
  const url = `${CHUB_SITE}/${p}`
  const already = lore.list().find((b) => b.description.includes(url))
  const have = already ? lore.get(already.id) : null
  if (have) return { book: have, existing: true }
  const [, author, slug] = p.split('/')
  const meta = (await getJson(`${API}/api/lorebooks/${encodeURIComponent(author)}/${encodeURIComponent(slug)}`, fetcher)) as { node?: Obj }
  const node = meta?.node
  const id = Number(node?.id)
  if (!node || !Number.isInteger(id) || id <= 0) throw new LoreError("Chub doesn't have that lorebook any more.")
  // The file SillyTavern downloads: the book as World Info.
  const raw = await getJson(`${API}/api/v4/projects/${id}/repository/files/raw%252Fsillytavern_raw.json/raw`, fetcher, MAX_LORE_FILE)
  const name = plainText(String(node.name ?? ''), 120) || slug
  const parsed = fromWorldInfo(raw, name)
  if (!parsed.entries.length) throw new LoreError('This lorebook has no usable entries.')
  const about = plainText(String(node.tagline ?? ''), 400) || plainText(parsed.description, 1200)
  const credit = `From Chub, by ${author}: ${url}`
  const book = lore.add({ ...parsed, name, description: about ? `${about}\n\n${credit}` : credit })
  return { book, existing: false }
}
