import { skillCaps, skillLevelFromXp, skillXpForLevel, xpMultiplier } from './character'
import { buildNow, DAYS_PER_YEAR, SKIP_MAX_DAYS } from './calendar'
import { applyEvent, type CampaignSettings, type GameEvent, type GameState } from './state'
import { SKILL_IDS, type SkillId } from './tables'
import { jobLevel, livelihood } from './life'

/**
 * Long time-skips (docs/spec/04-rules-system.md#time-skips): "five years pass". The player says
 * how long, and what the character does with the time; the engine moves the calendar (so they
 * grow older), rests, feeds and heals them, and trains what they practise; the DM tells it as a
 * montage and ends back in the present.
 */

export type SkipPlan = {
  days: number
  /** What the character does with the time, in the player's words (may be empty). */
  doing: string
  /** Up to two skills they practise. */
  practise: SkillId[]
  /** They spend it at their job (life.ts): pay comes in, and living costs go out. */
  working?: boolean
}

export const SKIP_SPANS = [
  { id: 'week', label: 'A week', days: 7 },
  { id: 'month', label: 'A month', days: 30 },
  { id: 'season', label: 'A season', days: 90 },
  { id: 'year', label: 'A year', days: DAYS_PER_YEAR },
  { id: 'years5', label: 'Five years', days: 5 * DAYS_PER_YEAR },
  { id: 'years10', label: 'Ten years', days: 10 * DAYS_PER_YEAR }
] as const

/** At most this many skills can be practised in one skip; the time is shared between them. */
export const PRACTICE_MAX = 2
/**
 * Skill XP a day of practice brings (before the character's XP bonuses). A year spent on one
 * skill takes a beginner to about 13; the XP curve makes later years count for less.
 */
export const PRACTICE_XP_PER_DAY = 4.8

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const word = (n: number) => WORDS[n] ?? String(n)

/** "a year", "five years", "a season", "two months", "3 days"... */
export function spanLabel(days: number): string {
  const unit = (n: number, one: string) => (n === 1 ? `a ${one}` : `${word(n)} ${one}s`)
  if (days >= DAYS_PER_YEAR && days % DAYS_PER_YEAR === 0) return unit(days / DAYS_PER_YEAR, 'year')
  if (days >= 90 && days % 90 === 0) return unit(days / 90, 'season')
  if (days >= 30 && days % 30 === 0) return unit(days / 30, 'month')
  if (days >= 7 && days % 7 === 0) return unit(days / 7, 'week')
  return unit(days, 'day')
}

/** "Five years pass." / "A year passes." */
export const spanSentence = (days: number) => {
  const s = spanLabel(days)
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${s.startsWith('a ') ? 'passes' : 'pass'}.`
}

/** What the player sees as their message for a skip chosen in the dialog. */
export const skipText = (plan: Pick<SkipPlan, 'days' | 'doing'>) => `((${spanSentence(plan.days)}${plan.doing.trim() ? ` ${plan.doing.trim()}` : ''}))`

export const clampSkipDays = (days: number) => Math.max(1, Math.min(SKIP_MAX_DAYS, Math.round(days)))

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, season: 90, year: DAYS_PER_YEAR, decade: 10 * DAYS_PER_YEAR }
const NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, several: 4, 'a few': 3, 'a couple of': 2
}
const COUNT = String.raw`(\d{1,3}|a couple of|a few|several|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)`
const UNIT = String.raw`(days?|weeks?|months?|seasons?|years?|decades?)`
/** The ways a player asks for time to pass, out of character. The first group is the count, the second the unit. */
const ASKS = [
  new RegExp(String.raw`^(?:let\s+|skip\s+(?:ahead\s+|forward\s+)?(?:by\s+)?|fast[- ]?forward\s+(?:by\s+)?|time\s*skip[:,]?\s*(?:of\s+)?|jump\s+(?:ahead\s+)?)${COUNT}\s+${UNIT}(?:\s+(?:pass(?:es)?|go(?:es)?\s+by|later|ahead|forward))?`, 'i'),
  new RegExp(String.raw`^${COUNT}\s+${UNIT}\s+(?:pass(?:es)?|go(?:es)?\s+by|later|have\s+passed|has\s+passed)`, 'i')
]

/**
 * A time-skip asked for out of character: "((five years pass))", "((skip ahead a year while I
 * train with Tam))", "((let a season go by. I work the forge.))". Null for anything else.
 */
export function parseSkip(text: string): SkipPlan | null {
  const inner = /^\s*\(\(([\s\S]+?)\)\)\s*$/.exec(text)?.[1]?.trim()
  if (!inner) return null
  for (const re of ASKS) {
    const m = re.exec(inner)
    if (!m) continue
    const count = m[1].toLowerCase().replace(/\s+/g, ' ')
    const n = /^\d+$/.test(count) ? Number(count) : NUMBERS[count]
    const unit = UNIT_DAYS[m[2].toLowerCase().replace(/s$/, '')]
    if (!n || !unit) return null
    const doing = inner
      .slice(m[0].length)
      .replace(/^\s*(?:[.,;:!–—-]+\s*)*/, '')
      .replace(/^(?:and|while|as|during which|in which)\s+/i, '')
      .trim()
    return { days: clampSkipDays(n * unit), doing: doing.slice(0, 300), practise: [] }
  }
  return null
}

/** The engine's half of a skip: the time itself, then what practice taught. */
export function skipEvents(state: GameState, settings: CampaignSettings, plan: SkipPlan): GameEvent[] {
  const days = clampSkipDays(plan.days)
  const doing = plan.doing.trim().slice(0, 300)
  const skip: GameEvent = { type: 'time_skip', days, ...(doing ? { doing } : {}) }
  const events: GameEvent[] = [skip]
  const skills = [...new Set(plan.practise)].filter((s) => SKILL_IDS.includes(s)).slice(0, PRACTICE_MAX)
  // Practice counts at the age they've reached, and stops at what they can ever learn.
  const after = applyEvent(state, skip, settings)
  const now = buildNow(after)
  const caps = skillCaps(now, settings.sexModifiers)
  const each = (PRACTICE_XP_PER_DAY * days * xpMultiplier(now)) / skills.length
  for (const s of skills) {
    const have = after.character.skillXp[s] ?? 0
    const amount = Math.round(Math.min(each, Math.max(0, skillXpForLevel(caps[s]) - have)))
    if (amount > 0) events.push({ type: 'skill_xp', skill: s, amount, practice: true })
  }
  // At work: the pay (at the skill they have midway), less the cost of living. Without a job they
  // get by on odd work, and the purse neither grows nor shrinks.
  if (plan.working && state.job) {
    const trained = events.reduce((n, e) => (e.type === 'skill_xp' && e.skill === state.job!.skill ? n + e.amount : n), 0)
    const end = jobLevel({ character: { ...state.character, skillXp: { ...state.character.skillXp, [state.job.skill]: (state.character.skillXp[state.job.skill] ?? 0) + trained } } }, state.job)
    const money = livelihood(state, days, end)
    const delta = Math.max(money.net, -state.character.coins)
    if (delta) events.push({ type: 'coins', delta })
  }
  return events
}

/** How a practised skill changed over the skip, for the DM and the dialog's preview. */
export function practiced(before: GameState, after: GameState, skills: SkillId[]): { skill: SkillId; from: number; to: number }[] {
  return skills.map((skill) => ({ skill, from: skillLevelFromXp(before.character.skillXp[skill] ?? 0), to: skillLevelFromXp(after.character.skillXp[skill] ?? 0) }))
}
