/**
 * Long-term memory (docs/spec/07-memory-and-lore.md): the people, places, factions, quests and
 * notable items of the story, and the story condensed into layered summaries (scenes →
 * chapters → the story so far).
 *
 * Memory is built from events, like the rest of the game state, so it follows the branch
 * being played: rewind past the moment you met someone and the record of them is gone too.
 */
import type { RaceId, SexId } from './rules/tables'
import { bornAt, isRace, PERSON_LIMITS, personTags } from './people'

export type EntityKind = 'person' | 'place' | 'faction' | 'quest' | 'item'
export type Attitude = 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'devoted'
/** People (and things): alive, dead, missing, unknown. Quests: active, done, failed. */
export type EntityStatus = 'alive' | 'dead' | 'missing' | 'unknown' | 'active' | 'done' | 'failed'
export const QUEST_STATUSES: EntityStatus[] = ['active', 'done', 'failed']
const OTHER_STATUSES: EntityStatus[] = ['alive', 'dead', 'missing', 'unknown']

/** How one character is tied to another ("granddaughter of" Old Tam). */
export type Tie = { how: string; name: string }

/** "granddaughter of: Old Tam" → a tie (null if it isn't one). */
export function parseTie(s: string): Tie | null {
  const at = s.indexOf(':')
  if (at < 1) return null
  const how = s.slice(0, at).replace(/\s+/g, ' ').trim().slice(0, 60)
  const name = s.slice(at + 1).replace(/\s+/g, ' ').trim().slice(0, 60)
  return how && name ? { how, name } : null
}

export const ATTITUDES: Attitude[] = ['hostile', 'unfriendly', 'neutral', 'friendly', 'devoted']

/** How someone is tied to the player character (family matters: a child can carry the tale on). */
export const RELATIONS = ['none', 'child', 'parent', 'sibling', 'spouse', 'lover', 'friend', 'ally', 'companion', 'employer', 'rival', 'enemy'] as const
export type Relation = (typeof RELATIONS)[number]
export const RELATION_LABEL: Record<Relation, string> = {
  none: 'No tie',
  child: 'your child',
  parent: 'your parent',
  sibling: 'your sibling',
  spouse: 'your spouse',
  lover: 'your lover',
  friend: 'your friend',
  ally: 'your ally',
  companion: 'your companion',
  employer: 'your employer',
  rival: 'your rival',
  enemy: 'your enemy'
}

/**
 * What a faction thinks of the player character (docs/spec/04-rules-system.md#factions), from
 * −3 (hated) to +3 (honoured). Social checks with its people carry it as a bonus or a penalty.
 */
export const STANDINGS = [-3, -2, -1, 0, 1, 2, 3] as const
const STANDING_LABEL: Record<string, string> = { '-3': 'Hated', '-2': 'Hostile', '-1': 'Distrusted', '0': 'Neutral', '1': 'Liked', '2': 'Trusted', '3': 'Honoured' }
export const clampStanding = (n: number) => Math.max(-3, Math.min(3, Math.round(n || 0)))
export const standingLabel = (n = 0) => STANDING_LABEL[String(clampStanding(n))]
export const fmtStanding = (n = 0) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

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
  /** People only: how they're tied to the player character. */
  relation?: Relation
  /** People only: the faction they belong to, by name. */
  faction?: string
  /** Factions only: what they think of the player character (−3 to +3). */
  standing?: number
  /** People only: how they're tied to other characters. */
  ties?: Tie[]
  /**
   * People only: who they are, by the character creator's own criteria (people.ts): their race
   * and sex, the day they were born (their age follows the calendar), what they do, what they
   * look like and how they carry themselves.
   */
  race?: RaceId
  sex?: SexId
  born?: number
  calling?: string
  appearance?: string
  personality?: string
  /** Quests only: who asked it of the character. */
  giver?: string
  /** Items only: who has it now ("you": the player character). */
  holder?: string
  /** A picture of them (a media id). */
  image?: string
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
  /** Facts the player pinned: the DM always sees these. */
  notes: Note[]
}

