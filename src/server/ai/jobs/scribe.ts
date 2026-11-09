import { z } from 'zod'
import { CONDITION_IDS, findSpell, findTemplate, PLACE_KINDS, SPELLS, templateOf, type ConditionId, type GameEvent, type GameState, type InventoryItem } from '@shared/rules'
import type { Provider } from '../providers'
import { entityLine, findEntity, relevantEntities, RELATIONS, sameName, samePlace, type Memory } from '@shared/memory'

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
  healing: z.number().int().describe('Health restored by the story that is NOT from an item in itemsUsed (a healer, rest at a temple, magic), otherwise 0'),
  conditionsOn: z.array(conditionEnum),
  conditionsOff: z.array(conditionEnum),
  placeKind: z
    .enum([...PLACE_KINDS, 'unknown'] as [string, ...string[]])
    .describe('What sort of place the character is in now: town, village, indoors (inside a building), road, forest, hills (hills or mountains), water (river, lake, coast, at sea), ruin, underground (caves, mines, dungeons), wild (open country); unknown if unclear'),
  ate: z.enum(['none', 'snack', 'meal', 'feast']).describe('Did the character eat food that is not from their own pack? snack = a bite or a drink; meal = a proper meal; feast = a big hot meal or banquet'),
  itemsUsed: z
    .array(z.object({ name: z.string(), qty: z.number().int() }))
    .describe("Things from the character's own pack used up for their effect: eaten, drunk, a bandage or salve applied. Use the names from Carrying. Not things given away, sold or lost (those go in itemsLost)"),
  itemsEquipped: z.array(z.string()).describe('Things from the pack the character put on, wielded or took in hand in this exchange. Usually empty'),
  spellsLearned: z.array(z.string()).default([]).describe('Spells the character clearly learns in this exchange (from a teacher, a tome, a revelation), by name. Usually empty'),
  people: z
    .array(
      z.object({
        name: z.string().describe('Their name as the story gives it. If they have none yet, how the story refers to them ("the barmaid")'),
        otherNames: z.array(z.string()).describe('Other names or descriptions used for them. If someone recorded in KNOWN under a description now gives their real name, put the real name in name and the old description here'),
        who: z.string().describe('One short line: who they are. Empty if already known and unchanged'),
        newFacts: z.array(z.string()).describe('At most 2 short, lasting facts the story states about them. Usually empty'),
        status: z.enum(['alive', 'dead', 'missing', 'unknown']).describe('missing only if the story says so; unknown if not stated'),
        attitude: z.enum(['hostile', 'unfriendly', 'neutral', 'friendly', 'devoted', 'unknown']).describe('How they now feel about the player character'),
        relation: z.enum(RELATIONS).describe("How they're tied to the player character: child, parent, sibling, spouse, lover, friend, ally, companion, employer, rival, enemy, or none")
      })
    )
    .describe('Named characters (not the player character) who appear or are talked about in this exchange. At most 4'),
  places: z
    .array(
      z.object({
        name: z.string().describe('A named place: village, inn, ruin, road, forest… Each place separately: an inn is not its village'),
        what: z.string().describe('One short line: what it is. Empty if already known'),
        newFacts: z.array(z.string()).describe('At most 1 short, lasting fact the story states about it. Usually empty')
      })
    )
    .describe('Named places visited or talked about in this exchange. At most 2')
})
export type ScribeOutput = z.infer<typeof ScribeSchema>

