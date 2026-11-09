import { skillLevelFromXp, type Rng } from './character'
import { resolveCheck, type CheckRequest, type CheckResult } from './checks'
import { hasTool, templateOf, TOOL_SKILLS } from './gear'
import { findTemplate, itemTemplate } from './items'
import { applyEvent, SETTLED, type CampaignSettings, type GameEvent, type GameState, type PlaceKind } from './state'
import { SKILLS, TIER_INFO, type Difficulty, type SkillId, type Tier } from './tables'
import { seasonGathering, seasonOf } from './calendar'

/**
 * Gathering and crafting (docs/spec/04-rules-system.md#items-equipment-money). Gathering turns
 * a place into materials; crafting turns materials into things worth carrying: food that feeds,
 * potions that save lives, arrows, armour and blades. The engine rolls the check and moves the
 * items; the narrator tells it.
 */

export type GatherSkill = 'mining' | 'woodcutting' | 'fishing' | 'hunting' | 'herbalism'
export type CraftSkill = 'cooking' | 'alchemy' | 'fletching' | 'crafting' | 'smithing'

export type GatherNode = {
  id: string
  skill: GatherSkill
  /** Item template ids found, with how many on a narrow and on a great success. */
  yields: { item: string; qty: [number, number] }[]
  where: PlaceKind[]
  minLevel: number
  difficulty: Difficulty
}

const WILDS: PlaceKind[] = ['forest', 'hills', 'wild']

export const NODES: GatherNode[] = [
  { id: 'copper', skill: 'mining', yields: [{ item: 'copper_ore', qty: [1, 3] }], where: ['hills', 'underground', 'ruin'], minLevel: 1, difficulty: 'easy' },
  { id: 'tin', skill: 'mining', yields: [{ item: 'tin_ore', qty: [1, 3] }], where: ['hills', 'underground'], minLevel: 1, difficulty: 'easy' },
  { id: 'coal', skill: 'mining', yields: [{ item: 'coal', qty: [1, 3] }], where: ['hills', 'underground'], minLevel: 1, difficulty: 'easy' },
  { id: 'iron', skill: 'mining', yields: [{ item: 'iron_ore', qty: [1, 3] }], where: ['hills', 'underground', 'ruin'], minLevel: 3, difficulty: 'moderate' },
  { id: 'silver', skill: 'mining', yields: [{ item: 'silver_ore', qty: [1, 2] }], where: ['underground'], minLevel: 6, difficulty: 'hard' },
  { id: 'gems', skill: 'mining', yields: [{ item: 'rough_gem', qty: [1, 1] }], where: ['underground'], minLevel: 8, difficulty: 'very_hard' },
  { id: 'logs', skill: 'woodcutting', yields: [{ item: 'logs', qty: [1, 3] }], where: [...WILDS, 'road'], minLevel: 1, difficulty: 'easy' },
  { id: 'oak', skill: 'woodcutting', yields: [{ item: 'oak_logs', qty: [1, 2] }], where: ['forest', 'hills'], minLevel: 3, difficulty: 'moderate' },
  { id: 'yew', skill: 'woodcutting', yields: [{ item: 'yew_logs', qty: [1, 2] }], where: ['forest'], minLevel: 6, difficulty: 'hard' },
  { id: 'fish', skill: 'fishing', yields: [{ item: 'raw_fish', qty: [1, 3] }], where: ['water'], minLevel: 1, difficulty: 'easy' },
  { id: 'eel', skill: 'fishing', yields: [{ item: 'raw_eel', qty: [1, 2] }], where: ['water'], minLevel: 3, difficulty: 'moderate' },
  { id: 'game', skill: 'hunting', yields: [{ item: 'raw_meat', qty: [1, 3] }, { item: 'hide', qty: [0, 1] }], where: WILDS, minLevel: 1, difficulty: 'moderate' },
  { id: 'fowl', skill: 'hunting', yields: [{ item: 'raw_meat', qty: [1, 1] }, { item: 'feathers', qty: [2, 6] }], where: [...WILDS, 'water'], minLevel: 1, difficulty: 'easy' },
  { id: 'herbs', skill: 'herbalism', yields: [{ item: 'common_herbs', qty: [1, 4] }], where: [...WILDS, 'road', 'ruin'], minLevel: 1, difficulty: 'easy' },
  { id: 'moss', skill: 'herbalism', yields: [{ item: 'healing_moss', qty: [1, 3] }], where: ['forest', 'water', 'wild'], minLevel: 2, difficulty: 'moderate' },
  { id: 'nightshade', skill: 'herbalism', yields: [{ item: 'nightshade', qty: [1, 2] }], where: ['forest', 'ruin', 'underground'], minLevel: 4, difficulty: 'hard' }
]

