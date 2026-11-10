import type { CharacterBuild } from './character'
import type { GameState } from './state'
import { AGES, RACE_IDS, RACES, type AgeId, type RaceId, type SkillId } from './tables'

/**
 * The calendar and growing older (docs/spec/04-rules-system.md#seasons-and-aging). A year is
 * four seasons of 90 days, the story beginning on the first day of spring. Characters age a
 * year every 360 days, and their limits follow the stage of life they're in now (the age table),
 * not the one they began at. Some peoples age slower than others.
 */

export const DAYS_PER_SEASON = 90
export const DAYS_PER_YEAR = 4 * DAYS_PER_SEASON
/** The longest a time-skip can be (skips.ts). */
export const SKIP_MAX_DAYS = 20 * DAYS_PER_YEAR

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type Season = (typeof SEASONS)[number]

export const SEASON_INFO: Record<Season, { label: string; dm: string }> = {
  spring: { label: 'Spring', dm: 'Spring: thaw and mud, rain and new green; rivers run high.' },
  summer: { label: 'Summer', dm: 'Summer: long warm days and short nights; dust on the roads.' },
  autumn: { label: 'Autumn', dm: 'Autumn: harvest and falling leaves, cold mornings; the year is turning.' },
  winter: { label: 'Winter', dm: 'Winter: short days and long cold nights; snow on the roads, travel is slow, and a night in the open is dangerous.' }
}