export type Note = { id: string; text: string }

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
      relation?: Relation
      /** People: the faction they belong to. */
      faction?: string
      /** Factions: how much the player's deeds just moved them (added up, kept to −3…+3). */
      standingChange?: number
      /** People: ties to other characters (added to those known). */
      ties?: Tie[]
      /** People: the day they were born (family.ts). */
      born?: number
      /**
       * People: who they are, as the creator has it (people.ts). The Scribe's reading of the story
       * fills only what isn't known yet, so a guess never drifts and the Journal's word stands.
       * `age` is their age in years on `day`.
       */
      race?: RaceId
      sex?: SexId
      age?: number
      calling?: string
      appearance?: string
      personality?: string
      /** Quests: who asked it. Items: who has it now. */
      giver?: string
      holder?: string
      day: number
    }
  | { type: 'summary'; summary: Summary }
  | { type: 'arc'; text: string }
  | JournalEdit

/** Corrections the player makes in the Journal. They win over what the AI recorded. */
export type JournalEdit =
  | {
      type: 'entity_edit'
      id: string
      name?: string
      aliases?: string[]
      summary?: string
      facts?: string[]
      status?: EntityStatus
      /** null clears it. */
      attitude?: Attitude | null
      relation?: Relation | null
      image?: string | null
      /** Factions: set outright (null: neutral). */
      standing?: number | null
      /** People: the faction they belong to (null: none). */
      faction?: string | null
      /** People: their ties to others, all of them (replaces what was recorded). */
      ties?: Tie[]
      /** Quests: who asked it; items: who has it (null: nobody known). */
      giver?: string | null
      holder?: string | null
      /** People: who they are (people.ts); null or "" clears it. */
      race?: RaceId | null
      sex?: SexId | null
      born?: number | null
      calling?: string | null
      appearance?: string
      personality?: string
    }
  | { type: 'entity_forget'; id: string }
  | { type: 'summary_edit'; level: Summary['level']; to: string; title: string; text: string }
  | { type: 'note'; id: string; text: string }
  | { type: 'note_remove'; id: string }

export const MAX_FACTS = 12

export const emptyMemory = (): Memory => ({ entities: [], scenes: [], chapters: [], arc: '', notes: [] })

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
 * A description rather than a name: it starts with "the/a/an" ("the ferryman"), or has several
 * telling words and one is in lower case ("grey-bearded man"). One word on its own is a name.
 */
