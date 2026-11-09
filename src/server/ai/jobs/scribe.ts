import { z } from 'zod'
import { allyId, CONDITION_IDS, findSpell, findTemplate, guessRole, PARTY_MAX, PLACE_KINDS, SPELLS, templateOf, weatherNow, type ConditionId, type GameEvent, type GameState, type InventoryItem } from '@shared/rules'
import type { Provider } from '../providers'
import { activeQuests, entityLine, findEntity, parseTie, relevantEntities, RELATIONS, sameFaction, sameName, samePlace, type Memory, type Tie } from '@shared/memory'

const conditionEnum = z.enum(CONDITION_IDS as [ConditionId, ...ConditionId[]])
/**
 * One shape for every list of things, shared rather than repeated, so Claude's strict output
 * format (which has a size limit) compiles it once. Keep this schema lean: see anthropic.ts.
 */
const ItemQty = z.object({ name: z.string(), qty: z.number().int() })

/**
 * Everything named that the story's memory keeps, in one list: people, places, groups, quests
 * and notable items. One shape for all of them keeps Claude's strict format small (three lists
 * of their own left room for two more fields; one list, with quests, items and ties, for twelve).
 * Most fields matter only for some kinds; the rest stay at their defaults.
 */
const RecordSchema = z.object({
  kind: z
    .enum(['person', 'place', 'faction', 'quest', 'item'])
    .describe('person: a named character, not the player character. place: a named place. faction: a named group. quest: a task or aim the character has taken on or been asked to do. item: a notable named object (an heirloom, a relic, a letter, a key), not everyday gear'),
  name: z.string().describe('As the story gives it. A person with no name yet: how the story refers to them ("the barmaid"). A quest: a short title ("Find the missing ferry")'),
  otherNames: z.array(z.string()).default([]).describe('Other names or descriptions used. If someone recorded in KNOWN under a description now gives their real name, put the real name in name and the old description here'),
  what: z.string().default('').describe('One short line: who or what they are; for a quest, what has to be done. Empty if already known and unchanged'),
  newFacts: z.array(z.string()).default([]).describe('At most 2 short, lasting facts the story states (for a quest: progress made). Usually empty'),
  status: z
    .enum(['alive', 'dead', 'missing', 'unknown', 'active', 'done', 'failed'])
    .default('unknown')
    .describe('People: alive, dead or missing (missing only if the story says so), else unknown. Quests: active, done or failed. Everything else: unknown'),
  attitude: z.enum(['hostile', 'unfriendly', 'neutral', 'friendly', 'devoted', 'unknown']).default('unknown').describe('People only: how they now feel about the player character'),
  relation: z.enum(RELATIONS).default('none').describe("People only: how they're tied to the player character: child, parent, sibling, spouse, lover, friend, ally, companion, employer, rival, enemy, or none"),
  partOf: z.string().default('').describe('People: the named group they belong to ("the Town Watch"). Quests: who asked it of the character. Items: who has it now ("the player" for the player character). Otherwise empty'),
  ties: z.array(z.string()).default([]).describe('People only: their ties to other named characters the story states, each as "how: name" ("granddaughter of: Old Tam", "owes money to: Sergeant Pell"). Not ties to the player character'),
  standingChange: z
    .number()
    .int()
    .default(0)
    .describe("Factions only: -2 to 2, how the character's own deeds in this exchange changed what the group thinks of them. +1 a favour, +2 a great service, -1 a slight or an insult, -2 violence against them or a betrayal. Usually 0"),
  why: z.string().default('').describe('Factions only: if standingChange is not 0, a few words why ("helped the watch catch a thief")')
})

