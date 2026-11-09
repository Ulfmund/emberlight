import type { CharacterBuild } from './character'
import type { GameState } from './state'
import { AGES, type AgeId, type RaceId, type SkillId } from './tables'

/**
 * The calendar and growing older (docs/spec/04-rules-system.md#seasons-and-aging). A year is
 * four seasons of 90 days, the story beginning on the first day of spring. Characters age a
 * year every 360 days, and their limits follow the stage of life they're in now (the age table),
 * not the one they began at. Some peoples age slower than others.
 */

export const DAYS_PER_SEASON = 90
export const DAYS_PER_YEAR = 4 * DAYS_PER_SEASON

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

export const startingAge = (b: Pick<CharacterBuild, 'age' | 'race'>) => Math.round(TYPICAL[b.age] * (AGE_SCALE[b.race] ?? 1))

/** The character's age in years, now. */
export function ageYears(state: Pick<GameState, 'character' | 'time'>): number {
  const c = state.character
  const start = c.ageAtStart ?? startingAge(c.build)
  return start + Math.max(0, Math.floor((state.time.day - (c.startDay ?? 1)) / DAYS_PER_YEAR))
}

/** The stage of life the character is in now (it decides their limits). */
export function ageStage(state: Pick<GameState, 'character' | 'time'>): AgeId {
  const human = ageYears(state) / (AGE_SCALE[state.character.build.race] ?? 1)
  // A character never seems younger than they began (a "middle-aged" 36 stays middle-aged).
  const began = AGE_IDS_IN_ORDER.indexOf(state.character.build.age)
  const now = AGE_IDS_IN_ORDER.indexOf(STAGE_FROM.find(([, from]) => human >= from)![0])
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