export const seasonOf = (day: number): Season => SEASONS[Math.floor((((day - 1) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR / DAYS_PER_SEASON)]
export const yearOf = (day: number): number => Math.floor((day - 1) / DAYS_PER_YEAR) + 1
/** How many seasons have begun since the story's first day (to tell how many turned in a jump). */
export const seasonNumber = (day: number): number => Math.floor((day - 1) / DAYS_PER_SEASON)

/** Each season's mark on the timeline. */
export const SEASON_ICON: Record<Season, string> = { spring: 'herb', summer: 'sparkle', autumn: 'bread', winter: 'moon' }

/** "Spring, year 1" */
export const dateLabel = (day: number) => `${SEASON_INFO[seasonOf(day)].label}, year ${yearOf(day)}`

// ---- Growing older ---------------------------------------------------------------------------

/** How much slower than humans each people ages (an elf of 135 is a young adult). */
export const AGE_SCALE: Record<RaceId, number> = { human: 1, halfling: 1.25, orc: 0.8, dwarf: 2.5, elf: 5 }

/** A typical age (in human years) for someone who starts the story at each stage. */
const TYPICAL: Record<AgeId, number> = { young: 18, adult: 27, middle: 44, elder: 62 }
/** Where each stage begins, in human years. */
const STAGE_FROM: [AgeId, number][] = [
  ['elder', 56],
  ['middle', 36],
  ['adult', 21],
  ['young', 0]
]
/** The youngest an adventurer can set out, and the oldest anyone is, in human years. */
const SETS_OUT = 16
const OLDEST_ADVENTURER = 90
const OLDEST = 100

const scale = (race: RaceId) => AGE_SCALE[race] ?? 1

/** A typical age, in years, for someone of this people at this stage of life. */
export const typicalAge = (age: AgeId, race: RaceId) => Math.round(TYPICAL[age] * scale(race))

/** The stage of life someone of this people is in at this age (the age table's rows). */
export function stageAt(years: number, race: RaceId): AgeId {
  const human = years / scale(race)
  return STAGE_FROM.find(([, from]) => human >= from)![0]
}

/** The ages the age slider offers: an adventurer from 16 (in human years); anyone from birth. */
export function ageRange(race: RaceId, who: 'adventurer' | 'anyone'): { min: number; max: number } {
  const s = scale(race)
  return who === 'adventurer' ? { min: Math.round(SETS_OUT * s), max: Math.round(OLDEST_ADVENTURER * s) } : { min: 0, max: Math.round(OLDEST * s) }
}

/** Where each stage of life begins and ends for this people, in years, within the slider's range. */
export function ageBands(race: RaceId, who: 'adventurer' | 'anyone'): { age: AgeId; from: number; to: number }[] {
  const { min, max } = ageRange(race, who)
  const starts = [...STAGE_FROM].reverse().map(([age, from]) => ({ age, from: Math.max(min, Math.round(from * scale(race))) }))
  return starts.map((b, i) => ({ ...b, to: i + 1 < starts.length ? starts[i + 1].from - 1 : max })).filter((b) => b.to >= b.from)
}

/**
 * For the DM and the Scribe: when each people is grown and when old, so a grey-braided dwarf
 * smith isn't recorded as fifty, and a dwarf of fifty isn't told as old.
 */
export function agesBrief(): string {
  const at = (stage: AgeId) => STAGE_FROM.find(([a]) => a === stage)![1]
  const parts = RACE_IDS.map((r) => `${RACES[r].plural.toLowerCase()} ${Math.round(at('adult') * scale(r))} / ${Math.round(at('elder') * scale(r))}`)
  return `Each people ages at its own pace (grown from / old from, in years): ${parts.join(', ')}.`
}

/** The same point in life for another people (a human of 27 is a dwarf of 68). */
export const rescaleAge = (years: number, from: RaceId, to: RaceId) => Math.round((years / scale(from)) * scale(to))

/** Their age when the story begins: as the player set it, or typical for the stage they chose. */
export const startingAge = (b: Pick<CharacterBuild, 'age' | 'race'> & { years?: number }) => (b.years !== undefined ? Math.round(b.years) : typicalAge(b.age, b.race))

/** The character's age in years, now. */
export function ageYears(state: Pick<GameState, 'character' | 'time'>): number {
  const c = state.character
  const start = c.ageAtStart ?? startingAge(c.build)
  return start + Math.max(0, Math.floor((state.time.day - (c.startDay ?? 1)) / DAYS_PER_YEAR))
}

/** The stage of life the character is in now (it decides their limits). */
export function ageStage(state: Pick<GameState, 'character' | 'time'>): AgeId {
  // A character never seems younger than they began (a "middle-aged" 36 stays middle-aged).
  const began = AGE_IDS_IN_ORDER.indexOf(state.character.build.age)
  const now = AGE_IDS_IN_ORDER.indexOf(stageAt(ageYears(state), state.character.build.race))
  return AGE_IDS_IN_ORDER[Math.max(began, now)]
}
const AGE_IDS_IN_ORDER: AgeId[] = ['young', 'adult', 'middle', 'elder']

/** The build as the character is now: the same person, at the age they've reached. */
export function buildNow(state: Pick<GameState, 'character' | 'time'>): CharacterBuild {
  const age = ageStage(state)
  return age === state.character.build.age ? state.character.build : { ...state.character.build, age }
}

/** "25, adult" */
export const ageLabel = (state: Pick<GameState, 'character' | 'time'>) => `${ageYears(state)}, ${AGES[ageStage(state)].label.toLowerCase()}`

// ---- What the season does --------------------------------------------------------------------

/**
 * Gathering by season: little grows under the snow, autumn is the time of plenty, ice and lean
 * game make winter's fishing and hunting harder. A bonus (or a penalty) on the roll, with why.
 */
export function seasonGathering(skill: SkillId, season: Season): { value: number; why: string } | null {
  if (skill === 'herbalism') return season === 'winter' ? { value: -4, why: 'Winter: little grows under the snow' } : season === 'autumn' ? { value: 2, why: 'Autumn: the woods are full' } : season === 'spring' ? { value: 1, why: 'Spring: new growth everywhere' } : null
  if (skill === 'fishing') return season === 'winter' ? { value: -2, why: 'Winter: ice and sluggish fish' } : season === 'summer' ? { value: 1, why: 'Summer: the fish are rising' } : null
  if (skill === 'hunting') return season === 'winter' ? { value: -1, why: 'Winter: game is lean and scarce' } : season === 'autumn' ? { value: 1, why: 'Autumn: game is fat before the cold' } : null
  return null
}