/** Where a recipe has to be made: over a fire, or at a forge. */
export type Station = 'fire' | 'forge'

export type Recipe = {
  id: string
  /** Template id of what's made, and how many. */
  output: string
  qty: number
  skill: CraftSkill
  inputs: { item: string; qty: number }[]
  minLevel: number
  difficulty: Difficulty
  station?: Station
  /** What the player says they do ("brew", "fletch"…). */
  verb: string
}

const r = (id: string, skill: CraftSkill, verb: string, output: string, qty: number, inputs: [string, number][], minLevel: number, difficulty: Difficulty, station?: Station): Recipe => ({
  id,
  output,
  qty,
  skill,
  verb,
  inputs: inputs.map(([item, n]) => ({ item, qty: n })),
  minLevel,
  difficulty,
  station
})

export const RECIPES: Recipe[] = [
  // Cooking: food that feeds properly (and a hearty meal leaves you well fed).
  r('roast_meat', 'cooking', 'roast', 'roast_meat', 1, [['raw_meat', 1]], 1, 'easy', 'fire'),
  r('cooked_fish', 'cooking', 'cook', 'cooked_fish', 1, [['raw_fish', 1]], 1, 'easy', 'fire'),
  r('cooked_eel', 'cooking', 'cook', 'cooked_fish', 2, [['raw_eel', 1]], 2, 'easy', 'fire'),
  r('dried_meat', 'cooking', 'dry and smoke', 'dried_meat', 2, [['raw_meat', 1]], 2, 'moderate', 'fire'),
  r('stew', 'cooking', 'cook', 'stew', 2, [['raw_meat', 1], ['common_herbs', 1]], 3, 'moderate', 'fire'),
  // Alchemy and herb-lore: what keeps an adventurer alive.
  r('healing_salve', 'alchemy', 'mix', 'healing_salve', 1, [['healing_moss', 1], ['common_herbs', 1]], 1, 'easy'),
  r('healing_draught', 'alchemy', 'brew', 'healing_draught', 1, [['healing_moss', 2], ['empty_vial', 1]], 2, 'moderate', 'fire'),
  r('antidote', 'alchemy', 'brew', 'antidote', 1, [['common_herbs', 2], ['nightshade', 1], ['empty_vial', 1]], 3, 'moderate', 'fire'),
  // Fletching.
  r('arrow_shafts', 'fletching', 'whittle', 'arrow_shafts', 10, [['logs', 1]], 1, 'easy'),
  r('arrows', 'fletching', 'fletch', 'arrows', 10, [['arrow_shafts', 10], ['feathers', 2]], 1, 'easy'),
  r('shortbow', 'fletching', 'make', 'shortbow', 1, [['logs', 1], ['bowstring', 1]], 3, 'moderate'),
  r('longbow', 'fletching', 'make', 'longbow', 1, [['yew_logs', 1], ['bowstring', 1]], 6, 'hard'),
  // Leather and cloth.
  r('bandages', 'crafting', 'tear and roll', 'bandages', 3, [['cloth', 1]], 1, 'easy'),
  r('leather', 'crafting', 'tan', 'leather', 1, [['hide', 1]], 1, 'easy'),
  r('bowstring', 'crafting', 'twist', 'bowstring', 2, [['hide', 1]], 1, 'moderate'),
  r('leather_cap', 'crafting', 'sew', 'leather_cap', 1, [['leather', 1]], 2, 'easy'),
  r('gloves', 'crafting', 'sew', 'gloves', 1, [['leather', 1]], 2, 'easy'),
  r('boots', 'crafting', 'make', 'boots', 1, [['leather', 2]], 3, 'moderate'),
  r('leather_armor', 'crafting', 'make', 'leather_armor', 1, [['leather', 3]], 4, 'moderate'),
  // Smithing, at a forge.
  r('bronze_bar', 'smithing', 'smelt', 'bronze_bar', 1, [['copper_ore', 1], ['tin_ore', 1]], 1, 'easy', 'forge'),
  r('iron_bar', 'smithing', 'smelt', 'iron_bar', 1, [['iron_ore', 2], ['coal', 1]], 3, 'moderate', 'forge'),
  r('silver_bar', 'smithing', 'smelt', 'silver_bar', 1, [['silver_ore', 2], ['coal', 1]], 6, 'hard', 'forge'),
  r('dagger', 'smithing', 'forge', 'dagger', 1, [['iron_bar', 1]], 3, 'moderate', 'forge'),
  r('shortsword', 'smithing', 'forge', 'shortsword', 1, [['iron_bar', 2]], 4, 'moderate', 'forge'),
  r('sword', 'smithing', 'forge', 'sword', 1, [['iron_bar', 3]], 5, 'hard', 'forge'),
  r('iron_helm', 'smithing', 'forge', 'iron_helm', 1, [['iron_bar', 2]], 4, 'moderate', 'forge'),
  r('chain_shirt', 'smithing', 'forge', 'chain_shirt', 1, [['iron_bar', 5]], 7, 'hard', 'forge'),
  r('ring', 'smithing', 'make', 'ring', 1, [['silver_bar', 1]], 5, 'hard', 'forge')
]

