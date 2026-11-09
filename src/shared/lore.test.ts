import { describe, expect, it } from 'vitest'
import { fromWorldInfo, keysMatch, normalizeEntry, selectLore, toWorldInfo, type LoreEntry } from './lore'

const e = (p: Partial<LoreEntry>): LoreEntry => normalizeEntry({ content: p.name ?? 'x', ...p })
const names = (xs: LoreEntry[]) => xs.map((x) => x.name)

describe('lore matching', () => {
  it('applies secondary-key logic', () => {
    const base = { keys: ['king'], secondaryKeys: ['crown', 'throne'] }
    const t = 'The king sits on his throne.'
    expect(keysMatch(e({ ...base, logic: 'and_any' }), t)).toBe(true)
    expect(keysMatch(e({ ...base, logic: 'and_all' }), t)).toBe(false)
    expect(keysMatch(e({ ...base, logic: 'not_any' }), t)).toBe(false)
    expect(keysMatch(e({ ...base, logic: 'not_all' }), t)).toBe(true)
    expect(keysMatch(e({ keys: ['king'] }), 'The kingdom.')).toBe(false)
    expect(keysMatch(e({ keys: ['king'], wholeWords: false }), 'The kingdom.')).toBe(true)
    expect(keysMatch(e({ keys: ['King'], caseSensitive: true }), 'the king')).toBe(false)
  })

  it('looks only as far back as the scan depth', () => {
    const history = ['We passed the old mill.', 'Rain.', 'More rain.', 'Still raining.', 'A crow.']
    const near = e({ name: 'mill', keys: ['mill'], content: 'Wheel.' })
    const deep = e({ name: 'mill deep', keys: ['mill'], scanDepth: 10, content: 'Grinds grain.' })
    expect(names(selectLore([near, deep], history, { budgetChars: 9999 }))).toEqual(['mill deep'])
  })

  it('gives scarce space to what came up most recently', () => {
    const old = e({ name: 'mill', keys: ['mill'], priority: 500, content: 'm'.repeat(300) })
    const fresh = e({ name: 'abbey', keys: ['abbey'], priority: 1, content: 'a'.repeat(300) })
    const history = ['We passed the old mill.', 'Rain.', 'I ask about the abbey.']
    expect(names(selectLore([old, fresh], history, { budgetChars: 400 }))).toEqual(['abbey'])
    // With room for both, they're written in priority order.
    expect(names(selectLore([old, fresh], history, { budgetChars: 9999 }))).toEqual(['mill', 'abbey'])
  })

  it('lets entries wake other entries, but not past the opt-outs', () => {
    const order = e({ name: 'order', keys: ['Ashen Order'], content: 'The Ashen Order guards the Vault of Cinders.' })
    const vault = e({ name: 'vault', keys: ['Vault of Cinders'], content: 'The vault holds the first flame.' })
    const flame = e({ name: 'flame', keys: ['first flame'], excludeRecursion: true, content: 'A secret.' })
    expect(names(selectLore([order, vault, flame], ['I ask about the Ashen Order.'], { budgetChars: 9999 }))).toEqual(['order', 'vault'])
    expect(names(selectLore([{ ...order, preventRecursion: true }, vault], ['I ask about the Ashen Order.'], { budgetChars: 9999 }))).toEqual(['order'])
  })

  it('keeps one entry per group, honours chance and budget', () => {
    const a = e({ name: 'weather calm', keys: ['sky'], group: 'weather', priority: 5 })
    const b = e({ name: 'weather storm', keys: ['sky'], group: 'weather', priority: 9 })
    const c = e({ name: 'rare', keys: ['sky'], probability: 30 })
    expect(names(selectLore([a, b, c], ['The sky.'], { budgetChars: 9999, rng: () => 0.5 }))).toEqual(['weather storm'])
    // A 30% entry comes in when the roll is under 30; it has the higher priority, so it goes first.
    expect(names(selectLore([a, b, c], ['The sky.'], { budgetChars: 9999, rng: () => 0.1 }))).toEqual(['rare', 'weather storm'])
    const big = e({ name: 'big', constant: true, content: 'x'.repeat(500) })
    const small = e({ name: 'small', keys: ['sky'], content: 'y'.repeat(600) })
    expect(names(selectLore([big, small], ['The sky.'], { budgetChars: 800 }))).toEqual(['big'])
  })
})

describe('SillyTavern World Info files', () => {
  const wi = {
    name: 'The Marches',
    entries: {
      0: { uid: 0, key: ['Wending'], keysecondary: [], comment: 'Wending', content: 'A toll town.', constant: false, selective: true, selectiveLogic: 0, order: 50, disable: false, probability: 100, useProbability: true, group: '', scanDepth: null, caseSensitive: null, matchWholeWords: null },
      1: { uid: 1, key: ['duke'], keysecondary: ['dead', 'slain'], comment: 'Duke', content: 'The duke lives.', selectiveLogic: 2, order: 10, disable: true, probability: 40, useProbability: true, scanDepth: 6 },
      2: { uid: 2, key: [], comment: 'World', content: 'Always true.', constant: true }
    }
  }

  it('reads a World Info file', () => {
    const b = fromWorldInfo(wi)
    expect(b.name).toBe('The Marches')
    expect(b.entries).toHaveLength(3)
    expect(b.entries[0]).toMatchObject({ name: 'Wending', keys: ['Wending'], priority: 50, wholeWords: true, caseSensitive: false, enabled: true })
    expect(b.entries[1]).toMatchObject({ logic: 'not_any', secondaryKeys: ['dead', 'slain'], enabled: false, probability: 40, scanDepth: 6 })
    expect(b.entries[2].constant).toBe(true)
  })

  it('writes it back so SillyTavern reads the same thing', () => {
    const b = fromWorldInfo(wi)
    const again = fromWorldInfo(JSON.parse(JSON.stringify(toWorldInfo({ id: 'x', ...b }))))
    expect(again.entries.map(({ id: _, ...rest }) => rest)).toEqual(b.entries.map(({ id: _, ...rest }) => rest))
  })

  it('reads a character book, and turns away a card', () => {
    const book = fromWorldInfo({ name: 'Mira', entries: [{ keys: ['marsh'], content: 'Wet.', insertion_order: 3, enabled: true, extensions: { case_sensitive: true } }] })
    expect(book.entries[0]).toMatchObject({ keys: ['marsh'], priority: 3, caseSensitive: true })
    expect(() => fromWorldInfo({ spec: 'chara_card_v2', data: { name: 'Mira' } })).toThrow(/character card/)
  })
})