const SYSTEM = `You are the Scribe for a fantasy roleplaying game. You keep the books. Read the latest exchange and record only what actually happened in it, conservatively. Do not invent anything. When in doubt, record nothing.

- minutesPassed: how long the scene took. Every scene takes some time: a quick exchange or a fight ~5, a conversation ~10, a search ~30, a meal ~45, travelling to the next village ~240. Never 0.
- rest: only if the character clearly rested or slept.
- deed: only for genuinely notable acts other people would hear about. Most turns have none.
- items and coins: only things the character clearly picked up, was given, bought, sold, used up or lost.
- healing: only for clear healing (potion, bandage, healer). Never for "you feel better".
- conditions: bleeding, poisoned, exhausted, hungry, frightened, captured, well_fed, inspired, hidden, wounded. Turn them on when the story clearly causes them; off when clearly resolved (freed from captivity, ate, cured).
- people and places: these are the game's long-term memory, so keep names spelled exactly as the story does. Record people who matter to the story even if they only appear briefly.
- Facts are what someone would still need to know a month later: "owes the player 5 silver", "lost two fingers to the river-thing", "is secretly the baron's son", "took the player prisoner". Never moods, gestures, smells, what a room looks like, or a blow-by-blow of a fight. Never guesses ("possibly", "seems to"): only what the story states. For someone already in KNOWN, add only what's new, and most turns add nothing.
- When someone recorded under a description ("grey-bearded man") gives their name, record them under the name and put the description in otherNames, so the record is renamed rather than duplicated.
- relation: only ties the story makes clear. A child is the player character's own son or daughter.
- spellsLearned: only when the story says the character now knows the spell. The spells that exist: ${SPELLS.map((sp) => sp.name).join(', ')}.
- Whatever the GAME ENGINE block lists was already recorded by the game: damage, a fight's blows, loot taken from fallen foes, spells and potions used in a fight, and things gathered or crafted (with the materials used up). Never record those again.
- Eating from the pack goes in itemsUsed ("Travel rations", 1), not in ate. Drinking a potion or using a bandage goes in itemsUsed too; the game works out the healing, so leave healing at 0 for those.`

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
  narration: string,
  memory?: Memory
): Promise<GameEvent[]> {
  const c = state.character
  const known = memory ? relevantEntities(memory, `${playerText}\n${narration}`, state.location, 10, [c.build.name]) : []
  const prompt = `Character: ${c.build.name}. Carrying: ${c.inventory.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || 'nothing'}. Conditions: ${c.conditions.join(', ') || 'none'}. Location: ${state.location ?? 'unknown'}.
${known.length ? `\nKNOWN (already recorded):\n${known.map((e) => entityLine(e, 4)).join('\n')}\n` : ''}
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
  return scribeToEvents(out, state, memory)
}

/** Finds an item in the pack by the name the story gave it (exactly, by what it is, or loosely). */
export function findInPack(state: GameState, name: string): InventoryItem | undefined {
  const inv = state.character.inventory
  const n = name.trim().toLowerCase()
  if (!n) return undefined
  const exact = inv.find((i) => i.name.toLowerCase() === n)
  if (exact) return exact
  const tpl = findTemplate(name)
  if (tpl) {
    const same = inv.find((i) => templateOf(i)?.id === tpl.id)
    if (same) return same
  }
  return inv.find((i) => i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase()))
}

const rollDice = ([n, sides, flat]: [number, number, number], rng: () => number) => {
  let total = flat
  for (let i = 0; i < n; i++) total += 1 + Math.floor(rng() * sides)
  return total
}

export function scribeToEvents(out: ScribeOutput, state: GameState, memory?: Memory, rng: () => number = Math.random): GameEvent[] {
  const lim = limits(state)
  const events: GameEvent[] = []
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))

  const minutes = clamp(out.minutesPassed, 5, 24 * 60 * 3)
  if (out.rest === 'long') {
    events.push({ type: 'rest', kind: 'long' })
    events.push({ type: 'time', minutes: Math.max(minutes, 8 * 60) })
  } else {
    if (out.rest === 'short') events.push({ type: 'rest', kind: 'short' })
    if (minutes) events.push({ type: 'time', minutes: out.rest === 'short' ? Math.max(minutes, 60) : minutes })
  }
  const loc = out.location.trim()
  if (loc && loc.toLowerCase() !== (state.location ?? '').toLowerCase() && loc.length < 60) events.push({ type: 'location', name: loc })
  if (out.placeKind && out.placeKind !== 'unknown' && out.placeKind !== state.placeKind && (PLACE_KINDS as readonly string[]).includes(out.placeKind)) {
    events.push({ type: 'place_kind', kind: out.placeKind as (typeof PLACE_KINDS)[number] })
  }

  const renown = clamp(out.deedRenown, 0, 3)
  if (out.deed.trim() && renown > 0) events.push({ type: 'renown', amount: renown, deed: out.deed.trim().slice(0, 100) })

  for (const it of out.itemsGained.slice(0, lim.items)) {
    const qty = clamp(it.qty, 1, 20)
    if (it.name.trim()) events.push({ type: 'item', name: it.name.trim().slice(0, 50), delta: qty })
  }
  // Used up for their effect (eaten, drunk, applied): the engine applies what the item does.
  let ateFromPack = false
  const usedNames = new Set<string>()
  for (const u of (out.itemsUsed ?? []).slice(0, 4)) {
    const item = findInPack(state, u.name)
    if (!item || usedNames.has(item.name)) continue
    usedNames.add(item.name)
    const tpl = templateOf(item)
    const times = clamp(u.qty, 1, Math.min(3, item.qty))
    for (let i = 0; i < times; i++) events.push({ type: 'use_item', name: item.name, heal: tpl?.heal ? rollDice(tpl.heal, rng) : undefined })
    if (tpl?.food) ateFromPack = true
  }
  if (!ateFromPack && out.ate && out.ate !== 'none') {
    events.push({ type: 'eat', hours: { snack: 4, meal: 12, feast: 24 }[out.ate], wellFed: out.ate === 'feast' })
  }
  for (const it of out.itemsLost.slice(0, lim.items)) {
    const have = findInPack(state, it.name)
    if (have && !usedNames.has(have.name)) events.push({ type: 'item', name: have.name, delta: -clamp(it.qty, 1, have.qty) })
  }
  for (const name of (out.itemsEquipped ?? []).slice(0, 3)) {
    const have = findInPack(state, name) ?? (events.some((e) => e.type === 'item' && e.delta > 0 && sameName(e.name, name)) ? { name } : undefined)
    if (have) events.push({ type: 'equip', name: have.name })
  }
  for (const name of (out.spellsLearned ?? []).slice(0, 2)) {
    const sp = findSpell(name)
    if (sp && !(state.character.spells ?? []).includes(sp.id) && !events.some((e) => e.type === 'learn_spell' && e.id === sp.id)) events.push({ type: 'learn_spell', id: sp.id, name: sp.name })
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

  // Long-term memory: people and places. Never the player character themself.
  const day = state.time.day
  const line = (t: string, max: number) => t.replace(/\s+/g, ' ').trim().slice(0, max)
  const facts = (xs: string[], n: number) =>
    xs
      .map((f) => line(f, 160))
      .filter((f) => f.length > 3 && !/\b(possibly|perhaps|probably|maybe|seems to|appears to|might be)\b/i.test(f))
      .slice(0, n)
  for (const p of (out.people ?? []).slice(0, 4)) {
    const name = line(p.name, 50)
    // Skip the player character, and descriptions posing as names ("the tall guard").
    if (!name || sameName(name, state.character.build.name) || (/^(a|an|the|some)\s/i.test(name) && /^[a-z]/.test(name.split(' ').at(-1)!))) continue
    const known = memory ? findEntity(memory, 'person', name, p.otherNames) : undefined
    events.push({
      type: 'entity',
      kind: 'person',
      name,
      aliases: p.otherNames.map((a) => line(a, 50)).filter(Boolean).slice(0, 3),
      summary: line(p.who, 140) || undefined,
      facts: facts(p.newFacts, 2),
      status: p.status === 'unknown' ? (known ? undefined : 'alive') : p.status,
      attitude: p.attitude === 'unknown' ? undefined : p.attitude,
      relation: p.relation && p.relation !== 'none' ? p.relation : undefined,
      day
    })
  }
  for (const pl of (out.places ?? []).slice(0, 2)) {
    const name = line(pl.name, 60)
    if (!name) continue
    events.push({ type: 'entity', kind: 'place', name, summary: line(pl.what, 140) || undefined, facts: facts(pl.newFacts, 1), day })
  }
  // The place the character is now at is always on record.
  const at = events.find((e) => e.type === 'location') as { name: string } | undefined
  if (at && !events.some((e) => e.type === 'entity' && e.kind === 'place' && samePlace(e.name, at.name))) {
    events.push({ type: 'entity', kind: 'place', name: at.name, day })
  }
  return events
}
