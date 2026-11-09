/**
 * Lorebooks (docs/spec/07-memory-and-lore.md#lorebooks): world knowledge written up front, given
 * to the DM only when the story touches it. Compatible with SillyTavern World Info files.
 *
 * Supported: primary keys, secondary keys with AND ANY / AND ALL / NOT ANY / NOT ALL, regex
 * keys, case-sensitive and whole-word matching, constant entries, scan depth, priority,
 * probability, groups (one entry per group), recursion (entries triggering entries), insertion
 * positions, sticky / cooldown / delay, character filters, and per-book budgets.
 * Not yet: semantic matching.
 */

export type SecondaryLogic = 'and_any' | 'and_all' | 'not_any' | 'not_all'

/** Where an entry goes: with the character, with the scene's world notes, or in the chat itself. */
export type LorePosition = 'before_char' | 'after_char' | 'scene' | 'depth'
export const POSITION_LABEL: Record<LorePosition, string> = {
  before_char: 'Before the character',
  after_char: 'After the character',
  scene: 'With the world notes',
  depth: 'In the story, N messages back'
}

export type LoreEntry = {
  id: string
  /** A label for the editor (SillyTavern's "comment"). */
  name: string
  keys: string[]
  secondaryKeys: string[]
  logic: SecondaryLogic
  content: string
  /** Always included, no keyword needed. */
  constant: boolean
  enabled: boolean
  caseSensitive: boolean
  wholeWords: boolean
  /** Higher goes first when space is short. */
  priority: number
  /** Chance (0–100) to be included when triggered. */
  probability: number
  /** Only one entry per group is used (the highest priority). Empty: no group. */
  group: string
  /** How many recent messages to search; null uses the default. */
  scanDepth: number | null
  /** This entry's text can't trigger other entries. */
  preventRecursion: boolean
  /** Other entries' text can't trigger this one. */
  excludeRecursion: boolean
  /** Where it goes in the prompt (and how many messages back, for "depth"). */
  position: LorePosition
  depth: number
  /** Stays in for this many replies after it's triggered. */
  sticky: number
  /** Can't be triggered again for this many replies after that. */
  cooldown: number
  /** Can't be triggered until the story has this many messages. */
  delay: number
  /** Only when one of these characters is in the story (or, with `excludeCharacters`, only when none is). */
  characters: string[]
  excludeCharacters: boolean
}

export type Lorebook = {
  id: string
  name: string
  description: string
  entries: LoreEntry[]
  /** Used by every adventure, not only the ones it's attached to. */
  global?: boolean
  /** At most this many characters of this book in one prompt (0: no limit of its own). */
  budget?: number
}
export type LorebookSummary = { id: string; name: string; description: string; entries: number; builtin: boolean; updatedAt: number; global?: boolean }

export const LOGIC_LABEL: Record<SecondaryLogic, string> = {
  and_any: 'and any of',
  and_all: 'and all of',
  not_any: 'and none of',
  not_all: 'and not all of'
}

let counter = 0
export const newEntryId = () => `e${Date.now().toString(36)}${(counter++).toString(36)}`

/** A complete entry from a partial one (older saves and card books lack the newer fields). */
export function normalizeEntry(e: Partial<LoreEntry> & { selective?: boolean }): LoreEntry {
  return {
    id: e.id || newEntryId(),
    name: e.name ?? '',
    keys: e.keys ?? [],
    // `selective: false` (older card books) means the secondary keys are switched off.
    secondaryKeys: e.selective === false ? [] : (e.secondaryKeys ?? []),
    logic: e.logic ?? 'and_any',
    content: e.content ?? '',
    constant: e.constant ?? false,
    enabled: e.enabled ?? true,
    caseSensitive: e.caseSensitive ?? false,
    wholeWords: e.wholeWords ?? true,
    priority: e.priority ?? 100,
    probability: e.probability ?? 100,
    group: e.group ?? '',
    scanDepth: e.scanDepth ?? null,
    preventRecursion: e.preventRecursion ?? false,
    excludeRecursion: e.excludeRecursion ?? false,
    position: e.position && e.position in POSITION_LABEL ? e.position : 'scene',
    depth: clampInt(e.depth, 0, 100, 4),
    sticky: clampInt(e.sticky, 0, 100, 0),
    cooldown: clampInt(e.cooldown, 0, 100, 0),
    delay: clampInt(e.delay, 0, 10_000, 0),
    characters: (e.characters ?? []).map((n) => n.trim()).filter(Boolean).slice(0, 40),
    excludeCharacters: e.excludeCharacters ?? false
  }
}

const clampInt = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d)