export const ScribeSchema = z.object({
  minutesPassed: z.number().int().describe('In-story minutes that passed during this narration (0 if barely any)'),
  rest: z.enum(['none', 'short', 'long']).describe('short = an hour or so of rest; long = a full night of sleep'),
  location: z.string().describe('Where the character now is, if it changed to a new named place; otherwise empty'),
  deed: z.string().describe('If the character did something people would talk about, a short line like "slew the river-thing at Millbrook"; otherwise empty'),
  deedRenown: z.number().int().describe('0 to 3: how much renown that deed earns (0 if none)'),
  itemsGained: z.array(ItemQty),
  itemsLost: z.array(ItemQty),
  coinsChange: z.number().int().describe('Coins gained (positive) or spent (negative), in copper. 10 copper = 1 silver, 100 copper = 1 gold'),
  milestoneXp: z.number().int().describe('0 to 50: XP for finishing a quest or a major story moment, otherwise 0'),
  healing: z.number().int().describe('Health restored by the story that is NOT from an item in itemsUsed (a healer, rest at a temple, magic), otherwise 0'),
  conditionsOn: z.array(conditionEnum),
  conditionsOff: z.array(conditionEnum),
  placeKind: z
    .enum([...PLACE_KINDS, 'unknown'] as [string, ...string[]])
    .describe('What sort of place the character is in now: town, village, indoors (inside a building), road, forest, hills (hills or mountains), water (river, lake, coast, at sea), ruin, underground (caves, mines, dungeons), wild (open country); unknown if unclear'),
  weather: z.enum(['clear', 'rain', 'storm', 'fog', 'snow', 'unchanged']).default('unchanged').describe('The weather now, if this exchange shows or changes it (clear skies, rain, a storm, fog, snow); unchanged if it says nothing about it, or the character is indoors'),
  ate: z.enum(['none', 'snack', 'meal', 'feast']).describe('Did the character eat food that is not from their own pack? snack = a bite or a drink; meal = a proper meal; feast = a big hot meal or banquet'),
  itemsUsed: z
    .array(ItemQty)
    .describe("Things from the character's own pack used up for their effect: eaten, drunk, a bandage or salve applied. Use the names from Carrying. Not things given away, sold or lost (those go in itemsLost)"),
  itemsEquipped: z.array(z.string()).describe('Things from the pack the character put on, wielded or took in hand in this exchange. Usually empty'),
  spellsLearned: z.array(z.string()).default([]).describe('Spells the character clearly learns in this exchange (from a teacher, a tome, a revelation), by name. Usually empty'),
  companionsJoined: z.array(z.string()).default([]).describe('People who now travel with the player character: they clearly agreed to come along in this exchange. By name. Usually empty'),
  companionsLeft: z
    .array(z.string())
    .default([])
    .describe('Companions (from TRAVELLING WITH) who go their own way in this exchange: they leave, stay behind, or are taken. Not someone who dies (record them as dead). Usually empty'),
  records: z.array(RecordSchema).default([]).describe('Everyone and everything named that matters in this exchange: people, places, groups, quests and notable items. At most 6')
})
export type ScribeOutput = z.infer<typeof ScribeSchema>
/** What the Scribe may leave out (the defaults fill it in). */
export type ScribeInput = z.input<typeof ScribeSchema>
export type ScribeRecord = z.infer<typeof RecordSchema>

const SYSTEM = `You are the Scribe for a fantasy roleplaying game. You keep the books. Read the latest exchange and record only what actually happened in it, conservatively. Do not invent anything. When in doubt, record nothing.

- minutesPassed: how long the scene took. Every scene takes some time: a quick exchange or a fight ~5, a conversation ~10, a search ~30, a meal ~45, travelling to the next village ~240. Never 0.
- rest: only if the character clearly rested or slept.
- deed: only for genuinely notable acts other people would hear about. Most turns have none.
- items and coins: only things the character clearly picked up, was given, bought, sold, used up or lost.
- healing: only for clear healing (potion, bandage, healer). Never for "you feel better".
- conditions: bleeding, poisoned, exhausted, hungry, frightened, captured, well_fed, inspired, hidden, wounded. Turn them on when the story clearly causes them; off when clearly resolved (freed from captivity, ate, cured).
- records are the game's long-term memory, so keep names spelled exactly as the story does. Record people who matter to the story even if they only appear briefly, and each place separately (an inn is not its village).
- Facts are what someone would still need to know a month later: "owes the player 5 silver", "lost two fingers to the river-thing", "is secretly the baron's son", "took the player prisoner". Never moods, gestures, smells, what a room looks like, or a blow-by-blow of a fight. Never guesses ("possibly", "seems to"): only what the story states. For someone already in KNOWN, add only what's new, and most turns add nothing.
- When someone recorded under a description ("grey-bearded man") gives their name, record them under the name and put the description in otherNames, so the record is renamed rather than duplicated.
- relation: only ties to the player character the story makes clear. A child is the player character's own son or daughter.
- ties: whenever the story says how two other characters are tied (family, marriage, debts, loyalties, feuds), record it on each of them as "how: name": "that's Wenna, my son's girl" said by Old Tam gives Wenna "granddaughter of: Old Tam" and Old Tam "grandfather of: Wenna".
- factions: named groups only. standingChange is for what the character did in this exchange, not for what the group is like; most turns it is 0.
- quests: when the character takes on a task that lasts beyond the scene (asked by someone, or of their own choosing: "I'll find out who burned the mill"), record it as active, with who asked it in partOf; when it's clearly achieved, done; when it can no longer be done, failed. Use the name from QUESTS for one already recorded. A passing errand isn't a quest.
- items: only notable things that matter to the story (an heirloom, a relic, a map, a letter, a key to something); never everyday gear. partOf says who has it. A notable thing the character is given or picks up also goes in itemsGained, like anything else they get.
- companionsJoined and companionsLeft: only when the story makes it clear someone now travels with the character, or a companion goes their own way. Someone walking alongside for one scene, or a guide hired for an afternoon, isn't a companion.
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
  const quests = memory ? activeQuests(memory).slice(0, 8) : []
  const party = state.party ?? []
  const prompt = `Character: ${c.build.name}. Carrying: ${c.inventory.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || 'nothing'}. Conditions: ${c.conditions.join(', ') || 'none'}. Location: ${state.location ?? 'unknown'}.