export const nameOf = (id: string) => itemTemplate(id)?.name ?? id
export const recipeName = (rc: Recipe) => nameOf(rc.output)

/** What the player says when they tap "Make" ("I brew a healing draught."). */
export function recipeAction(rc: Recipe): string {
  const name = recipeName(rc).toLowerCase()
  const plural = rc.qty > 1 || /s$/.test(name)
  return `I ${rc.verb} ${plural ? name : `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`}.`
}

/** How many of an item (by template id) the character carries. */
export function countOf(st: GameState, item: string): number {
  return st.character.inventory.filter((i) => templateOf(i)?.id === item).reduce((n, i) => n + i.qty, 0)
}

const levelIn = (st: GameState, s: SkillId) => skillLevelFromXp(st.character.skillXp[s] ?? 0)

/** Whether a recipe can be made here and now, and if not, why not. */
export function canMake(st: GameState, rc: Recipe): { ok: boolean; why?: string; missing: { item: string; qty: number }[] } {
  const missing = rc.inputs.filter((x) => countOf(st, x.item) < x.qty).map((x) => ({ item: x.item, qty: x.qty - countOf(st, x.item) }))
  const lvl = levelIn(st, rc.skill)
  if (lvl < rc.minLevel) return { ok: false, why: `Needs ${SKILLS[rc.skill].label} ${rc.minLevel} (you have ${lvl}).`, missing }
  if (missing.length) return { ok: false, why: `Missing ${missing.map((m) => `${m.qty} × ${nameOf(m.item)}`).join(', ')}.`, missing }
  const station = stationProblem(st, rc.station)
  if (station) return { ok: false, why: station, missing }
  return { ok: true, missing }
}

/** A fire is easy to come by in town, or with a tinderbox; a forge only where there's a smithy. */
function stationProblem(st: GameState, station?: Station): string | null {
  const settled = st.placeKind ? SETTLED.includes(st.placeKind) : true
  if (station === 'forge' && !settled) return 'Needs a forge: find a smithy in a town or village.'
  if (station === 'fire' && !settled && !st.character.inventory.some((i) => templateOf(i)?.id === 'tinderbox') && st.placeKind !== 'water')
    return 'Needs a fire: carry a tinderbox, or find a hearth.'
  return null
}

// ---- matching the player's words -----------------------------------------------------------

const GATHER_WORDS: [GatherSkill, RegExp][] = [
  ['mining', /\b(mine|mining|ore|dig|quarry|vein|seam|coal|copper|iron|tin|silver|gem)/i],
  ['woodcutting', /\b(wood|log|logs|chop|fell|timber|tree|firewood|lumber)/i],
  ['fishing', /\b(fish|fishing|eel|angle|net)/i],
  ['herbalism', /\b(herb|herbs|plant|root|moss|flower|leaf|leaves|nightshade|forage|mushroom)/i],
  ['hunting', /\b(hunt|hunting|trap|snare|game|deer|rabbit|hare|boar|bird|fowl|meat|hide|pelt|skin)/i]
]