// ---- Matching -------------------------------------------------------------------------------

function matcher(key: string, e: LoreEntry): ((text: string) => boolean) | null {
  const re = /^\/(.+)\/([gimsuy]*)$/.exec(key.trim())
  if (re) {
    try {
      const r = new RegExp(re[1], re[2].replace('g', ''))
      return (t) => r.test(t)
    } catch {
      return null
    }
  }
  const k = key.trim()
  if (!k) return null
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const whole = e.wholeWords && /^[\p{L}\p{N}]/u.test(k) && /[\p{L}\p{N}]$/u.test(k)
  const r = new RegExp(whole ? `(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])` : escaped, `u${e.caseSensitive ? '' : 'i'}`)
  return (t) => r.test(t)
}

const anyKey = (keys: string[], e: LoreEntry, text: string) => keys.some((k) => matcher(k, e)?.(text) ?? false)
const allKeys = (keys: string[], e: LoreEntry, text: string) => keys.every((k) => matcher(k, e)?.(text) ?? false)

/** Whether an entry's keywords match `text` (ignores constant, enabled and probability). */
export function keysMatch(e: LoreEntry, text: string): boolean {
  if (!anyKey(e.keys, e, text)) return false
  const sec = e.secondaryKeys.filter((k) => k.trim())
  if (!sec.length) return true
  switch (e.logic) {
    case 'and_any':
      return anyKey(sec, e, text)
    case 'and_all':
      return allKeys(sec, e, text)
    case 'not_any':
      return !anyKey(sec, e, text)
    case 'not_all':
      return !allKeys(sec, e, text)
  }
}

export type LoreOptions = {
  budgetChars: number
  /** Messages searched by entries without their own scan depth. */
  defaultDepth?: number
  /** Rounds of entries triggering entries. */
  recursion?: number
  rng?: () => number
  /** For sticky and cooldown: how many replies ago each entry was last triggered (1 = the last reply). */
  firedAgo?: Map<string, number>
  /** For delay: how many messages the story has. */
  messages?: number
  /** For character filters: who is in the story now (names). */
  present?: string[]
  /** Per-book character limits, by book id (entries carry their `book`). */
  bookBudgets?: Record<string, number>
}

/** An entry as a story uses it: which book it came from (for that book's budget). */
export type BookEntry = LoreEntry & { book?: string }

/** Whether a character filter lets an entry in, given who's in the story. */
function charactersAllow(e: LoreEntry, present: string[] | undefined): boolean {
  if (!e.characters.length) return true
  const here = (present ?? []).map((n) => n.toLowerCase().trim()).filter(Boolean)
  const named = e.characters.some((c) => {
    const n = c.toLowerCase()
    return here.some((h) => h === n || h.split(/\s+/)[0] === n || n.split(/\s+/)[0] === h)
  })
  return e.excludeCharacters ? !named : named
}

/**
 * Picks the entries that apply now. `history` is the story, oldest first; each entry searches
 * its last few messages. Returns entries in prompt order, within the character budget.
 */
export function selectLore<E extends BookEntry>(entries: E[], history: string[], opts: LoreOptions): E[] {
  return selectLoreDetailed(entries, history, opts).entries
}

/**
 * The same, and which entries were triggered this time (by their keys, being constant, or by
 * other entries), as opposed to still being in from an earlier trigger (sticky). The story keeps
 * the triggered ones with the reply, for sticky and cooldown next time.
 */
