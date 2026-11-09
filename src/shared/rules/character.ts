import {
  AGES,
  ATTR_CAP_MAX,
  ATTR_CAP_MIN,
  ATTR_POINTS,
  ATTR_START,
  ATTRS,
  BACKGROUNDS,
  RACE_BACKGROUNDS,
  BASE_ATTR_CAP,
  LEVEL_MAX,
  RACES,
  SEXES,
  SKILL_IDS,
  SKILL_MAX,
  SKILLS,
  START_SKILL_LEVELS,
  START_SKILL_MAX,
  attrStepCost,
  type AgeId,
  type Attr,
  type BackgroundId,
  type RaceId,
  type SexId,
  type SexMode,
  type SkillId,
  type SkillMods
} from './tables'

/** Everything the player chooses in the character creator. */
export type CharacterBuild = {
  name: string
  race: RaceId
  sex: SexId
  age: AgeId
  background: BackgroundId
  /** Humans only: the two attributes that get +1 cap. */
  humanBonus: Attr[]
  /** Final allocated scores (start at 8, raised with point-buy). */
  attributes: Record<Attr, number>
  /** Extra starting skill levels the player spread (on top of the background's). */
  skills: SkillMods
  appearance: string
  personality: string
}

export const mod = (score: number) => Math.floor((score - 10) / 2)
export const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

// ---- Caps -----------------------------------------------------------------------------

export type CapSource = { label: string; value: number }

/** Attribute caps with a breakdown of where each comes from (for tooltips). */
export function attrCapBreakdown(b: Pick<CharacterBuild, 'race' | 'sex' | 'age' | 'humanBonus'>, sexMode: SexMode) {
  const race = RACES[b.race]
  const sex = SEXES[sexMode][b.sex]
  const age = AGES[b.age]
  const out = {} as Record<Attr, { cap: number; sources: CapSource[] }>
  for (const a of ATTRS) {
    const sources: CapSource[] = [{ label: 'Base', value: BASE_ATTR_CAP }]
    const add = (label: string, v: number | undefined) => {
      if (v) sources.push({ label, value: v })
    }
    add(race.label, (race.attrs as Partial<Record<Attr, number>>)[a])
    add(sex.label, sex.attrs[a])
    add(age.label, (age.attrs as Partial<Record<Attr, number>>)[a])
    if (b.race === 'human' && b.humanBonus.includes(a)) add('Adaptable', 1)
    const raw = sources.reduce((s, x) => s + x.value, 0)
    out[a] = { cap: Math.max(ATTR_CAP_MIN, Math.min(ATTR_CAP_MAX, raw)), sources }
  }
  return out
}

export function attrCaps(b: Pick<CharacterBuild, 'race' | 'sex' | 'age' | 'humanBonus'>, sexMode: SexMode): Record<Attr, number> {
  const br = attrCapBreakdown(b, sexMode)
  return Object.fromEntries(ATTRS.map((a) => [a, br[a].cap])) as Record<Attr, number>
}

/** Skill caps: 2 × the governing attribute's cap + affinities, at most 50. */
export function skillCapBreakdown(
  b: Pick<CharacterBuild, 'race' | 'sex' | 'age' | 'humanBonus' | 'background'>,
  sexMode: SexMode
) {
  const caps = attrCaps(b, sexMode)
  const race = RACES[b.race]
  const sex = SEXES[sexMode][b.sex]
  const bg = BACKGROUNDS[b.background]
  const out = {} as Record<SkillId, { cap: number; sources: CapSource[] }>
  for (const s of SKILL_IDS) {
    const attr = SKILLS[s].attr
    const sources: CapSource[] = [{ label: `2 × ${attr} cap`, value: 2 * caps[attr] }]
    const add = (label: string, v: number | undefined) => {
      if (v) sources.push({ label, value: v })
    }
    add(race.label, (race.affinities as SkillMods)[s])
    add(sex.label, sex.affinities[s])
    add(bg.label, (bg.affinities as SkillMods)[s])
    const raw = sources.reduce((sum, x) => sum + x.value, 0)
    out[s] = { cap: Math.min(SKILL_MAX, raw), sources }
  }
  return out
}

