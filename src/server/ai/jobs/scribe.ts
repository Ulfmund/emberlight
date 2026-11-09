import { z } from 'zod'
import { CONDITION_IDS, type ConditionId, type GameEvent, type GameState } from '@shared/rules'
import type { Provider } from '../providers'

const conditionEnum = z.enum(CONDITION_IDS as [ConditionId, ...ConditionId[]])

export const ScribeSchema = z.object({
  minutesPassed: z.number().int().describe('In-story minutes that passed during this narration (0 if barely any)'),
  rest: z.enum(['none', 'short', 'long']).describe('short = an hour or so of rest; long = a full night of sleep'),
  location: z.string().describe('Where the character now is, if it changed to a new named place; otherwise empty'),
  deed: z.string().describe('If the character did something people would talk about, a short line like "slew the river-thing at Millbrook"; otherwise empty'),
  deedRenown: z.number().int().describe('0 to 3: how much renown that deed earns (0 if none)'),
  itemsGained: z.array(z.object({ name: z.string(), qty: z.number().int() })),
  itemsLost: z.array(z.object({ name: z.string(), qty: z.number().int() })),
  coinsChange: z.number().int().describe('Coins gained (positive) or spent (negative), in copper. 10 copper = 1 silver, 100 copper = 1 gold'),
  milestoneXp: z.number().int().describe('0 to 50: XP for finishing a quest or a major story moment, otherwise 0'),
  healing: z.number().int().describe('Health restored by the story (a potion, bandaging, a healer), otherwise 0'),
  conditionsOn: z.array(conditionEnum),
  conditionsOff: z.array(conditionEnum)
})
export type ScribeOutput = z.infer<typeof ScribeSchema>

const SYSTEM = `You are the Scribe for a fantasy roleplaying game. You keep the books. Read the latest exchange and record only what actually happened in it, conservatively. Do not invent anything. When in doubt, record nothing.

- minutesPassed: how long the scene took (a conversation ~10, a search ~30, travelling to the next village ~240).
- rest: only if the character clearly rested or slept.
- deed: only for genuinely notable acts other people would hear about. Most turns have none.
- items and coins: only things the character clearly picked up, was given, bought, sold, used up or lost.
- healing: only for clear healing (potion, bandage, healer). Never for "you feel better".
- conditions: bleeding, poisoned, exhausted, hungry, frightened, captured, well_fed, inspired, hidden, wounded. Turn them on when the story clearly causes them; off when clearly resolved (freed from captivity, ate, cured).`

/** Upper bounds so a confused model can't hand out a fortune. */
function limits(state: GameState) {
  const lvl = state.character.level
  return { coins: 200 * lvl + 300, xp: 25 + 5 * lvl, items: 5, heal: 10 + 3 * lvl }
}

export async function runScribe(
  provider: Provider,
  model: string,
  state: GameState,
  playerText: string,
  engineNotes: string,
  narration: string
): Promise<GameEvent[]> {
  const c = state.character
  const prompt = `Character: ${c.build.name}. Carrying: ${c.inventory.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || 'nothing'}. Conditions: ${c.conditions.join(', ') || 'none'}. Location: ${state.location ?? 'unknown'}.

PLAYER: ${playerText}
${engineNotes ? `\nGAME ENGINE: ${engineNotes}\n` : ''}
DM: ${narration}

Record what changed.`

  const out = await provider.complete(model, {
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    schema: ScribeSchema,
    name: 'scribe'
  })
  return scribeToEvents(out, state)
}

export function scribeToEvents(out: ScribeOutput, state: GameState): GameEvent[] {
  const lim = limits(state)
  const events: GameEvent[] = []
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))

  const minutes = clamp(out.minutesPassed, 0, 24 * 60 * 3)
  if (out.rest === 'long') {
    events.push({ type: 'rest', kind: 'long' })
    events.push({ type: 'time', minutes: Math.max(minutes, 8 * 60) })
  } else {
    if (out.rest === 'short') events.push({ type: 'rest', kind: 'short' })
    if (minutes) events.push({ type: 'time', minutes: out.rest === 'short' ? Math.max(minutes, 60) : minutes })
  }
  const loc = out.location.trim()
  if (loc && loc.toLowerCase() !== (state.location ?? '').toLowerCase() && loc.length < 60) events.push({ type: 'location', name: loc })

  const renown = clamp(out.deedRenown, 0, 3)
  if (out.deed.trim() && renown > 0) events.push({ type: 'renown', amount: renown, deed: out.deed.trim().slice(0, 100) })

  for (const it of out.itemsGained.slice(0, lim.items)) {
    const qty = clamp(it.qty, 1, 20)
    if (it.name.trim()) events.push({ type: 'item', name: it.name.trim().slice(0, 50), delta: qty })
  }
  for (const it of out.itemsLost.slice(0, lim.items)) {
    const have = state.character.inventory.find((i) => i.name.toLowerCase() === it.name.trim().toLowerCase())
    if (have) events.push({ type: 'item', name: have.name, delta: -clamp(it.qty, 1, have.qty) })
  }
  const coins = clamp(out.coinsChange, -state.character.coins, lim.coins)
  if (coins) events.push({ type: 'coins', delta: coins })

  const xp = clamp(out.milestoneXp, 0, lim.xp)
  if (xp) events.push({ type: 'xp', amount: xp, reason: 'Story milestone' })

  const heal = clamp(out.healing, 0, lim.heal)
  if (heal && state.character.status !== 'dead') events.push({ type: 'heal', amount: heal, reason: 'Treated' })

  const has = new Set(state.character.conditions)
  for (const id of new Set(out.conditionsOn)) if (!has.has(id)) events.push({ type: 'condition', id, on: true })
  for (const id of new Set(out.conditionsOff)) if (has.has(id)) events.push({ type: 'condition', id, on: false })
  return events
}
