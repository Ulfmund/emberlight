/**
 * Long-term memory (docs/spec/07-memory-and-lore.md): the people and places met in play,
 * and the story condensed into layered summaries (scenes → chapters → the story so far).
 *
 * Memory is built from events, like the rest of the game state, so it follows the branch
 * being played: rewind past the moment you met someone and the record of them is gone too.
 */

export type EntityKind = 'person' | 'place'
export type Attitude = 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'devoted'
export type EntityStatus = 'alive' | 'dead' | 'missing' | 'unknown'

export const ATTITUDES: Attitude[] = ['hostile', 'unfriendly', 'neutral', 'friendly', 'devoted']

export type Entity = {
  id: string
  kind: EntityKind
  name: string
  aliases: string[]
  /** One line: who or what they are. */
  summary: string
  /** Things learned about them, oldest first. */
  facts: string[]
  status: EntityStatus
  /** People only: how they feel about the player character. */
  attitude?: Attitude
  firstSeenDay: number
  lastSeenDay: number
  /** Bigger = seen more recently (an update counter, for sorting). */
  lastSeen: number
  mentions: number
}

export type Summary = {
  level: 'scene' | 'chapter'
  title: string
  text: string
  /** First and last story message covered. */
  from: string
  to: string
  fromDay: number
  toDay: number
}

export type Memory = {
  entities: Entity[]
  scenes: Summary[]
  chapters: Summary[]
  /** "The story so far": a running summary of everything in the chapters. */
  arc: string
}

/** Memory events (part of the GameEvent union). */
export type MemoryEvent =
  | {
      type: 'entity'
      kind: EntityKind
      name: string
      aliases?: string[]
      summary?: string
      facts?: string[]
      status?: EntityStatus
      attitude?: Attitude
      day: number
    }
  | { type: 'summary'; summary: Summary }
  | { type: 'arc'; text: string }

export const MAX_FACTS = 12

export const emptyMemory = (): Memory => ({ entities: [], scenes: [], chapters: [], arc: '' })

// ---- Names ----------------------------------------------------------------------------------

/** Words that don't identify anyone on their own. */
const TITLES = new Set(
  'the a an old young sir lady lord dame master mistress brother sister father mother captain sergeant king queen prince princess elder little big mister mrs mr ser goodwife goodman'.split(' ')
)

export const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const keyTokens = (s: string) => normName(s).split(/[\s-]+/).filter((t) => t.length > 1 && !TITLES.has(t))

/**
 * Whether two names mean the same one: equal, or every telling word of the shorter is in
 * the longer ("Tam" and "Old Tam", "Mira" and "Mira Ashdown").
 */
export function sameName(a: string, b: string): boolean {
  const na = normName(a)
  const nb = normName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const ta = keyTokens(a)
  const tb = keyTokens(b)
  if (!ta.length || !tb.length) return false
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return short.every((t) => long.includes(t))
}

/** Places must match exactly ("Hollin's Ford" is not "Hollin's Ford inn"); people more loosely. */
export const samePlace = (a: string, b: string) => {
  const strip = (s: string) => normName(s).replace(/^the /, '')
  return strip(a) !== '' && strip(a) === strip(b)
}

export function findEntity(m: Memory, kind: EntityKind, name: string, aliases: string[] = []): Entity | undefined {
  const names = [name, ...aliases]
  const same = kind === 'place' ? samePlace : sameName
  return m.entities.find((e) => e.kind === kind && [e.name, ...e.aliases].some((x) => names.some((n) => same(x, n))))
}

// ---- Building memory from events ------------------------------------------------------------

const similar = (a: string, b: string) => {
  const na = normName(a)
  const nb = normName(b)
  return na === nb || (na.length > 20 && nb.length > 20 && (na.includes(nb) || nb.includes(na)))
}

/** Applies memory events in order. Mutates and returns `m` (memory can get big; no copies). */
export function applyMemoryEvent(m: Memory, ev: MemoryEvent, counter: { n: number }): Memory {
  switch (ev.type) {
    case 'entity': {
      const name = ev.name.trim()
      if (!name) break
      const aliases = (ev.aliases ?? []).map((a) => a.trim()).filter(Boolean)
      let e = findEntity(m, ev.kind, name, aliases)
      counter.n++
      if (!e) {
        e = {
          id: `${ev.kind}:${normName(name)}`,
          kind: ev.kind,
          name,
          aliases: [],
          summary: '',
          facts: [],
          status: 'alive',
          firstSeenDay: ev.day,
          lastSeenDay: ev.day,
          lastSeen: counter.n,
          mentions: 0
        }
        if (ev.kind === 'place') e.status = 'unknown'
        m.entities.push(e)
      } else {
        // Their real name came out ("Sibbert", other names: "grey-bearded man"), or a fuller one
        // ("Tam" → "Old Tam Reed"): use it, and keep the old one as another name.
        const revealed = !sameName(e.name, name) && aliases.some((a) => sameName(a, e!.name))
        const words = (s: string) => normName(s).replace(/^(the|a|an) /, '').split(' ').length
        const fuller = sameName(e.name, name) && words(name) > words(e.name)
        if (revealed || fuller) {
          if (!e.aliases.some((a) => normName(a) === normName(e!.name))) e.aliases.push(e.name)
          e.aliases = e.aliases.filter((a) => normName(a) !== normName(name))
          e.name = name
        }
      }
      for (const a of aliases) if (normName(a) !== normName(e.name) && !e.aliases.some((x) => normName(x) === normName(a))) e.aliases.push(a)
      e.aliases = e.aliases.slice(-6)
      if (ev.summary?.trim()) e.summary = ev.summary.trim()
      for (const f of ev.facts ?? []) {
        const t = f.trim()
        if (t && !e.facts.some((x) => similar(x, t))) e.facts.push(t)
      }
      if (e.facts.length > MAX_FACTS) e.facts = e.facts.slice(-MAX_FACTS)
      if (ev.status) e.status = ev.status
      if (ev.attitude && e.kind === 'person') e.attitude = ev.attitude
      e.lastSeenDay = ev.day
      e.lastSeen = counter.n
      e.mentions++
      break
    }
    case 'summary':
      if (ev.summary.level === 'scene') m.scenes.push(ev.summary)
      else m.chapters.push(ev.summary)
      break
    case 'arc':
      m.arc = ev.text.trim()
      break
  }
  return m
}

