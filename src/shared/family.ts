import { AGE_SCALE, ageYears, DAYS_PER_YEAR, generateName, type GameState, type RaceId, type Rng, type SexId } from './rules'
import { sameName, type Entity, type Memory, type MemoryEvent } from './memory'

/**
 * Marriage and children (docs/spec/04-rules-system.md#family). A family lives in the story's
 * memory: a spouse is a person tied to the character as their spouse, and their children are
 * people tied to them as children, with the day they were born so they grow up with the
 * calendar. A grown child can take up the tale when the character dies.
 */

/** When a child is old enough to take up the tale, in human years (some peoples grow up slower). */
export const COME_OF_AGE = 16
export const MAX_CHILDREN = 8
/** In a time-skip spent raising a family, the chance of a child each year. */
export const BIRTH_CHANCE_PER_YEAR = 0.4
/** Past this age (in human years) a woman bears no more children. */
const LAST_CHILD_AGE = 45

const people = (memory: Memory) => memory.entities.filter((e) => e.kind === 'person')

/** The character's husband or wife: the living one, if there's been more than one. */
export function spouseOf(memory: Memory): Entity | undefined {
  const all = people(memory).filter((e) => e.relation === 'spouse')
  return all.find((e) => e.status !== 'dead') ?? all.at(-1)
}

export const childrenOf = (memory: Memory) => people(memory).filter((e) => e.relation === 'child')

/** How old someone is, in years, if the story knows when they were born. */
export const yearsOld = (e: Pick<Entity, 'born'>, day: number) => (e.born === undefined ? undefined : Math.max(0, Math.floor((day - e.born) / DAYS_PER_YEAR)))

/** "a baby", "a small child", "a child", "a youth", "grown": by their people's pace of growing up. */
export function childStage(years: number, race: RaceId): string {
  const h = years / (AGE_SCALE[race] ?? 1)
  return h < 2 ? 'a baby' : h < 6 ? 'a small child' : h < 13 ? 'a child' : h < COME_OF_AGE ? 'a youth' : 'grown'
}

/** Years until a child is grown enough to take up the tale (0 if they already are). */
export const yearsToComeOfAge = (years: number, race: RaceId) => Math.max(0, Math.ceil(COME_OF_AGE * (AGE_SCALE[race] ?? 1) - years))

/** The family, for the DM: who they married, and their children with their ages. */
export function familyBrief(memory: Memory, state: Pick<GameState, 'time' | 'character'>): string {
  const spouse = spouseOf(memory)
  const kids = childrenOf(memory)
  if (!spouse && !kids.length) return ''
  const race = state.character.build.race
  const lines: string[] = []
  if (spouse) lines.push(`Married to ${spouse.name}${spouse.status === 'dead' ? ', who has died: the character is widowed' : ''}.`)
  if (kids.length) {
    const told = kids.map((k) => {
      const y = yearsOld(k, state.time.day)
      return `${k.name}${y !== undefined ? ` (${y}, ${childStage(y, race)})` : ''}${k.status === 'dead' ? ', dead' : ''}`
    })
    lines.push(`Children: ${told.join('; ')}.`)
  }
  return lines.join('\n')
}

/** A wedding: the person becomes the character's spouse. */
export function marriageEvent(state: Pick<GameState, 'time' | 'character'>, name: string): MemoryEvent {
  return { type: 'entity', kind: 'person', name, relation: 'spouse', attitude: 'devoted', facts: [`Married ${state.character.build.name} on day ${state.time.day}`], day: state.time.day }
}

/** A child is born to the character (and their spouse, if they have one). */
export function birthEvent(state: Pick<GameState, 'time' | 'character'>, child: { name: string; sex: SexId }, spouse?: string, born = state.time.day): MemoryEvent {
  const pc = state.character.build.name
  const kin = child.sex === 'female' ? 'daughter' : 'son'
  return {
    type: 'entity',
    kind: 'person',
    name: child.name,
    summary: `${pc}'s ${kin}${spouse ? ` with ${spouse}` : ''}`,
    relation: 'child',
    attitude: 'devoted',
    born,
    facts: [`Born on day ${born}`],
    ...(spouse ? { ties: [{ how: `${kin} of`, name: spouse }] } : {}),
    day: born
  }
}

/**
 * Children born over a time-skip spent raising a family: a chance each year, while the
 * character has a living spouse, has fewer than eight children, and (a woman) is young enough.
 */
export function birthsDuring(state: Pick<GameState, 'time' | 'character'>, memory: Memory, days: number, rng: Rng): MemoryEvent[] {
  const spouse = spouseOf(memory)
  if (!spouse || spouse.status === 'dead') return []
  const b = state.character.build
  const start = state.time.day
  const taken = childrenOf(memory).map((k) => k.name)
  const out: MemoryEvent[] = []
  for (let year = 0; year * DAYS_PER_YEAR < days; year++) {
    if (taken.length + out.length >= MAX_CHILDREN) break
    const day = start + year * DAYS_PER_YEAR + Math.floor(rng() * Math.min(DAYS_PER_YEAR, days - year * DAYS_PER_YEAR))
    if (b.sex === 'female' && (ageYears(state) + (day - start) / DAYS_PER_YEAR) / (AGE_SCALE[b.race] ?? 1) > LAST_CHILD_AGE) break
    if (rng() >= BIRTH_CHANCE_PER_YEAR) continue
    const sex: SexId = rng() < 0.5 ? 'female' : 'male'
    // The family name is the character's (a first name from their people's names).
    const surname = b.name.trim().split(/\s+/).slice(1).join(' ')
    let first = generateName(rng, b.race, sex, false)
    for (let i = 0; i < 5 && [...taken, ...out.map((e) => (e as { name: string }).name)].some((n) => sameName(n.split(' ')[0], first)); i++) first = generateName(rng, b.race, sex, false)
    out.push(birthEvent(state, { name: surname ? `${first} ${surname}` : first, sex }, spouse.name, day))
  }
  return out
}