export function selectLoreDetailed<E extends BookEntry>(entries: E[], history: string[], opts: LoreOptions): { entries: E[]; triggered: string[] } {
  const depth = opts.defaultDepth ?? 4
  const rng = opts.rng ?? Math.random
  const ago = (e: LoreEntry) => opts.firedAgo?.get(e.id)
  // Timed effects: a sticky entry stays in for its replies; then (or right away) its cooldown
  // keeps it out; a delayed one waits until the story is long enough.
  const stuck = (e: LoreEntry) => e.sticky > 0 && ago(e) !== undefined && ago(e)! <= e.sticky
  const cooling = (e: LoreEntry) => e.cooldown > 0 && ago(e) !== undefined && ago(e)! > e.sticky && ago(e)! <= e.sticky + e.cooldown
  const early = (e: LoreEntry) => e.delay > 0 && (opts.messages ?? history.length) < e.delay
  const live = entries.filter((e) => e.enabled && e.content.trim() && !early(e) && charactersAllow(e, opts.present))
  const textFor = (e: LoreEntry) => history.slice(-Math.max(1, e.scanDepth ?? depth)).join('\n')

  /** Entry → how many messages back it came up (0 = the newest). Lower wins when space is short. */
  const active = new Map<LoreEntry, number>()
  const rolled = new Map<LoreEntry, boolean>()
  const passes = (e: LoreEntry) => {
    if (e.probability >= 100) return true
    if (!rolled.has(e)) rolled.set(e, rng() * 100 < e.probability)
    return rolled.get(e)!
  }
  const recency = (e: LoreEntry) => {
    const n = Math.max(1, e.scanDepth ?? depth)
    for (let back = 0; back < Math.min(n, history.length); back++) if (keysMatch(e, history[history.length - 1 - back])) return back
    return n // matched only across several messages
  }
  const triggered = new Set<LoreEntry>()
  for (const e of live) {
    if (stuck(e)) {
      // Still in from an earlier trigger: no keyword needed, no new roll.
      active.set(e, 0.25)
      continue
    }
    if (cooling(e)) continue
    if (e.constant) {
      if (passes(e)) active.set(e, -1)
    } else if (keysMatch(e, textFor(e)) && passes(e)) active.set(e, recency(e))
    if (active.has(e)) triggered.add(e)
  }

  // Recursion: what the chosen entries say can wake up others ("the Order" → its entry). They
  // rank just behind whatever woke them.
  for (let round = 0; round < (opts.recursion ?? 2); round++) {
    const speakers = [...active.entries()].filter(([e]) => !e.preventRecursion)
    let added = false
    for (const e of live) {
      if (active.has(e) || e.excludeRecursion || e.constant || cooling(e)) continue
      const by = speakers.filter(([s]) => keysMatch(e, s.content))
      if (by.length && passes(e)) {
        active.set(e, Math.min(...by.map(([, r]) => Math.max(0, r))) + 0.5)
        triggered.add(e)
        added = true
      }
    }
    if (!added) break
  }

  // One per group: the highest priority wins.
  const byGroup = new Map<string, LoreEntry>()
  const chosen: LoreEntry[] = []
  for (const e of active.keys()) {
    const g = e.group.trim().toLowerCase()
    if (!g) chosen.push(e)
    else if (!byGroup.has(g) || byGroup.get(g)!.priority < e.priority) byGroup.set(g, e)
  }
  chosen.push(...byGroup.values())

  // Space goes to constant entries, then to what came up most recently, then by priority; each
  // book can also have a limit of its own.
  const ranked = [...chosen].sort((a, b) => Number(b.constant) - Number(a.constant) || active.get(a)! - active.get(b)! || b.priority - a.priority)
  const keep = new Set<LoreEntry>()
  let used = 0
  const usedBy = new Map<string, number>()
  for (const e of ranked) {
    if (used + e.content.length > opts.budgetChars && keep.size) continue
    const book = (e as BookEntry).book
    const limit = book ? opts.bookBudgets?.[book] : undefined
    if (book && limit && (usedBy.get(book) ?? 0) + e.content.length > limit && (usedBy.get(book) ?? 0) > 0) continue
    keep.add(e)
    used += e.content.length
    if (book) usedBy.set(book, (usedBy.get(book) ?? 0) + e.content.length)
  }
  // Written out in priority order (the author's intended reading order).
  const out = chosen.filter((e) => keep.has(e)).sort((a, b) => Number(b.constant) - Number(a.constant) || b.priority - a.priority) as E[]
  return { entries: out, triggered: out.filter((e) => triggered.has(e)).map((e) => e.id) }
}

// ---- SillyTavern World Info files -------------------------------------------------------------

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : typeof v === 'string' && v.trim() ? v.split(',').map((x) => x.trim()).filter(Boolean) : [])
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d)
const LOGIC_FROM_ST: SecondaryLogic[] = ['and_any', 'not_all', 'not_any', 'and_all']

export class LoreError extends Error {}