const isDescription = (s: string) => {
  const t = s.trim()
  if (/^(the|a|an)\s/i.test(t)) return true
  const words = t
    .replace(/['’]s\b/g, '')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !TITLES.has(w.toLowerCase()))
  return words.length > 1 && words.some((w) => /^\p{Ll}/u.test(w))
}

/**
 * Whether two names mean the same one: equal, or every telling word of the shorter is in
 * the longer ("Tam" and "Old Tam", "Mira" and "Mira Ashdown"). Descriptions must match
 * exactly: "the ferryman" is not "the ferryman's girl".
 */
export function sameName(a: string, b: string): boolean {
  const na = normName(a)
  const nb = normName(b)
  if (!na || !nb) return false
  if (na.replace(/^(the|a|an) /, '') === nb.replace(/^(the|a|an) /, '')) return true
  if (isDescription(a) || isDescription(b)) return false
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

/** Groups go by shorter names too: "the Watch" is "the Town Watch". */
export function sameFaction(a: string, b: string): boolean {
  const strip = (s: string) => normName(s).replace(/^the /, '')
  const na = strip(a)
  const nb = strip(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const words = (s: string) => s.split(/[\s-]+/).filter((t) => t.length > 1 && !['of', 'the', 'and'].includes(t))
  const wa = words(na)
  const wb = words(nb)
  if (!wa.length || !wb.length) return false
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa]
  return short.every((t) => long.includes(t))
}

export function findEntity(m: Memory, kind: EntityKind, name: string, aliases: string[] = []): Entity | undefined {
  const names = [name, ...aliases]
  // Groups, quests and things go by shorter names too ("the ferry" for "Find the missing ferry").
  const same = kind === 'place' ? samePlace : kind === 'person' ? sameName : sameFaction
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
        if (ev.kind !== 'person') e.status = ev.kind === 'quest' ? 'active' : 'unknown'
        if (ev.kind === 'faction') e.standing = 0
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
      if (ev.status && (e.kind === 'quest' ? QUEST_STATUSES : OTHER_STATUSES).includes(ev.status)) e.status = ev.status
      if (ev.attitude && e.kind === 'person') e.attitude = ev.attitude
      // "none" from the Scribe doesn't undo a tie it recorded before; the Journal can.
      if (ev.relation && ev.relation !== 'none' && e.kind === 'person') e.relation = ev.relation
      if (ev.faction?.trim() && e.kind === 'person') e.faction = ev.faction.trim()
      if (ev.standingChange && e.kind === 'faction') e.standing = clampStanding((e.standing ?? 0) + ev.standingChange)
      if (ev.ties?.length && e.kind === 'person') {
        const ties = [...(e.ties ?? [])]
        for (const t of ev.ties) if (t.how.trim() && t.name.trim() && !ties.some((x) => sameName(x.name, t.name) && x.how.toLowerCase() === t.how.toLowerCase())) ties.push({ how: t.how.trim(), name: t.name.trim() })
        e.ties = ties.slice(-8)
      }
      if (ev.born !== undefined && e.kind === 'person') e.born = ev.born
      if (e.kind === 'person') {
        // What the story shows of who they are fills the gaps; it never overwrites.
        if (isRace(ev.race) && !e.race) e.race = ev.race
        if ((ev.sex === 'female' || ev.sex === 'male') && !e.sex) e.sex = ev.sex
        if (ev.age !== undefined && Number.isFinite(ev.age) && ev.age >= 0 && e.born === undefined) e.born = bornAt(ev.age, ev.day)
        const fill = (k: 'calling' | 'appearance' | 'personality') => {
          const t = ev[k]?.replace(/\s+/g, ' ').trim()
          if (t && !e![k]) e![k] = t.slice(0, PERSON_LIMITS[k])
        }
        fill('calling')
        fill('appearance')
        fill('personality')
      }
      if (ev.giver?.trim() && e.kind === 'quest') e.giver = ev.giver.trim()
      if (ev.holder?.trim() && e.kind === 'item') e.holder = ev.holder.trim()
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
    case 'entity_edit': {
      const e = m.entities.find((x) => x.id === ev.id)
      if (!e) break
      if (ev.aliases) e.aliases = ev.aliases.map((a) => a.trim()).filter(Boolean)
      if (ev.name?.trim() && ev.name.trim() !== e.name) {
        // Keep the old spelling as another name, so the AI's later mentions still find this record.
        if (!e.aliases.some((a) => normName(a) === normName(e.name))) e.aliases.push(e.name)
        e.name = ev.name.trim()
      }
      e.aliases = e.aliases.filter((a) => normName(a) !== normName(e.name)).slice(-6)
      if (ev.summary !== undefined) e.summary = ev.summary.trim()
      if (ev.facts) e.facts = ev.facts.map((f) => f.trim()).filter(Boolean).slice(-MAX_FACTS)
      if (ev.status && (e.kind === 'quest' ? QUEST_STATUSES : OTHER_STATUSES).includes(ev.status)) e.status = ev.status
      if (ev.ties && e.kind === 'person') e.ties = ev.ties.filter((t) => t.how.trim() && t.name.trim()).slice(0, 8)
      if (ev.giver !== undefined && e.kind === 'quest') e.giver = ev.giver?.trim() || undefined
      if (ev.holder !== undefined && e.kind === 'item') e.holder = ev.holder?.trim() || undefined
      if (ev.attitude !== undefined && e.kind === 'person') e.attitude = ev.attitude ?? undefined
      if (ev.relation !== undefined && e.kind === 'person') e.relation = ev.relation && ev.relation !== 'none' ? ev.relation : undefined
      if (ev.image !== undefined) e.image = ev.image ?? undefined
      if (ev.standing !== undefined && e.kind === 'faction') e.standing = clampStanding(ev.standing ?? 0)
      if (ev.faction !== undefined && e.kind === 'person') e.faction = ev.faction?.trim() || undefined
      if (e.kind === 'person') {
        if (ev.race !== undefined) e.race = isRace(ev.race) ? ev.race : undefined
        if (ev.sex !== undefined) e.sex = ev.sex === 'female' || ev.sex === 'male' ? ev.sex : undefined
        if (ev.born !== undefined) e.born = ev.born === null || !Number.isFinite(ev.born) ? undefined : Math.round(ev.born)
        const set = (k: 'calling' | 'appearance' | 'personality') => {
          const v = ev[k]
          if (v !== undefined) e[k] = v?.replace(/\s+/g, ' ').trim().slice(0, PERSON_LIMITS[k]) || undefined
        }
        set('calling')
        set('appearance')
        set('personality')
      }
      break
    }
    case 'entity_forget':
      m.entities = m.entities.filter((x) => x.id !== ev.id)
      break
    case 'summary_edit': {
      const list = ev.level === 'scene' ? m.scenes : m.chapters
      const sm = list.find((x) => x.to === ev.to)
      if (sm) {
        sm.title = ev.title.trim() || sm.title
        sm.text = ev.text.trim() || sm.text
      }
      break
    }
    case 'note': {
      const text = ev.text.trim()
      const n = m.notes.find((x) => x.id === ev.id)
      if (!text) m.notes = m.notes.filter((x) => x.id !== ev.id)
      else if (n) n.text = text
      else m.notes.push({ id: ev.id, text })
      break
    }
    case 'note_remove':
      m.notes = m.notes.filter((x) => x.id !== ev.id)
      break
  }
  return m
}

const MEMORY_TYPES = new Set(['entity', 'summary', 'arc', 'entity_edit', 'entity_forget', 'summary_edit', 'note', 'note_remove'])
export const isMemoryEvent = (ev: { type: string }): ev is MemoryEvent => MEMORY_TYPES.has(ev.type)

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
export function relevantEntities(m: Memory, recent: string, location: string | null, max: number, exclude: string[] = [], recalled: string[] = []): Entity[] {
  const skip = (e: Entity) => exclude.some((x) => sameName(x, e.name))
  // Quests have their own block; everything else competes for the DM's attention here.
  const live = m.entities.filter((e) => !skip(e) && e.kind !== 'quest')
  const picked: Entity[] = []
  const add = (e: Entity) => {
    if (picked.length < max && !picked.includes(e)) picked.push(e)
  }
  const byRecent = [...live].sort((a, b) => b.lastSeen - a.lastSeen)
  if (location) for (const e of live) if (e.kind === 'place' && [e.name, ...e.aliases].some((n) => samePlace(n, location))) add(e)
  for (const e of byRecent) if (mentions(recent, e)) add(e)
  // Those that bear on the scene by meaning (memory by meaning, when there's an embedding model).
  for (const id of recalled) {
    const e = live.find((x) => x.id === id)
    if (e) add(e)
  }
  // The groups the people in the scene belong to.
  for (const e of [...picked]) {
    const f = e.kind === 'person' && e.faction ? findEntity(m, 'faction', e.faction) : undefined
    if (f && !skip(f)) add(f)
  }
  for (const e of byRecent) if (e.kind === 'person' && e.status !== 'dead') add(e)
  return picked
}

/**
 * One line for the DM (or the Scribe) about someone or something. `day` is today, for people's
 * ages; `looks` adds what they look like and how they carry themselves, when there's room.
 */
export function entityLine(e: Entity, facts: number, opts: { day?: number; looks?: boolean } = {}): string {
  const who = e.kind === 'person' && opts.day !== undefined ? personTags(e, opts.day) : ''
  const tags = [
    who || null,
    e.kind === 'place' ? 'place' : null,
    e.kind === 'faction' ? `faction; the player is ${standingLabel(e.standing).toLowerCase()} by them (${fmtStanding(e.standing ?? 0)})` : null,
    e.aliases.length ? `also called ${e.aliases.slice(0, 3).join(', ')}` : null,
    e.kind === 'person' && e.faction ? `of ${e.faction}` : null,
    e.kind === 'person' && e.ties?.length ? e.ties.slice(0, 3).map((t) => `${t.how} ${t.name}`).join(', ') : null,
    e.kind === 'item' ? `a notable thing${e.holder ? `, held by ${e.holder === 'you' ? 'the player' : e.holder}` : ''}` : null,
    e.kind === 'quest' ? `quest, ${e.status}${e.giver ? `, asked by ${e.giver}` : ''}` : null,
    e.kind === 'person' && e.relation ? RELATION_LABEL[e.relation].replace('your', "the player's") : null,
    e.kind === 'person' && e.attitude ? `${e.attitude} toward the player` : null,
    e.status === 'dead' ? 'DEAD' : e.status === 'missing' ? 'missing' : null,
    `last seen day ${e.lastSeenDay}`
  ].filter(Boolean)
  const f = facts > 0 && e.facts.length ? ` Known: ${e.facts.slice(-facts).join('; ')}.` : ''
  const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t)
  const looks =
    opts.looks && e.kind === 'person'
      ? `${e.appearance ? ` Appearance: ${cut(e.appearance, 160)}.` : ''}${e.personality ? ` Personality: ${cut(e.personality, 120)}.` : ''}`
      : ''
  return `- ${e.name} (${tags.join(', ')}): ${e.summary || 'no description yet'}.${looks}${f}`.replace(/\.\./g, '.').replace(/…\./g, '…')
}

/** The quests still open, newest first. */
export const activeQuests = (m: Memory) => m.entities.filter((e) => e.kind === 'quest' && e.status === 'active').sort((a, b) => b.lastSeen - a.lastSeen)

/** For the DM: what the character has taken on, who asked, and how far it's got. */
export function questBrief(m: Memory, max = 6): string {
  return activeQuests(m)
    .slice(0, max)
    .map((q) => `- ${q.name}${q.giver ? ` (asked by ${q.giver})` : ''}: ${q.summary || 'no details yet'}.${q.facts.length ? ` So far: ${q.facts.slice(-2).join('; ')}.` : ''}`.replace(/\.\./g, '.'))
    .join('\n')
}

const dayRange = (s: Summary) => (s.fromDay === s.toDay ? `day ${s.fromDay}` : `days ${s.fromDay}–${s.toDay}`)

/**
 * The story-so-far block. `covered(s)` says whether a summary's messages are still shown to
 * the model word for word (then it's left out). Newest summaries win when space is short, after
 * any that `keep` names (recalled by meaning: an old chapter that bears on the scene now).
 */
export function storySoFar(m: Memory, budgetChars: number, covered: (s: Summary) => boolean, keep: ReadonlySet<string> = new Set()): string {
  if (budgetChars <= 0) return ''
  const lastChapterTo = m.chapters.at(-1)?.to
  const chapterIdx = (s: Summary) => m.scenes.findIndex((x) => x.to === s.to)
  const cut = lastChapterTo ? chapterIdx(m.chapters.at(-1)!) : -1
  const scenes = m.scenes.slice(cut + 1).filter((s) => !covered(s))
  const chapters = m.chapters.filter((s) => !covered(s))
  const line = (s: Summary) => `${s.level === 'chapter' ? 'Chapter' : 'Scene'}, ${dayRange(s)}: ${s.title}. ${s.text}`
  const chosen = new Set<Summary>()
  let used = 0
  const take = (s: Summary) => {
    if (chosen.has(s)) return true
    const len = line(s).length
    if (used + len > budgetChars) return false
    chosen.add(s)
    used += len
    return true
  }
  for (const s of [...chapters, ...scenes]) if (keep.has(s.to)) take(s)
  for (const s of [...scenes].reverse()) if (!take(s)) break
  for (const s of [...chapters].reverse()) if (!take(s)) break
  const parts = [...chapters, ...scenes].filter((s) => chosen.has(s)).map(line)
  if (m.arc && chapters.length && used + m.arc.length < budgetChars) parts.unshift(`Overall: ${m.arc}`)
  return parts.join('\n')
}
