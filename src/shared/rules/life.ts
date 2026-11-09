import { skillLevelFromXp } from './character'
import type { GameState } from './state'
import type { SkillId } from './tables'
import { samePlace } from '../memory'

/**
 * Homes and work (docs/spec/04-rules-system.md#homes-and-work): somewhere to live, and a living.
 * A home costs less to live in than the road, and a night's sleep in your own bed mends you
 * fully, with nothing to wake you. A job pays by the day, more as its skill grows, and is what
 * the time goes on in a time-skip. Both are chosen from the Sheet and told by the DM, so they're
 * never misread from the story.
 */

export const HOMES = {
  room: { label: 'A rented room', price: 0, perDay: 6, blurb: 'A bed and a door that locks. Rent and food, 6 copper a day.' },
  cottage: { label: 'A cottage', price: 2000, perDay: 4, blurb: 'Two rooms, a hearth and a garden. Food and upkeep, 4 copper a day.' },
  house: { label: 'A house', price: 6000, perDay: 6, blurb: 'A proper house in town, with room for a family. 6 copper a day to keep.' },
  hall: { label: 'A hall', price: 30000, perDay: 15, blurb: 'A great house with land and servants. 15 copper a day to keep.' }
} as const
export type HomeKind = keyof typeof HOMES
export const HOME_KINDS = Object.keys(HOMES) as HomeKind[]

export type Home = { kind: HomeKind; place: string; since: number }
export type Job = {
  /** What they do, in a few words ("smith's hand", "caravan guard"). */
  title: string
  /** Where (the place it was taken up). */
  place: string
  /** The skill the work uses and trains. */
  skill: SkillId
  /** Room and meals come with it (and the pay is half). */
  board: boolean
  since: number
}

/** What a day costs with no home of your own: inns, stables and the road. */
export const ROAD_PER_DAY = 12
/** Days worked in a week. */
export const WORKDAYS_PER_WEEK = 6
/** Selling a home brings back half what it cost. */
export const SELL_SHARE = 0.5

/**
 * A day's pay in copper, by the skill the job uses: a beginner earns 7 (enough for a rented room),
 * a skilled hand at 13 earns 19, a master over 50. Room and board halve it.
 */
export const wagePerDay = (level: number, board: boolean) => Math.max(1, Math.round((6 + level) * (board ? 0.5 : 1)))

export const jobLevel = (state: Pick<GameState, 'character'>, job: Pick<Job, 'skill'>) => skillLevelFromXp(state.character.skillXp[job.skill] ?? 0)

/** What a day of living costs, by where they live (board with the job covers it). */
export function livingPerDay(state: Pick<GameState, 'home' | 'job'>): number {
  if (state.job?.board) return 0
  return state.home ? HOMES[state.home.kind].perDay : ROAD_PER_DAY
}

/** Whether the character is at home now (resting there mends them fully, with nothing to wake them). */
export const atHome = (s: Pick<GameState, 'home' | 'location'>) => Boolean(s.home && s.location && samePlace(s.home.place, s.location))

/**
 * The money over a stretch of days at work: pay for the days worked (at the skill they have
 * midway, when it grows meanwhile), less the cost of living.
 */
export function livelihood(state: Pick<GameState, 'home' | 'job' | 'character'>, days: number, endLevel?: number) {
  const job = state.job
  // Six days in each full week, and every day of a short stretch up to six.
  const workdays = job ? Math.floor(days / 7) * WORKDAYS_PER_WEEK + Math.min(days % 7, WORKDAYS_PER_WEEK) : 0
  const level = job ? Math.round((jobLevel(state, job) + (endLevel ?? jobLevel(state, job))) / 2) : 0
  const wages = job ? workdays * wagePerDay(level, job.board) : 0
  const costs = days * livingPerDay(state)
  return { workdays, wages, costs, net: wages - costs }
}

/** "about 2 silver a week" */
export function weeklyPay(state: Pick<GameState, 'character'>, job: Job): number {
  return wagePerDay(jobLevel(state, job), job.board) * WORKDAYS_PER_WEEK
}
