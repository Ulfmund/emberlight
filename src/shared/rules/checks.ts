import { mod, skillLevelFromXp, socialModifier, xpMultiplier, type Rng } from './character'
import { applyEvent, derived, type CampaignSettings, type GameEvent, type GameState } from './state'
import {
  CHECK_XP,
  DC,
  HARM_DICE,
  HARM_MULT,
  SEXES,
  SKILLS,
  SOCIAL_SKILLS,
  TIER_INFO,
  type Difficulty,
  type HarmSource,
  type Severity,
  type SkillId,
  type Tier
} from './tables'

/** What the Referee asks for (already validated). */
export type CheckRequest = {
  skill: SkillId
  difficulty: Difficulty
  modifier: number
  advantage: 'none' | 'advantage' | 'disadvantage'
  reason: string
  dramatic: boolean
  withStrangers: boolean
  risk: { severity: Severity; source: HarmSource }
  /** Hidden checks show the roll but not the DC or reason (DM-initiated). */
  hidden?: boolean
}

export type CheckResult = CheckRequest & {
  id: string
  dc: number
  d20s: number[]
  kept: number
  bonus: number
  breakdown: { label: string; value: number }[]
  total: number
  margin: number
  tier: Tier
  luck: boolean
  /** Harm taken from this check, if any. */
  damage: number
}

const PHYSICAL = new Set<string>(['STR', 'AGI', 'END'])

export const d = (rng: Rng, sides: number) => 1 + Math.floor(rng() * sides)

export function tierFor(kept: number, margin: number): Tier {
  if (kept === 20) return 'crit_success'
  if (kept === 1) return 'crit_failure'
  if (margin >= 10) return 'overwhelming'
  if (margin >= 5) return 'clean_success'
  if (margin >= 0) return 'narrow_success'
  if (margin >= -4) return 'narrow_failure'
  if (margin >= -9) return 'failure'
  return 'severe_failure'
}

/** The full bonus for a check, as labelled parts (shown on hover). */
export function checkBreakdown(state: GameState, settings: CampaignSettings, req: CheckRequest) {
  const c = state.character
  const info = SKILLS[req.skill]
  const level = skillLevelFromXp(c.skillXp[req.skill] ?? 0)
  const parts: { label: string; value: number }[] = [
    { label: `${info.attr} ${c.attributes[info.attr]}`, value: mod(c.attributes[info.attr]) },
    { label: `${info.label} level ${level}`, value: Math.floor(level / 5) }
  ]
  if (req.modifier) parts.push({ label: 'Situation', value: req.modifier })
  if (SOCIAL_SKILLS.includes(req.skill) && req.withStrangers) {
    const sm = socialModifier(c.build.sex, settings.sexModifiers, c.renown)
    if (sm) parts.push({ label: sm < 0 ? 'Must prove yourself' : 'Standing & Renown', value: sm })
  }
  if (c.conditions.includes('exhausted')) parts.push({ label: 'Exhausted', value: -1 })
  if (PHYSICAL.has(info.attr) && c.conditions.includes('hungry')) parts.push({ label: 'Hungry', value: -1 })
  if (PHYSICAL.has(info.attr) && c.conditions.includes('well_fed')) parts.push({ label: 'Well-fed', value: 1 })
  if (c.stamina <= 0 && PHYSICAL.has(info.attr)) parts.push({ label: 'Out of stamina', value: -2 })
  return parts.filter((p) => p.value !== 0 || p.label.includes('level'))
}

let counter = 0
const newId = () => `chk_${Date.now().toString(36)}_${(counter++).toString(36)}`

/**
 * Rolls one check and works out everything that follows from it: XP, stamina, harm,
 * and what happens if the character goes down. Returns the events in order.
 */