/** Reads a SillyTavern World Info file (or a character book) into a lorebook. */
export function fromWorldInfo(raw: unknown, fallbackName = 'Imported lorebook'): Omit<Lorebook, 'id'> {
  if (!isObj(raw)) throw new LoreError("This file isn't a lorebook.")
  // A whole character card: use its embedded book.
  const card = isObj(raw.data) && isObj(raw.data.character_book) ? raw.data.character_book : null
  const book = card ?? raw
  const list = Array.isArray(book.entries) ? book.entries : isObj(book.entries) ? Object.values(book.entries) : null
  if (!list) throw new LoreError(raw.spec || raw.name || raw.first_mes ? 'This is a character card, not a lorebook. Import it as a character instead.' : "This file isn't a lorebook (it has no entries).")
  const entries = list.filter(isObj).slice(0, 2000).map((e, i): LoreEntry => {
    const ext = isObj(e.extensions) ? e.extensions : {}
    // World Info files say `key`/`keysecondary`/`disable`/`order`; character books say `keys`/`secondary_keys`/`enabled`/`insertion_order`.
    const stLogic = num(e.selectiveLogic ?? ext.selectiveLogic, 0)
    const depth = e.scanDepth ?? ext.scan_depth
    const prob = e.useProbability === false ? 100 : num(e.probability ?? ext.probability, 100)
    return normalizeEntry({
      selective: e.selective === false ? false : undefined,
      id: `e${i.toString(36)}${Date.now().toString(36).slice(-4)}`,
      name: String(e.comment ?? e.name ?? '').slice(0, 200),
      keys: strs(e.key ?? e.keys).slice(0, 60),
      secondaryKeys: strs(e.keysecondary ?? e.secondary_keys).slice(0, 60),
      logic: LOGIC_FROM_ST[stLogic] ?? 'and_any',
      content: String(e.content ?? '').slice(0, 20_000),
      constant: e.constant === true,
      enabled: e.disable !== true && e.enabled !== false,
      caseSensitive: (e.caseSensitive ?? e.case_sensitive ?? ext.case_sensitive) === true,
      wholeWords: (e.matchWholeWords ?? ext.match_whole_words) !== false,
      priority: num(e.order ?? e.insertion_order ?? e.priority, 100),
      probability: Math.max(0, Math.min(100, prob)),
      group: String(e.group ?? ext.group ?? '').slice(0, 80),
      scanDepth: depth == null || depth === '' ? null : Math.max(1, Math.min(100, num(depth, 4))),
      preventRecursion: (e.preventRecursion ?? ext.prevent_recursion) === true,
      excludeRecursion: (e.excludeRecursion ?? ext.exclude_recursion) === true,
      position: positionFromST(e.position ?? ext.position),
      depth: num(e.depth ?? ext.depth, 4),
      sticky: num(e.sticky ?? ext.sticky, 0),
      cooldown: num(e.cooldown ?? ext.cooldown, 0),
      delay: num(e.delay ?? ext.delay, 0),
      characters: isObj(e.characterFilter) ? strs(e.characterFilter.names) : [],
      excludeCharacters: isObj(e.characterFilter) ? e.characterFilter.isExclude === true : false
    })
  })
  const tokens = num(book.token_budget, 0)
  return {
    name: String(book.name ?? raw.name ?? fallbackName).trim().slice(0, 120) || fallbackName,
    description: String(book.description ?? '').slice(0, 2000),
    entries: entries.filter((e) => e.content.trim() && (e.constant || e.keys.length)),
    ...(tokens > 0 ? { budget: Math.round(tokens * 3) } : {})
  }
}

/** SillyTavern positions: 0 before the character, 1 after, 2–3 the author's note, 4 at a depth, 5–6 around examples. Card books say "before_char"/"after_char". */
function positionFromST(v: unknown): LorePosition {
  if (v === 'before_char') return 'before_char'
  if (v === 'after_char') return 'after_char'
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (n === 0 || n === 5) return 'before_char'
  if (n === 1 || n === 6) return 'after_char'
  if (n === 4) return 'depth'
  return 'scene'
}
const POSITION_TO_ST: Record<LorePosition, number> = { before_char: 0, after_char: 1, scene: 2, depth: 4 }

/** Writes a lorebook as a SillyTavern World Info file. */
export function toWorldInfo(book: Lorebook): Obj {
  const entries: Obj = {}
  book.entries.forEach((e, uid) => {
    entries[String(uid)] = {
      uid,
      key: e.keys,
      keysecondary: e.secondaryKeys,
      comment: e.name,
      content: e.content,
      constant: e.constant,
      selective: e.secondaryKeys.length > 0,
      selectiveLogic: LOGIC_FROM_ST.indexOf(e.logic),
      order: e.priority,
      disable: !e.enabled,
      probability: e.probability,
      useProbability: e.probability < 100,
      group: e.group,
      scanDepth: e.scanDepth,
      caseSensitive: e.caseSensitive,
      matchWholeWords: e.wholeWords,
      preventRecursion: e.preventRecursion,
      excludeRecursion: e.excludeRecursion,
      position: POSITION_TO_ST[e.position],
      depth: e.depth,
      sticky: e.sticky,
      cooldown: e.cooldown,
      delay: e.delay,
      characterFilter: { isExclude: e.excludeCharacters, names: e.characters, tags: [] }
    }
  })
  return { name: book.name, description: book.description, entries }
}
