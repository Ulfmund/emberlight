// From the rule files themselves, not the rules index: memory.ts uses this, and the rules use memory.ts.
import { BACKGROUNDS, RACE_BACKGROUNDS, RACE_IDS, RACES, type BackgroundId, type RaceId, type SexId } from './rules/tables'
import { AGE_SCALE, DAYS_PER_YEAR } from './rules/calendar'
import type { Entity } from './memory'

/**
 * People made like characters (docs/spec/03-characters-and-cards.md#npcs-created-during-play).
 * Everyone in the Journal can have what the character creator asks of the player: race, sex,
 * age, calling, appearance and personality. Their cards read alike, the DM keeps them the same
 * from scene to scene, their portraits follow them, and they grow older with the calendar.
 */

export type PersonFields = Pick<Entity, 'race' | 'sex' | 'born' | 'calling' | 'appearance' | 'personality'>

/** How long each part may be (what the Scribe writes, and what the Journal takes). */
export const PERSON_LIMITS = { calling: 40, appearance: 300, personality: 240 } as const

/** Grown, in human years (as children come of age in family.ts). */
const GROWN = 16

/** The day someone was born, from their age in years on a given day. */
export const bornAt = (years: number, day: number) => day - Math.max(0, Math.round(years)) * DAYS_PER_YEAR

/** How old they are on a given day, if the story knows. */
export const ageOn = (p: Pick<Entity, 'born'>, day: number) => (p.born === undefined ? undefined : Math.max(0, Math.floor((day - p.born) / DAYS_PER_YEAR)))

export const isRace = (r: unknown): r is RaceId => typeof r === 'string' && (RACE_IDS as readonly string[]).includes(r)

/** "woman", "girl", "man", "boy": by their sex and whether they're grown. */
export function sexNoun(sex: SexId, years: number | undefined, race?: RaceId): string {
  const grown = years === undefined || years / (race ? (AGE_SCALE[race] ?? 1) : 1) >= GROWN
  return sex === 'female' ? (grown ? 'woman' : 'girl') : grown ? 'man' : 'boy'
}

/** What's known of who they are, in parts: "Dwarf woman", "54", "smith". */
export function personParts(p: PersonFields, day: number): string[] {
  const years = ageOn(p, day)
  const who = [p.race ? RACES[p.race].label : '', p.sex ? sexNoun(p.sex, years, p.race) : ''].filter(Boolean).join(' ')
  const parts = [who ? who.charAt(0).toUpperCase() + who.slice(1) : '', years === undefined ? '' : years === 0 ? 'baby' : String(years), p.calling?.trim() ?? '']
  return parts.filter(Boolean)
}

/** For the Journal card: "Dwarf woman · 54 · smith". */
export const personLine = (p: PersonFields, day: number) => personParts(p, day).join(' · ')

/** For the DM and the Scribe: "dwarf woman, 54, smith". */
export const personTags = (p: PersonFields, day: number) =>
  personParts(p, day)
    .map((x, i) => (i === 0 ? x.charAt(0).toLowerCase() + x.slice(1) : x))
    .join(', ')

/** For a portrait: "a 54-year-old dwarf woman, a smith" (or as much of it as is known). */
export function personKind(p: PersonFields, day: number): string {
  const years = ageOn(p, day)
  const noun = p.sex ? sexNoun(p.sex, years, p.race) : 'person'
  const race = p.race ? `${RACES[p.race].label.toLowerCase()} ` : ''
  if (!p.race && !p.sex && years === undefined) return ''
  const aged = years === undefined ? '' : years === 0 ? 'baby ' : `${years}-year-old `
  const who = `${aged}${race}${noun}`
  const num = /^\d+/.exec(who)?.[0]
  const an = num ? num.startsWith('8') || num === '11' || num === '18' : /^[aeiou]/i.test(who)
  return `${an ? 'an' : 'a'} ${who}`
}

/**
 * The creator's calling that a card's words name, among this people's ("Hunter", "grove healer",
 * "the village smith"), so a child who takes up the tale starts out in it.
 */
export function callingFor(text: string | undefined, race: RaceId): BackgroundId | undefined {
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  const t = text?.trim().toLowerCase()
  if (!t) return undefined
  const ids = RACE_BACKGROUNDS[race] ?? []
  const words = t.split(/[^a-z]+/).filter(Boolean)
  return ids.find((id) => flat(t) === id || flat(t) === flat(BACKGROUNDS[id].label)) ?? ids.find((id) => words.includes(id))
}

/** Ideas for an appearance and a personality: the creator's dice, for anyone. */
export const APPEARANCE_IDEAS: string[] = [
  'Weathered skin and a crooked nose, broken more than once.',
  'Tall and lean, with ink-black hair tied back and grey eyes.',
  'Broad-shouldered, freckled, a braid down to the waist.',
  'A burn scar along one jaw, half hidden by a short beard.',
  'Slight and quick, with a mop of copper curls.',
  'Sun-browned, with laugh lines and calloused hands.',
  'Pale as milk, with sharp cheekbones and a cool stare.',
  'Stocky and strong, with a shaved head and a silver earring.',
  'Soft-spoken eyes, mismatched: one green, one brown.',
  'Plain-faced and forgettable, which is useful.'
]
export const PERSONALITY_IDEAS: string[] = [
  'Quiet and stubborn; slow to trust, loyal once won.',
  'Cheerful, nosy and incapable of leaving a mystery alone.',
  'Proud and short-tempered, but fiercely fair.',
  'Careful with words, careless with coin.',
  'Superstitious, kind to animals, rude to priests.',
  'A dreamer who reads everything and believes half of it.',
  'Ambitious and calculating, with a soft spot for underdogs.',
  'Gruff on the outside, sentimental underneath.',
  'Restless; hates staying anywhere longer than a week.',
  'Honest to a fault, which has caused trouble before.'
]