export function skillCaps(b: Parameters<typeof skillCapBreakdown>[0], sexMode: SexMode): Record<SkillId, number> {
  const br = skillCapBreakdown(b, sexMode)
  return Object.fromEntries(SKILL_IDS.map((s) => [s, br[s].cap])) as Record<SkillId, number>
}

// ---- Point-buy ------------------------------------------------------------------------

export function pointsSpent(attributes: Record<Attr, number>): number {
  let total = 0
  for (const a of ATTRS) for (let s = ATTR_START; s < attributes[a]; s++) total += attrStepCost(s)
  return total
}

export const pointsLeft = (attributes: Record<Attr, number>) => ATTR_POINTS - pointsSpent(attributes)

/**
 * The scores one attribute can be given in the point-buy: down to the starting score, and up to
 * its cap or as far as the points left will go, whichever comes first. The creator's + and −
 * buttons and its draggable bars both keep to this, so they can't disagree.
 */
export function attrRange(attributes: Record<Attr, number>, a: Attr, cap: number): { min: number; max: number } {
  let left = pointsLeft(attributes)
  let max = attributes[a]
  while (max < cap && attrStepCost(max) <= left) left -= attrStepCost(max++)
  return { min: ATTR_START, max }
}

export const startingSkillBudget = (b: Pick<CharacterBuild, 'age'>) => START_SKILL_LEVELS + AGES[b.age].skillLevels

/** Starting level of a skill: 1 + background levels + levels the player added. */
export function startingSkillLevel(b: Pick<CharacterBuild, 'background' | 'skills'>, s: SkillId): number {
  return 1 + ((BACKGROUNDS[b.background].skills as SkillMods)[s] ?? 0) + (b.skills[s] ?? 0)
}

export const skillLevelsSpent = (b: Pick<CharacterBuild, 'skills'>) =>
  Object.values(b.skills).reduce((s, v) => s + (v ?? 0), 0)

/** Problems that stop a build from being used, in plain English. Empty = valid. */
export function validateBuild(b: CharacterBuild, sexMode: SexMode): string[] {
  const errors: string[] = []
  if (!b.name.trim()) errors.push('Give your character a name.')
  if (b.race === 'human' && new Set(b.humanBonus).size !== 2) errors.push('Pick two attributes for Adaptable.')
  if (!RACE_BACKGROUNDS[b.race].includes(b.background)) errors.push(`${RACES[b.race].plural} don't have the calling ${BACKGROUNDS[b.background].label}. Pick another.`)
  const caps = attrCaps(b, sexMode)
  for (const a of ATTRS) {
    if (b.attributes[a] < ATTR_START) errors.push(`${a} can't go below ${ATTR_START}.`)
    if (b.attributes[a] > caps[a]) errors.push(`${a} is above its cap of ${caps[a]}.`)
  }
  if (pointsLeft(b.attributes) < 0) errors.push('Too many attribute points spent.')
  const sCaps = skillCaps(b, sexMode)
  for (const s of SKILL_IDS) {
    const lvl = startingSkillLevel(b, s)
    if ((b.skills[s] ?? 0) < 0) errors.push(`${SKILLS[s].label} can't go below its starting level.`)
    if (lvl > Math.min(START_SKILL_MAX, sCaps[s])) errors.push(`${SKILLS[s].label} can start at most at level ${Math.min(START_SKILL_MAX, sCaps[s])}.`)
  }
  if (skillLevelsSpent(b) > startingSkillBudget(b)) errors.push('Too many starting skill levels spent.')
  return errors
}

// ---- Progression ----------------------------------------------------------------------

/** Total skill XP needed to reach a skill level (OSRS-style: early levels quick, later slow). */
export const skillXpForLevel = (level: number) => Math.round(12 * Math.pow(Math.max(0, level - 1), 2))

export function skillLevelFromXp(xp: number): number {
  let lvl = 1
  while (lvl < SKILL_MAX && skillXpForLevel(lvl + 1) <= xp) lvl++
  return lvl
}