export function resolveCheck(
  state: GameState,
  settings: CampaignSettings,
  req: CheckRequest,
  rng: Rng
): { result: CheckResult; events: GameEvent[]; state: GameState } {
  const c = state.character
  const info = SKILLS[req.skill]
  const breakdown = checkBreakdown(state, settings, req)
  const bonus = breakdown.reduce((s, p) => s + p.value, 0)

  let advantage = req.advantage
  const poisonedPhysical = PHYSICAL.has(info.attr) && c.conditions.includes('poisoned')
  const inspired = c.conditions.includes('inspired')
  if (inspired) advantage = advantage === 'disadvantage' ? 'none' : 'advantage'
  if (poisonedPhysical) advantage = advantage === 'advantage' ? 'none' : 'disadvantage'

  const d20s = advantage === 'none' ? [d(rng, 20)] : [d(rng, 20), d(rng, 20)]
  let kept = advantage === 'advantage' ? Math.max(...d20s) : advantage === 'disadvantage' ? Math.min(...d20s) : d20s[0]

  // Halfling luck: once per day, a natural 1 is rerolled.
  let luck = false
  const events: GameEvent[] = []
  if (kept === 1 && c.build.race === 'halfling' && c.traitUsedDay !== state.time.day) {
    luck = true
    kept = d(rng, 20)
    d20s.push(kept)
    events.push({ type: 'trait_used' })
  }

  const dc = DC[req.difficulty]
  const total = kept + bonus
  const margin = total - dc
  const tier = tierFor(kept, margin)
  const success = TIER_INFO[tier].success

  const result: CheckResult = { ...req, id: newId(), dc, d20s, kept, bonus, breakdown, total, margin, tier, luck, damage: 0 }
  events.unshift({ type: 'roll', check: result })
  if (inspired) events.push({ type: 'condition', id: 'inspired', on: false })

  // Training: every attempt teaches something; success teaches more.
  const xp = Math.round(CHECK_XP[req.difficulty] * (success ? 1 : 0.5) * xpMultiplier(c.build))
  events.push({ type: 'skill_xp', skill: req.skill, amount: xp })

  // Physical effort costs stamina.
  if (info.group === 'combat' || req.skill === 'athletics' || req.risk.severity !== 'none') {
    events.push({ type: 'stamina', delta: -1 })
  }

  // Harm on failure.
  let working = events.reduce((st, ev) => applyEvent(st, ev, settings), state)
  const mult = HARM_MULT[tier]
  if (req.risk.severity !== 'none' && mult) {
    const [n, sides, flat] = HARM_DICE[req.risk.severity]
    let raw = flat
    for (let i = 0; i < n; i++) raw += d(rng, sides)
    const amount = Math.max(1, Math.round(raw * mult))
    result.damage = amount
    const dmg: GameEvent = { type: 'damage', amount, source: req.risk.source, reason: req.reason }
    events.push(dmg)
    working = applyEvent(working, dmg, settings)
    for (const ev of defeatEvents(working, settings, req.risk.source, rng)) {
      events.push(ev)
      working = applyEvent(working, ev, settings)
    }
  }
  return { result, events, state: working }
}

/** What happens when health drops to zero or below (docs/spec/04-rules-system.md#death). */
export function defeatEvents(state: GameState, settings: CampaignSettings, source: HarmSource, rng: Rng): GameEvent[] {
  const c = state.character
  if (c.hp > 0 || c.status !== 'alive') {
    const max = derived(state, settings).maxHp
    if (c.hp * 4 < max && c.hp > 0 && !c.conditions.includes('wounded')) return [{ type: 'condition', id: 'wounded', on: true }]
    return []
  }
  const max = derived(state, settings).maxHp

  if (c.build.race === 'orc' && c.traitUsedDay !== state.time.day && settings.mercy !== 'brutal') {
    return [
      { type: 'set_hp', hp: 1, reason: 'Relentless' },
      { type: 'trait_used' },
      { type: 'condition', id: 'wounded', on: true }
    ]
  }
  if (settings.mercy === 'brutal') return [{ type: 'status', status: 'dead', reason: 'Struck down' }]

  const capture = source === 'sentient' && (settings.mercy === 'forgiving' || rng() < SEXES[settings.sexModifiers][c.build.sex].captureChance)
  if (capture) {
    return [
      { type: 'set_hp', hp: 1, reason: 'Captured' },
      { type: 'condition', id: 'captured', on: true },
      { type: 'condition', id: 'wounded', on: true }
    ]
  }
  if (settings.mercy === 'forgiving') {
    return [
      { type: 'set_hp', hp: 1, reason: 'Left for dead' },
      { type: 'condition', id: 'wounded', on: true }
    ]
  }
  if (c.hp <= -Math.floor(max / 2)) return [{ type: 'status', status: 'dead', reason: 'Killed outright' }]
  return [{ type: 'status', status: 'downed', reason: 'Down and bleeding' }]
}

/** One death roll for a downed character at the start of their turn. */
export function deathRollEvents(state: GameState, rng: Rng): GameEvent[] {
  const c = state.character
  if (c.status !== 'downed') return []
  const roll = d(rng, 20)
  const success = roll !== 1 && roll + mod(c.attributes.END) >= 10
  const events: GameEvent[] = [{ type: 'death_roll', roll, success, double: roll === 1 }]
  const fails = c.deathRolls.fail + (success ? 0 : roll === 1 ? 2 : 1)
  const wins = c.deathRolls.success + (success ? 1 : 0)
  if (fails >= 3) events.push({ type: 'status', status: 'dead', reason: 'Bled out' })
  else if (wins >= 3) {
    events.push({ type: 'status', status: 'alive', reason: 'Stabilised' })
    events.push({ type: 'set_hp', hp: 1, reason: 'Stabilised' })
    events.push({ type: 'condition', id: 'wounded', on: true })
  }
  return events
}