const isMemoryEvent = (ev: { type: string }): ev is MemoryEvent => ev.type === 'entity' || ev.type === 'summary' || ev.type === 'arc'

export function projectMemory(events: ReadonlyArray<MemoryEvent | { type: string }>): Memory {
  const m = emptyMemory()
  const counter = { n: 0 }
  for (const ev of events) if (isMemoryEvent(ev)) applyMemoryEvent(m, ev, counter)
  return m
}

// ---- Choosing what the DM sees ----------------------------------------------------------------

const wordRe = (s: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu')

/** Whether `text` mentions the entity by name, alias, or a telling part of its name. */
export function mentions(text: string, e: Entity): boolean {
  for (const n of [e.name, ...e.aliases]) {
    if (wordRe(n.trim()).test(text)) return true
    for (const t of keyTokens(n)) if (t.length >= 3 && wordRe(t).test(text)) return true
  }
  return false
}

/**
 * The people and places worth reminding the DM of: anyone mentioned in the recent story,
 * the current place, then whoever was seen most recently, up to `max`.
 */
export function relevantEntities(m: Memory, recent: string, location: string | null, max: number, exclude: string[] = []): Entity[] {
  const skip = (e: Entity) => exclude.some((x) => sameName(x, e.name))
  const live = m.entities.filter((e) => !skip(e))
  const picked: Entity[] = []
  const add = (e: Entity) => {
    if (picked.length < max && !picked.includes(e)) picked.push(e)
  }
  const byRecent = [...live].sort((a, b) => b.lastSeen - a.lastSeen)
  if (location) for (const e of live) if (e.kind === 'place' && [e.name, ...e.aliases].some((n) => samePlace(n, location))) add(e)
  for (const e of byRecent) if (mentions(recent, e)) add(e)
  for (const e of byRecent) if (e.kind === 'person' && e.status !== 'dead') add(e)
  return picked
}

export function entityLine(e: Entity, facts: number): string {
  const tags = [
    e.kind === 'place' ? 'place' : null,
    e.aliases.length ? `also called ${e.aliases.slice(0, 3).join(', ')}` : null,
    e.kind === 'person' && e.attitude ? `${e.attitude} toward the player` : null,
    e.status === 'dead' ? 'DEAD' : e.status === 'missing' ? 'missing' : null,
    `last seen day ${e.lastSeenDay}`
  ].filter(Boolean)
  const f = facts > 0 && e.facts.length ? ` Known: ${e.facts.slice(-facts).join('; ')}.` : ''
  return `- ${e.name} (${tags.join(', ')}): ${e.summary || 'no description yet'}.${f}`.replace(/\.\./g, '.')
}

const dayRange = (s: Summary) => (s.fromDay === s.toDay ? `day ${s.fromDay}` : `days ${s.fromDay}–${s.toDay}`)

/**
 * The story-so-far block. `covered(s)` says whether a summary's messages are still shown to
 * the model word for word (then it's left out). Newest summaries win when space is short.
 */
export function storySoFar(m: Memory, budgetChars: number, covered: (s: Summary) => boolean): string {
  if (budgetChars <= 0) return ''
  const lastChapterTo = m.chapters.at(-1)?.to
  const chapterIdx = (s: Summary) => m.scenes.findIndex((x) => x.to === s.to)
  const cut = lastChapterTo ? chapterIdx(m.chapters.at(-1)!) : -1
  const scenes = m.scenes.slice(cut + 1).filter((s) => !covered(s))
  const chapters = m.chapters.filter((s) => !covered(s))
  const parts: string[] = []
  let used = 0
  const take = (line: string) => {
    if (used + line.length > budgetChars) return false
    parts.unshift(line)
    used += line.length
    return true
  }
  for (const s of [...scenes].reverse()) if (!take(`Scene, ${dayRange(s)}: ${s.title}. ${s.text}`)) break
  for (const s of [...chapters].reverse()) if (!take(`Chapter, ${dayRange(s)}: ${s.title}. ${s.text}`)) break
  if (m.arc && chapters.length && used + m.arc.length < budgetChars) parts.unshift(`Overall: ${m.arc}`)
  return parts.join('\n')
}