/** Total character XP needed to reach a character level. */
export const charXpForLevel = (level: number) => Math.round(100 * Math.pow(Math.max(0, level - 1), 1.6))

export function charLevelFromXp(xp: number): number {
  let lvl = 1
  while (lvl < LEVEL_MAX && charXpForLevel(lvl + 1) <= xp) lvl++
  return lvl
}

// ---- Resources ------------------------------------------------------------------------

export function maxHp(sex: SexId, sexMode: SexMode, end: number, level: number) {
  return SEXES[sexMode][sex].baseHp + end + level * Math.max(1, 3 + mod(end))
}
export const maxStamina = (end: number, agi: number) => 10 + end + mod(agi)
export const maxMana = (arc: number, level: number) => arc * 2 + level * Math.max(0, mod(arc))

/** Bonus on social checks with strangers and authority, from sex and Renown. */
export function socialModifier(sex: SexId, sexMode: SexMode, renown: number) {
  const row = SEXES[sexMode][sex]
  return row.socialBase + Math.min(row.renownMax, Math.floor(renown / row.renownPer))
}

export const xpMultiplier = (b: Pick<CharacterBuild, 'race' | 'age'>) => 1 + RACES[b.race].xpBonus + AGES[b.age].xpBonus

// ---- Random characters ----------------------------------------------------------------

export type Rng = () => number
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]

/** A random, valid build that leans into its background (quick "Roll a New Adventurer"). */
export function randomBuild(rng: Rng, sexMode: SexMode, name: string, fixed: Partial<CharacterBuild> = {}): CharacterBuild {
  const race = fixed.race ?? pick(rng, Object.keys(RACES) as RaceId[])
  const sex = fixed.sex ?? pick(rng, ['male', 'female'] as SexId[])
  const age = fixed.age ?? pick(rng, ['young', 'adult', 'adult', 'adult', 'middle', 'elder'] as AgeId[])
  // Each people has its own callings.
  const background = fixed.background && RACE_BACKGROUNDS[race].includes(fixed.background) ? fixed.background : pick(rng, RACE_BACKGROUNDS[race])
  const bg = BACKGROUNDS[background]

  // Attributes the background relies on get priority.
  const favoured = [...new Set(Object.keys(bg.affinities).map((s) => SKILLS[s as SkillId].attr))]
  const humanBonus =
    race === 'human' ? (fixed.humanBonus?.length === 2 ? fixed.humanBonus : [...favoured, ...ATTRS].filter((a, i, all) => all.indexOf(a) === i).slice(0, 2)) : []
  const partial = { race, sex, age, humanBonus, background }
  const caps = attrCaps(partial, sexMode)

  const attributes =
    fixed.attributes ?? (Object.fromEntries(ATTRS.map((a) => [a, ATTR_START])) as Record<Attr, number>)
  if (!fixed.attributes) {
    let guard = 0
    while (pointsLeft(attributes) > 0 && guard++ < 500) {
      const pool = rng() < 0.6 && favoured.length ? favoured : [...ATTRS]
      const a = pick(rng, pool)
      const cost = attrStepCost(attributes[a])
      if (attributes[a] < caps[a] && cost <= pointsLeft(attributes)) attributes[a]++
    }
  }

  const skills: SkillMods = { ...(fixed.skills ?? {}) }
  if (!fixed.skills) {
    const sCaps = skillCaps({ ...partial }, sexMode)
    const prefer = Object.keys(bg.affinities) as SkillId[]
    let budget = startingSkillBudget({ age })
    let guard = 0
    while (budget > 0 && guard++ < 500) {
      const s = rng() < 0.5 ? pick(rng, prefer) : pick(rng, SKILL_IDS)
      const next = startingSkillLevel({ background, skills }, s) + 1
      if (next <= Math.min(START_SKILL_MAX, sCaps[s])) {
        skills[s] = (skills[s] ?? 0) + 1
        budget--
      }
    }
  }

  return {
    name: fixed.name ?? name,
    race,
    sex,
    age,
    background,
    humanBonus,
    attributes,
    skills,
    appearance: fixed.appearance ?? '',
    personality: fixed.personality ?? ''
  }
}