TRAVELLING WITH: ${party.map((a) => a.name).join(', ') || 'nobody'}.
${known.length ? `\nKNOWN (already recorded):\n${known.map((e) => entityLine(e, 4)).join('\n')}\n` : ''}${quests.length ? `\nQUESTS (open, already recorded): ${quests.map((q) => q.name).join('; ')}\n` : ''}
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

export function scribeToEvents(raw: ScribeInput, state: GameState, memory?: Memory, rng: () => number = Math.random): GameEvent[] {
  const out = ScribeSchema.parse(raw)
  const lim = limits(state)
  const events: GameEvent[] = []
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)))
  const me = state.character.build.name

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
  if (out.weather && out.weather !== 'unchanged' && out.weather !== weatherNow(state)) events.push({ type: 'weather', weather: out.weather })
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

  const records = (out.records ?? []).slice(0, 6)
  const people = records.filter((r) => r.kind === 'person')

  // Companions: who comes along, who goes their own way, who died.
  let party = [...(state.party ?? [])]
  const said = (n: string) => people.find((p) => sameName(p.name, n) || p.otherNames.some((o) => sameName(o, n)))
  const known = (n: string) => memory?.entities.find((e) => e.kind === 'person' && [e.name, ...e.aliases].some((x) => sameName(x, n)))
  for (const raw of (out.companionsJoined ?? []).slice(0, 2)) {
    const n = raw.trim()
    if (!n || n.length > 60 || sameName(n, me) || party.some((a) => sameName(a.name, n)) || party.length >= PARTY_MAX) continue
    const p = said(n)
    const e = known(n)
    if (p?.status === 'dead' || e?.status === 'dead') continue
    const name = e?.name ?? p?.name ?? n
    const role = guessRole([p?.what, e?.summary, ...(p?.newFacts ?? []), ...(e?.facts ?? [])].filter(Boolean).join('\n'))
    events.push({ type: 'party_join', companion: { id: allyId(name), name, role } })
    party = [...party, { id: allyId(name), name, role, wounds: 0, down: false, joinedDay: state.time.day }]
  }
  const gone = (n: string, why: 'left' | 'dead') => {
    const a = party.find((x) => sameName(x.name, n))
    if (!a) return
    events.push({ type: 'party_leave', id: a.id, name: a.name, why })
    party = party.filter((x) => x.id !== a.id)
  }
  for (const p of people) if (p.status === 'dead') [p.name, ...p.otherNames].forEach((n) => gone(n, 'dead'))
  for (const n of (out.companionsLeft ?? []).slice(0, PARTY_MAX)) gone(n, 'left')

  const coins = clamp(out.coinsChange, -state.character.coins, lim.coins)
  if (coins) events.push({ type: 'coins', delta: coins })

  const xp = clamp(out.milestoneXp, 0, lim.xp)
  if (xp) events.push({ type: 'xp', amount: xp, reason: 'Story milestone' })

  const heal = clamp(out.healing, 0, lim.heal)
  if (heal && state.character.status !== 'dead') events.push({ type: 'heal', amount: heal, reason: 'Treated' })

  const has = new Set(state.character.conditions)
  for (const id of new Set(out.conditionsOn)) if (!has.has(id)) events.push({ type: 'condition', id, on: true })
  for (const id of new Set(out.conditionsOff)) if (has.has(id)) events.push({ type: 'condition', id, on: false })

  // Long-term memory: people, places, groups, quests and notable things. Never the player
  // character themself.
  const day = state.time.day
  const line = (t: string, max: number) => t.replace(/\s+/g, ' ').trim().slice(0, max)
  const facts = (xs: string[], n: number) =>
    xs
      .map((f) => line(f, 160))
      .filter((f) => f.length > 3 && !/\b(possibly|perhaps|probably|maybe|seems to|appears to|might be)\b/i.test(f))
      .slice(0, n)
  const aliases = (r: ScribeRecord, max: number) => r.otherNames.map((a) => line(a, max)).filter(Boolean).slice(0, 3)
  // A tie points at someone (or a group) by name, not at a thing or a description of one.
  const aName = (n: string) => /^\p{Lu}/u.test(n.replace(/^the\s+/i, '')) && !/[,;.]/.test(n) && n.split(/\s+/).length <= 5
  const whose = (holder: string) => (sameName(holder, me) || /^(the )?(player|player character|you)$/i.test(holder) ? 'you' : holder)
  for (const p of people.slice(0, 4)) {
    const name = line(p.name, 50)
    // Skip the player character, and descriptions posing as names ("the tall guard").
    if (!name || sameName(name, me) || (/^(a|an|the|some)\s/i.test(name) && /^[a-z]/.test(name.split(' ').at(-1)!))) continue
    const already = memory ? findEntity(memory, 'person', name, p.otherNames) : undefined
    const status = p.status === 'alive' || p.status === 'dead' || p.status === 'missing' ? p.status : already ? undefined : 'alive'
    const ties = p.ties
      .map(parseTie)
      .filter((t): t is Tie => t !== null && aName(t.name) && !sameName(t.name, me) && !sameName(t.name, name))
      .slice(0, 4)
    events.push({
      type: 'entity',
      kind: 'person',
      name,
      aliases: aliases(p, 50),
      summary: line(p.what, 140) || undefined,
      facts: facts(p.newFacts, 2),
      status,
      attitude: p.attitude === 'unknown' ? undefined : p.attitude,
      relation: p.relation && p.relation !== 'none' ? p.relation : undefined,
      faction: line(p.partOf, 60) || undefined,
      ...(ties.length ? { ties } : {}),
      day
    })
  }
  for (const pl of records.filter((r) => r.kind === 'place').slice(0, 2)) {
    const name = line(pl.name, 60)
    if (!name) continue
    events.push({ type: 'entity', kind: 'place', name, summary: line(pl.what, 140) || undefined, facts: facts(pl.newFacts, 1), day })
  }
  // Groups, and what the character's deeds did to what they think of them.
  for (const f of records.filter((r) => r.kind === 'faction').slice(0, 2)) {
    const name = line(f.name, 60)
    if (!name || name.length < 3) continue
    const change = clamp(f.standingChange ?? 0, -2, 2)
    const why = line(f.why ?? '', 120)
    events.push({
      type: 'entity',
      kind: 'faction',
      name,
      summary: line(f.what ?? '', 140) || undefined,
      facts: change && why ? [`${why} (${change > 0 ? '+' : '−'}${Math.abs(change)})`] : [],
      ...(change ? { standingChange: change } : {}),
      day
    })
  }
  // Quests: what the character has taken on, and how it ends.
  for (const q of records.filter((r) => r.kind === 'quest').slice(0, 2)) {
    const name = line(q.name, 80)
    if (!name || name.length < 3) continue
    const already = memory ? findEntity(memory, 'quest', name, q.otherNames) : undefined
    const status = q.status === 'active' || q.status === 'done' || q.status === 'failed' ? q.status : already ? undefined : 'active'
    events.push({ type: 'entity', kind: 'quest', name, aliases: aliases(q, 80), summary: line(q.what, 160) || undefined, facts: facts(q.newFacts, 2), status, giver: line(q.partOf, 60) || undefined, day })
  }
  // Notable things, and who has them.
  for (const it of records.filter((r) => r.kind === 'item').slice(0, 2)) {
    const name = line(it.name, 60)
    if (!name || name.length < 3) continue
    const holder = line(it.partOf, 60)
    events.push({ type: 'entity', kind: 'item', name, aliases: aliases(it, 60), summary: line(it.what, 140) || undefined, facts: facts(it.newFacts, 2), holder: holder ? whose(holder) : undefined, day })
  }
  // The groups people belong to are on record too.
  for (const ev of [...events]) {
    if (ev.type !== 'entity' || ev.kind !== 'person' || !ev.faction) continue
    const g = ev.faction
    if (!events.some((e) => e.type === 'entity' && e.kind === 'faction' && sameFaction(e.name, g)) && !(memory && findEntity(memory, 'faction', g))) events.push({ type: 'entity', kind: 'faction', name: g, day })
  }
  // The place the character is now at is always on record.
  const at = events.find((e) => e.type === 'location') as { name: string } | undefined
  if (at && !events.some((e) => e.type === 'entity' && e.kind === 'place' && samePlace(e.name, at.name))) {
    events.push({ type: 'entity', kind: 'place', name: at.name, day })
  }
  return events
}