/** The gathering spot for what the player is after, here. */
export function findNode(st: GameState, what: string, skillHint?: SkillId): { node?: GatherNode; why?: string } {
  const tpl = findTemplate(what)
  let options = tpl ? NODES.filter((n) => n.yields.some((y) => y.item === tpl.id)) : []
  if (!options.length) {
    const skill = GATHER_WORDS.find(([, re]) => re.test(what))?.[0] ?? (GATHER_SKILLS.includes(skillHint as GatherSkill) ? (skillHint as GatherSkill) : undefined)
    options = skill ? NODES.filter((n) => n.skill === skill) : []
  }
  if (!options.length) return { why: `There's no way to gather "${what}".` }
  // Spots that suit the place come first. The place is only a hint: the story may be moving
  // ("I head into the woods to hunt") before the game has caught up with where they are.
  const fit = st.placeKind ? options.filter((n) => n.where.includes(st.placeKind!)) : options
  const here = fit.length ? fit : options
  // The best spot the character knows how to work, or the easiest if none.
  const known = here.filter((n) => levelIn(st, n.skill) >= n.minLevel).sort((a, b) => b.minLevel - a.minLevel)
  const node = tpl ? (known.find((n) => n.yields.some((y) => y.item === tpl.id)) ?? known[0]) : known[0]
  if (!node) {
    const easiest = [...here].sort((a, b) => a.minLevel - b.minLevel)[0]
    return { why: `Needs ${SKILLS[easiest.skill].label} ${easiest.minLevel} to gather ${nameOf(easiest.yields[0].item).toLowerCase()}.` }
  }
  return { node }
}

/** "roasting" and "roasted" are both "roast". */
const stem = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s)$/, '')

/**
 * The recipe for what the player wants to make: by id (the Bag's Make button), by what it makes
 * ("a healing draught"), or by how and from what ("roasting the meat", "brewing the moss").
 */
export function findRecipe(what: string): Recipe | undefined {
  const byId = RECIPES.find((x) => x.id === what)
  if (byId) return byId
  const tpl = findTemplate(what)
  const byOutput = tpl ? RECIPES.find((x) => x.output === tpl.id) : undefined
  if (byOutput) return byOutput
  const words = what.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  const stems = new Set(words.map(stem))
  return RECIPES.find(
    (rc) =>
      rc.verb.split(' ').some((v) => stems.has(stem(v))) &&
      rc.inputs.some((x) => nameOf(x.item).toLowerCase().split(/[^a-z]+/).some((w) => w.length > 3 && (words.includes(w) || stems.has(stem(w)))))
  )
}

// ---- doing the work --------------------------------------------------------------------------

/** What the Referee (or the Make button) says the character works at. */
export type Work = { kind: 'gather' | 'craft'; what: string; skill?: SkillId }

export const GATHER_SKILLS: GatherSkill[] = ['mining', 'woodcutting', 'fishing', 'hunting', 'herbalism']
export const CRAFT_SKILLS: CraftSkill[] = ['cooking', 'alchemy', 'fletching', 'crafting', 'smithing']

/**
 * The Referee sometimes asks for a plain Herbalism or Cooking check instead of naming the work.
 * Gathering checks are always work; a crafting check is when it names something with a recipe.
 */
export function workFromChecks(checks: CheckRequest[]): Work | undefined {
  const g = checks.find((ch) => GATHER_SKILLS.includes(ch.skill as GatherSkill))
  if (g) return { kind: 'gather', what: g.reason, skill: g.skill }
  const c = checks.find((ch) => CRAFT_SKILLS.includes(ch.skill as CraftSkill) && findRecipe(ch.reason))
  return c ? { kind: 'craft', what: c.reason, skill: c.skill } : undefined
}

const SKILL_OF: Record<string, SkillId[]> = { gather: ['mining', 'woodcutting', 'fishing', 'hunting', 'herbalism'], craft: ['cooking', 'alchemy', 'fletching', 'crafting', 'smithing'] }
/** Skills the work rolls itself (so a Referee check for the same thing isn't rolled twice). */
export const WORK_SKILLS = new Set<SkillId>([...SKILL_OF.gather, ...SKILL_OF.craft])

const RISK: Partial<Record<SkillId, CheckRequest['risk']>> = {
  mining: { severity: 'light', source: 'environment' },
  woodcutting: { severity: 'light', source: 'environment' },
  hunting: { severity: 'light', source: 'beast' },
  smithing: { severity: 'light', source: 'environment' }
}

/** How much a success brings in: the low end on a narrow one, the high end on a great one. */
function amount([lo, hi]: [number, number], tier: Tier): number {
  if (tier === 'narrow_success') return lo
  if (tier === 'clean_success') return Math.round((lo + hi) / 2)
  if (tier === 'overwhelming') return hi
  return hi + (hi > 1 ? 1 : 0)
}

const listOf = (xs: { item: string; qty: number }[]) => xs.map((x) => `${x.qty} × ${nameOf(x.item)}`).join(', ')

