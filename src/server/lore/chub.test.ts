import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { GameDb } from '../store/db'
import { LoreLibrary } from './library'
import { addFromChub, plainText, searchChub, toChubBook } from './chub'
import { registerLoreRoutes } from '../routes/lore'

/** Chub as a stand-in: answers by address, and remembers what was asked. */
function fakeChub(routes: Record<string, unknown | ((url: string) => Response)>) {
  const asked: string[] = []
  const fetcher = async (url: string) => {
    asked.push(url)
    for (const [prefix, answer] of Object.entries(routes)) {
      if (!url.startsWith(prefix)) continue
      return typeof answer === 'function' ? (answer as (u: string) => Response)(url) : new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response('{"errors":"not found"}', { status: 404 })
  }
  return { fetcher, asked }
}

const node = (over: Record<string, unknown> = {}) => ({
  id: 3844265,
  name: 'The Fantasy World of Adolion',
  fullPath: 'lorebooks/statuotw/the-fantasy-world-of-adolion-1a189c34',
  tagline: 'A large **fantasy** world',
  description: '<p>Elves, dwarves and [demons](https://example.com).</p>',
  topics: ['Adventure', 'Fantasy'],
  nTokens: 9250,
  nsfw_image: false,
  ...over
})
const worldInfo = {
  name: 'Adolion',
  entries: { '0': { uid: 0, key: ['adolion'], keysecondary: [], content: 'Adolion is a large fantasy world.', constant: false, selective: true, order: 100, position: 0, disable: false } }
}

describe('lorebooks from Chub', () => {
  let dir: string
  let db: GameDb
  let lore: LoreLibrary
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'emberlight-chub-'))
    db = new GameDb(dir)
    lore = new LoreLibrary(db)
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads a search result, and tells adult books and instructions apart from worlds', () => {
    expect(toChubBook(node())).toMatchObject({
      path: 'lorebooks/statuotw/the-fantasy-world-of-adolion-1a189c34',
      author: 'statuotw',
      tagline: 'A large fantasy world',
      description: 'Elves, dwarves and demons.',
      tokens: 9250,
      nsfw: false,
      instructions: false,
      url: 'https://chub.ai/lorebooks/statuotw/the-fantasy-world-of-adolion-1a189c34'
    })
    expect(toChubBook(node({ name: 'Fetish items', topics: [] }))?.nsfw).toBe(true)
    expect(toChubBook(node({ topics: ['SFW <-> NSFW', 'Fantasy'] }))?.nsfw).toBe(true)
    expect(toChubBook(node({ tagline: 'Strictly 18+' }))?.nsfw).toBe(true)
    expect(toChubBook(node({ nsfw_image: true }))?.nsfw).toBe(true)
    expect(toChubBook(node({ name: 'Essex and Sussex' }))?.nsfw).toBe(false)
    expect(toChubBook(node({ name: 'RPG System' }))?.instructions).toBe(true)
    expect(toChubBook(node({ name: 'Dating addon' }))?.instructions).toBe(true)
    // Only Chub's own lorebook paths.
    for (const fullPath of ['characters/someone/a-card', 'lorebooks/a/b/c', 'lorebooks/a/b?x=1', '../lorebooks/a/b', 'lorebooks/a']) expect(toChubBook(node({ fullPath }))).toBeNull()
    // Cut short at a word.
    expect(plainText('a '.repeat(50), 20)).toBe('a a a a a a a a a…')
  })

  it('searches Chub’s lorebooks, fantasy by default, and leaves adult ones out with NSFW off', async () => {
    const chub = fakeChub({
      'https://api.chub.ai/search': { data: { count: 60, nodes: [node(), node({ name: 'Fetish items', fullPath: 'lorebooks/x/fetish-items' }), node({ fullPath: 'not/a/lorebook' })] } }
    })
    const r = await searchChub({ query: '  elves  of the  wood ', page: 2, sort: 'rating', nsfw: false, fantasy: true }, chub.fetcher)
    expect(r).toMatchObject({ total: 60, page: 2, more: true, hidden: 1 })
    expect(r.books.map((b) => b.name)).toEqual(['The Fantasy World of Adolion'])
    const url = new URL(chub.asked[0])
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ namespace: 'lorebooks', search: 'elves of the wood', page: '2', sort: 'rating', nsfw: 'false', topics: 'Fantasy' })
    const all = await searchChub({ query: '', page: 3, sort: 'newest', nsfw: true, fantasy: false }, chub.fetcher)
    expect(all).toMatchObject({ hidden: 0, more: false })
    expect(all.books).toHaveLength(2)
    expect(new URL(chub.asked[1]).searchParams.get('topics')).toBeNull()
  })

  it('adds a lorebook with credit to its author, and finds it again rather than adding it twice', async () => {
    const chub = fakeChub({
      'https://api.chub.ai/api/lorebooks/statuotw/the-fantasy-world-of-adolion-1a189c34': { node: node() },
      'https://api.chub.ai/api/v4/projects/3844265/repository/files/raw%252Fsillytavern_raw.json/raw': worldInfo
    })
    const path = 'lorebooks/statuotw/the-fantasy-world-of-adolion-1a189c34'
    const first = await addFromChub(lore, path, chub.fetcher)
    expect(first.existing).toBe(false)
    expect(first.book).toMatchObject({ name: 'The Fantasy World of Adolion' })
    expect(first.book.entries.map((e) => e.content)).toEqual(['Adolion is a large fantasy world.'])
    expect(first.book.description).toBe('A large fantasy world\n\nFrom Chub, by statuotw: https://chub.ai/lorebooks/statuotw/the-fantasy-world-of-adolion-1a189c34')
    const again = await addFromChub(lore, path, chub.fetcher)
    expect(again).toMatchObject({ existing: true, book: { id: first.book.id } })
    expect(chub.asked).toHaveLength(2)
    expect(lore.list().filter((b) => !b.builtin)).toHaveLength(1)
  })

  it('says plainly what went wrong, and never asks Chub about anything but its lorebooks', async () => {
    const none = fakeChub({})
    await expect(addFromChub(lore, 'lorebooks/someone/gone', none.fetcher)).rejects.toThrow("Chub doesn't have that lorebook any more.")
    await expect(addFromChub(lore, 'https://evil.example/x', none.fetcher)).rejects.toThrow("That isn't a lorebook on Chub.")
    expect(none.asked).toEqual(['https://api.chub.ai/api/lorebooks/someone/gone'])
    const offline = { fetcher: async () => Promise.reject(new TypeError('fetch failed')) }
    await expect(searchChub({ query: '', page: 1, sort: 'downloads', nsfw: false, fantasy: true }, offline.fetcher)).rejects.toThrow("Couldn't reach Chub")
    const garbled = fakeChub({ 'https://api.chub.ai/search': () => new Response('<html>Cloudflare</html>', { status: 200 }) })
    await expect(searchChub({ query: '', page: 1, sort: 'downloads', nsfw: false, fantasy: true }, garbled.fetcher)).rejects.toThrow('the site may have changed')
    const busy = fakeChub({ 'https://api.chub.ai/search': () => new Response('slow down', { status: 429 }) })
    await expect(searchChub({ query: '', page: 1, sort: 'downloads', nsfw: false, fantasy: true }, busy.fetcher)).rejects.toThrow('Chub answered 429')
    const empty = fakeChub({ 'https://api.chub.ai/api/lorebooks/a/b': { node: node({ id: 7 }) }, 'https://api.chub.ai/api/v4/projects/7/': { name: 'Empty', entries: {} } })
    await expect(addFromChub(lore, 'lorebooks/a/b', empty.fetcher)).rejects.toThrow('no usable entries')
  })

  it('answers the browser through the app’s own routes', async () => {
    const app = new Hono()
    const seen: unknown[] = []
    registerLoreRoutes(app, lore, {
      search: async (s) => {
        seen.push(s)
        return { books: [], total: 0, page: s.page, more: false, hidden: 0 }
      },
      add: async () => ({ book: lore.create('From Chub'), existing: false })
    })
    const r = await app.request('/api/chub/search?q=elves&page=2&sort=bogus&nsfw=1&fantasy=0')
    expect(r.status).toBe(200)
    expect(seen[0]).toEqual({ query: 'elves', page: 2, sort: 'downloads', nsfw: true, fantasy: false })
    const added = await app.request('/api/chub/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: 'lorebooks/a/b' }) })
    expect(await added.json()).toMatchObject({ existing: false, book: { name: 'From Chub' } })
    expect((await app.request('/api/chub/add', { method: 'POST', body: 'nope' })).status).toBe(400)
  })
})