export function resolveWork(
  state: GameState,
  settings: CampaignSettings,
  work: Work,
  rng: Rng
): { events: GameEvent[]; results: CheckResult[]; state: GameState; log: string[] } {
  const events: GameEvent[] = []
  const results: CheckResult[] = []
  const log: string[] = []
  let working = state
  const push = (ev: GameEvent) => {
    events.push(ev)
    working = applyEvent(working, ev, settings)
  }
  const done = () => ({ events, results, state: working, log })
  const roll = (skill: SkillId, difficulty: Difficulty, reason: string, bonuses?: CheckRequest['bonuses']) => {
    const req: CheckRequest = { skill, difficulty, modifier: 0, advantage: 'none', reason, dramatic: false, withStrangers: false, risk: RISK[skill] ?? { severity: 'none', source: 'environment' }, ...(bonuses?.length ? { bonuses } : {}) }
    const res = resolveCheck(working, settings, req, rng)
    results.push(res.result)
    res.events.forEach(push)
    return res.result
  }

  if (work.kind === 'gather') {
    const { node, why } = findNode(working, work.what, work.skill)
    if (!node) {
      log.push(`GATHERING: ${why} Narrate the character looking and finding nothing worth taking.`)
      return done()
    }
    const main = nameOf(node.yields[0].item).toLowerCase()
    if (TOOL_SKILLS.includes(node.skill) && !hasTool(working.character, node.skill)) log.push(`(No proper tools for ${SKILLS[node.skill].label.toLowerCase()}: the roll is harder.)`)
    const season = seasonGathering(node.skill, seasonOf(working.time.day))
    if (season) log.push(`(${season.why}: ${season.value > 0 ? 'easier' : 'harder'} this time of year.)`)
    const res = roll(node.skill, node.difficulty, `gathering ${main}`, season ? [{ label: season.why, value: season.value }] : undefined)
    if (!TIER_INFO[res.tier].success) {
      log.push(`GATHERING: nothing gathered this time${res.damage ? '' : ' (the time is spent all the same)'}.`)
      return done()
    }
    const got = node.yields.map((y) => ({ item: y.item, qty: amount(y.qty, res.tier) })).filter((y) => y.qty > 0)
    for (const g of got) push({ type: 'item', name: nameOf(g.item), delta: g.qty, icon: itemTemplate(g.item)?.icon })
    log.push(`GATHERING: the character gets ${listOf(got)}.`)
    return done()
  }

  const rc = findRecipe(work.what)
  if (!rc) {
    log.push(`CRAFTING: the character doesn't know how to make "${work.what}". Narrate them trying and getting nowhere, or realising they'd need someone to teach them.`)
    return done()
  }
  const name = recipeName(rc)
  const can = canMake(working, rc)
  if (!can.ok) {
    log.push(`CRAFTING ${name.toUpperCase()}: not possible. ${can.why} Narrate why it can't be done yet; nothing is used up.`)
    return done()
  }
  if (!hasTool(working.character, rc.skill)) log.push(`(No proper tools for ${SKILLS[rc.skill].label.toLowerCase()}: the roll is harder.)`)
  const res = roll(rc.skill, rc.difficulty, `making ${rc.qty > 1 ? `${rc.qty} ${name.toLowerCase()}` : name.toLowerCase()}`)
  const success = TIER_INFO[res.tier].success
  // A narrow failure wastes only time; a worse one spoils half the materials, a critical one all.
  const lost = success ? rc.inputs : res.tier === 'narrow_failure' ? [] : res.tier === 'crit_failure' ? rc.inputs : rc.inputs.map((x) => ({ item: x.item, qty: Math.ceil(x.qty / 2) }))
  for (const x of lost) {
    // Take the materials from whatever the pack calls them.
    let left = x.qty
    for (const it of working.character.inventory.filter((i) => templateOf(i)?.id === x.item)) {
      if (left <= 0) break
      const n = Math.min(left, it.qty)
      push({ type: 'item', name: it.name, delta: -n })
      left -= n
    }
  }
  if (!success) {
    log.push(`CRAFTING ${name.toUpperCase()}: it doesn't work out. ${lost.length ? `Spoiled: ${listOf(lost)}.` : 'Nothing is spoiled; only time is lost.'}`)
    return done()
  }
  const stackable = ['ammo', 'food', 'medicine', 'material'].includes(itemTemplate(rc.output)?.kind ?? '')
  const made = rc.qty + (res.tier === 'crit_success' && stackable ? Math.max(1, Math.round(rc.qty / 2)) : 0)
  push({ type: 'item', name, delta: made, icon: itemTemplate(rc.output)?.icon })
  log.push(`CRAFTING: used ${listOf(rc.inputs)}; made ${made} × ${name}${res.tier === 'crit_success' ? ' (more than hoped: a fine piece of work)' : ''}.`)
  return done()
}
