import {
  charLevelFromXp,
  maxHp,
  maxMana,
  maxStamina,
  mod,
  attrCaps,
  skillXpForLevel,
  startingSkillLevel,
  type CharacterBuild
} from './character'
import {
  ATTRS,
  BACKGROUNDS,
  AGES,
  RENOWN_MAX,
  RENOWN_PER_LEVEL,
  SKILL_IDS,
  SKILL_TO_CHAR_XP,
  type Attr,
  type ConditionId,
  type HarmSource,
  type Mercy,
  type RollMode,
  type SexMode,
  type SkillId
} from './tables'
import type { CheckResult } from './checks'
import { isMemoryEvent, type MemoryEvent } from '../memory'
import { findTemplate, itemTemplate, type ItemTemplate, type Slot } from './items'
import type { Combat, CombatOutcome, FoeStatus } from './combat'

export type CombatMode = 'narrative' | 'turn' | 'mixed'
export type EventFrequency = 'calm' | 'normal' | 'eventful' | 'chaos'

export type CampaignSettings = {
  sexModifiers: SexMode
  mercy: Mercy
  rollMode: RollMode
  failForward: boolean
  ironman: boolean
  tone: 'grim' | 'grounded' | 'heroic' | 'whimsical' | 'horror'
  length: 'short' | 'medium' | 'long'
  /** Fights: told in prose, on a turn tracker, or tracked once they get serious (docs/spec/04-rules-system.md#modes-campaign-setting). */
  combat: CombatMode
  /** Hunger and tiredness. */
  survival: boolean
  /** How often random events happen. */
  events: EventFrequency
  /** How readily the Referee calls for dice. */
  rolls: 'fewer' | 'normal' | 'more'
  /** Whether the DM may describe the player character's small involuntary reactions. */
  acting: 'never' | 'light'
  pacing: 'sandbox' | 'guided'
  perspective: 'second' | 'third'
  /** Things to avoid or fade to black (free text). */
  limits: string
  /** Who the DM is: a built-in persona id, or "card:<id>" for a character card. */
  persona: string
}

export const DEFAULT_SETTINGS: CampaignSettings = {
  sexModifiers: 'realistic',
  mercy: 'harsh',
  rollMode: 'dramatic',
  failForward: false,
  ironman: false,
  tone: 'grounded',
  length: 'medium',
  combat: 'mixed',
  survival: true,
  events: 'normal',
  rolls: 'normal',
  acting: 'never',
  pacing: 'sandbox',
  perspective: 'second',
  limits: '',
  persona: 'chronicler'
}

/** Settings saved before a setting existed get its default. */
export const normalizeSettings = (s: Partial<CampaignSettings> | undefined): CampaignSettings => ({ ...DEFAULT_SETTINGS, ...(s ?? {}) })

/** What sort of place the character is in (for random events and survival). */
export const PLACE_KINDS = ['town', 'village', 'indoors', 'road', 'forest', 'hills', 'water', 'ruin', 'underground', 'wild'] as const
export type PlaceKind = (typeof PLACE_KINDS)[number]
export const SETTLED: PlaceKind[] = ['town', 'village', 'indoors']

export type InventoryItem = {
  name: string
  qty: number
  icon?: string
  /** The item template this is (see items.ts), when the engine recognises it. */
  template?: string
  /** Where it's worn or held, if it is. */
  equipped?: Slot
}
export type Status = 'alive' | 'downed' | 'dead'

export type CharacterState = {
  build: CharacterBuild
  attributes: Record<Attr, number>
  attrPoints: number
  skillXp: Record<SkillId, number>
  xp: number
  level: number
  renown: number
  deeds: { text: string; day: number }[]
  hp: number
  stamina: number
  mana: number
  conditions: ConditionId[]
  coins: number
  inventory: InventoryItem[]
  status: Status
  deathRolls: { success: number; fail: number }
  /** Day the once-per-day race trait was last used. */
  traitUsedDay: number | null
  /** Minutes since the last proper meal, and since the last long sleep (survival needs). */
  hungerMins: number
  awakeMins: number
}

export type GameState = {
  character: CharacterState
  /** In-game clock: day number and minutes since midnight. */
  time: { day: number; minute: number }
  location: string | null
  placeKind: PlaceKind | null
  /** A fight on the turn tracker, if one is going on (see combat.ts). */
  combat: Combat | null
}

/** One recorded change. Every event belongs to the message that caused it. */
export type GameEvent =
  | { type: 'roll'; check: CheckResult }
  | { type: 'skill_xp'; skill: SkillId; amount: number }
  | { type: 'xp'; amount: number; reason: string }
  | { type: 'damage'; amount: number; source: HarmSource; reason: string }
  | { type: 'heal'; amount: number; reason: string }
  | { type: 'set_hp'; hp: number; reason: string }
  | { type: 'stamina'; delta: number }
  | { type: 'mana'; delta: number }
  | { type: 'condition'; id: ConditionId; on: boolean }
  | { type: 'rest'; kind: 'short' | 'long' }
  | { type: 'time'; minutes: number }
  | { type: 'renown'; amount: number; deed?: string }
  | { type: 'coins'; delta: number }
  | { type: 'item'; name: string; delta: number; icon?: string; spent?: boolean }
  | { type: 'status'; status: Status; reason: string }
  | { type: 'death_roll'; roll: number; success: boolean; double: boolean }
  | { type: 'attr_spend'; attr: Attr }
  | { type: 'location'; name: string }
  | { type: 'place_kind'; kind: PlaceKind }
  | { type: 'trait_used' }
  /** Put something on or take it in hand; the engine picks the slot. */
  | { type: 'equip'; name: string; slot?: Slot }
  | { type: 'unequip'; name: string }
  /** Eat, drink or apply one of something. Healing is rolled when the event is made. */
  | { type: 'use_item'; name: string; heal?: number }
  /** A meal that isn't from the pack (an inn, a host's table). */
  | { type: 'eat'; hours: number; wellFed?: boolean }
  /** Fights (combat.ts): every number in a fight is an event, so rerolls and rewinds work. */
  | { type: 'combat_start'; combat: Combat }
  | { type: 'combat_round'; round: number }
  | { type: 'combat_dodge' }
  | { type: 'combat_end'; outcome: CombatOutcome }
  | { type: 'foe_hit'; id: string; amount: number; name?: string }
  | { type: 'foe_status'; id: string; status: FoeStatus; name?: string }
  /** A foe's attack on the player (for the log; the damage itself is a "damage" event). */
  | { type: 'foe_attack'; id: string; roll: number; total: number; defense: number; hit: boolean; crit: boolean; damage: number; name?: string }
  /** A random event happened this turn (kept so they don't pile up). */
  | { type: 'world_event'; id: string; text: string }
  /** Long-term memory: people, places and summaries (see shared/memory.ts). */
  | MemoryEvent

// ---- Derived values -------------------------------------------------------------------

export function derived(state: GameState, settings: CampaignSettings) {
  const c = state.character
  const b = c.build
  return {
    maxHp: maxHp(b.sex, settings.sexModifiers, c.attributes.END, c.level),
    maxStamina: maxStamina(c.attributes.END, c.attributes.AGI),
    maxMana: maxMana(c.attributes.ARC, c.level),
    attrCaps: attrCaps(b, settings.sexModifiers)
  }
}

// ---- Starting state -------------------------------------------------------------------

export function initialState(build: CharacterBuild, settings: CampaignSettings): GameState {
  const bg = BACKGROUNDS[build.background]
  const skillXp = Object.fromEntries(
    SKILL_IDS.map((s) => [s, skillXpForLevel(startingSkillLevel(build, s))])
  ) as Record<SkillId, number>
  const attributes = { ...build.attributes }
  const level = 1
  const character: CharacterState = {
    build,
    attributes,
    attrPoints: 0,
    skillXp,
    xp: 0,
    level,
    renown: AGES[build.age].renown,
    deeds: [],
    hp: maxHp(build.sex, settings.sexModifiers, attributes.END, level),
    stamina: maxStamina(attributes.END, attributes.AGI),
    mana: maxMana(attributes.ARC, level),
    conditions: [],
    coins: bg.coins,
    inventory: [],
    status: 'alive',
    deathRolls: { success: 0, fail: 0 },
    traitUsedDay: null,
    // Breakfast at six, up at six.
    hungerMins: 120,
    awakeMins: 120
  }
  for (const k of bg.kit) addItem(character, k.name, 'qty' in k && k.qty ? k.qty : 1, k.icon)
  return { character, time: { day: 1, minute: 8 * 60 }, location: null, placeKind: null, combat: null }
}

/** A proper meal (12 hours of food or more) leaves you fed whatever came before; a snack takes the edge off. */
const feed = (hungerMins: number, hours: number) => (hours >= 12 ? 0 : Math.max(0, hungerMins - hours * 60))

// ---- Items ------------------------------------------------------------------------------

/** The slot an item would go in, or undefined if it isn't worn or held. */
function slotFor(c: CharacterState, tpl: ItemTemplate, wanted?: Slot): Slot | undefined {
  switch (tpl.fit) {
    case 'hand':
      return wanted === 'off' && !tpl.twoHanded ? 'off' : 'main'
    case 'shield':
      return 'off'
    case 'ring':
      return wanted === 'ring2' || (wanted !== 'ring1' && c.inventory.some((i) => i.equipped === 'ring1')) ? 'ring2' : 'ring1'
    case undefined:
      return undefined
    default:
      return tpl.fit
  }
}

const tplOf = (i: InventoryItem) => itemTemplate(i.template) ?? findTemplate(i.name)

/** Puts an item in its slot, taking off whatever was there. */
function equip(c: CharacterState, item: InventoryItem, wanted?: Slot) {
  const tpl = tplOf(item)
  if (!tpl) return
  const slot = slotFor(c, tpl, wanted)
  if (!slot) return
  const free = (sl: Slot) => c.inventory.forEach((i) => i.equipped === sl && i !== item && (i.equipped = undefined))
  free(slot)
  if (slot === 'main' && tpl.twoHanded) free('off')
  if (slot === 'off') {
    const main = c.inventory.find((i) => i.equipped === 'main')
    if (main && tplOf(main)?.twoHanded) main.equipped = undefined
  }
  item.equipped = slot
}

/** Adds to the pack. A weapon or armour goes straight into an empty slot. */
function addItem(c: CharacterState, name: string, qty: number, icon?: string) {
  const existing = c.inventory.find((i) => i.name.toLowerCase() === name.toLowerCase())
  if (existing) {
    existing.qty += qty
    return
  }
  const tpl = findTemplate(name)
  const item: InventoryItem = { name, qty, icon: icon ?? tpl?.icon, template: tpl?.id }
  c.inventory.push(item)
  if (tpl && (tpl.kind === 'weapon' || tpl.kind === 'armor' || tpl.kind === 'shield' || tpl.kind === 'clothing')) {
    const slot = slotFor(c, tpl)
    const taken = (sl: Slot) => c.inventory.some((i) => i !== item && i.equipped === sl)
    const blocked = slot === 'off' && c.inventory.some((i) => i.equipped === 'main' && tplOf(i)?.twoHanded)
    if (slot && !taken(slot) && !blocked && !(slot === 'main' && tpl.twoHanded && taken('off'))) item.equipped = slot
  }
}

// ---- Applying events ------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Returns a new state with one event applied. Pure: never mutates its input. */
export function applyEvent(prev: GameState, ev: GameEvent, settings: CampaignSettings): GameState {
  // Memory is built separately (projectMemory in shared/memory.ts), so the game state stays small.
  if (isMemoryEvent(ev)) return prev
  const s: GameState = structuredClone(prev)
  const c = s.character
  const d = () => derived(s, settings)

  const addCharXp = (amount: number) => {
    const before = c.level
    c.xp += amount
    const after = charLevelFromXp(c.xp)
    if (after > before) {
      const oldMax = d().maxHp
      c.level = after
      const gained = after - before
      c.attrPoints += gained
      c.renown = Math.min(RENOWN_MAX, c.renown + RENOWN_PER_LEVEL * gained)
      c.hp += d().maxHp - oldMax
      c.mana = Math.min(d().maxMana, c.mana + (d().maxMana - maxMana(c.attributes.ARC, before)))
    }
  }

  switch (ev.type) {
    case 'roll':
      break
    case 'skill_xp':
      c.skillXp[ev.skill] = (c.skillXp[ev.skill] ?? 0) + ev.amount
      addCharXp(Math.round(ev.amount * SKILL_TO_CHAR_XP))
      break
    case 'xp':
      addCharXp(ev.amount)
      break
    case 'damage':
      c.hp = Math.max(-d().maxHp, c.hp - ev.amount)
      break
    case 'heal':
      c.hp = Math.min(d().maxHp, c.hp + ev.amount)
      break
    case 'set_hp':
      c.hp = clamp(ev.hp, -d().maxHp, d().maxHp)
      break
    case 'stamina':
      c.stamina = clamp(c.stamina + ev.delta, 0, d().maxStamina)
      break
    case 'mana':
      c.mana = clamp(c.mana + ev.delta, 0, d().maxMana)
      break
    case 'condition':
      c.conditions = c.conditions.filter((x) => x !== ev.id)
      if (ev.on) c.conditions.push(ev.id)
      break
    case 'rest': {
      const dd = d()
      if (c.status === 'dead') break
      if (ev.kind === 'short') {
        c.stamina = dd.maxStamina
        c.hp = Math.min(dd.maxHp, Math.max(c.hp, 0) + Math.max(1, mod(c.attributes.END)))
      } else {
        c.stamina = dd.maxStamina
        c.mana = dd.maxMana
        // A starving body doesn't mend in its sleep.
        const starving = settings.survival && c.hungerMins >= 30 * 60
        if (!starving) c.hp = Math.min(dd.maxHp, Math.max(c.hp, 0) + Math.ceil(dd.maxHp / 2))
        c.conditions = c.conditions.filter((x) => x !== 'exhausted' && x !== 'well_fed')
        c.awakeMins = 0
      }
      if (c.status === 'downed' && c.hp > 0) {
        c.status = 'alive'
        c.deathRolls = { success: 0, fail: 0 }
      }
      if (c.hp * 4 >= dd.maxHp) c.conditions = c.conditions.filter((x) => x !== 'wounded')
      break
    }
    case 'time': {
      const total = s.time.minute + ev.minutes
      s.time.day += Math.floor(total / 1440)
      s.time.minute = ((total % 1440) + 1440) % 1440
      c.hungerMins += Math.max(0, ev.minutes)
      c.awakeMins += Math.max(0, ev.minutes)
      break
    }
    case 'renown':
      c.renown = clamp(c.renown + ev.amount, 0, RENOWN_MAX)
      if (ev.deed) c.deeds.push({ text: ev.deed, day: s.time.day })
      break
    case 'coins':
      c.coins = Math.max(0, c.coins + ev.delta)
      break
    case 'item': {
      const existing = c.inventory.find((i) => i.name.toLowerCase() === ev.name.toLowerCase())
      if (existing) {
        existing.qty += ev.delta
        if (existing.qty <= 0) c.inventory = c.inventory.filter((i) => i !== existing)
      } else if (ev.delta > 0) {
        addItem(c, ev.name, ev.delta, ev.icon)
      }
      break
    }
    case 'equip': {
      const item = c.inventory.find((i) => i.name.toLowerCase() === ev.name.toLowerCase())
      if (item) equip(c, item, ev.slot)
      break
    }
    case 'unequip': {
      const item = c.inventory.find((i) => i.name.toLowerCase() === ev.name.toLowerCase())
      if (item) item.equipped = undefined
      break
    }
    case 'use_item': {
      const item = c.inventory.find((i) => i.name.toLowerCase() === ev.name.toLowerCase())
      if (!item) break
      const tpl = tplOf(item)
      item.qty -= 1
      if (item.qty <= 0) c.inventory = c.inventory.filter((i) => i !== item)
      if (ev.heal && c.status !== 'dead') c.hp = Math.min(d().maxHp, c.hp + ev.heal)
      for (const cure of tpl?.cures ?? []) c.conditions = c.conditions.filter((x) => x !== cure)
      if (tpl?.food) {
        c.hungerMins = feed(c.hungerMins, tpl.food.hours)
        if (tpl.food.hours >= 8) c.conditions = c.conditions.filter((x) => x !== 'hungry')
        if (tpl.food.wellFed && !c.conditions.includes('well_fed')) c.conditions.push('well_fed')
      }
      break
    }
    case 'eat':
      c.hungerMins = feed(c.hungerMins, ev.hours)
      if (ev.hours >= 8) c.conditions = c.conditions.filter((x) => x !== 'hungry')
      if (ev.wellFed && !c.conditions.includes('well_fed')) c.conditions.push('well_fed')
      break
    case 'place_kind':
      s.placeKind = ev.kind
      break
    case 'combat_start':
      s.combat = structuredClone(ev.combat)
      break
    case 'combat_round':
      if (s.combat) {
        s.combat.round = ev.round
        s.combat.dodging = false
      }
      break
    case 'combat_dodge':
      if (s.combat) s.combat.dodging = true
      break
    case 'combat_end':
      s.combat = null
      break
    case 'foe_hit': {
      const f = s.combat?.foes.find((x) => x.id === ev.id)
      if (f) {
        f.hp = Math.max(0, f.hp - ev.amount)
        if (f.hp <= 0) f.status = 'down'
      }
      break
    }
    case 'foe_status': {
      const f = s.combat?.foes.find((x) => x.id === ev.id)
      if (f) f.status = ev.status
      break
    }
    case 'foe_attack':
    case 'world_event':
      break
    case 'status':
      c.status = ev.status
      if (ev.status !== 'downed') c.deathRolls = { success: 0, fail: 0 }
      break
    case 'death_roll':
      if (ev.success) c.deathRolls.success++
      else c.deathRolls.fail += ev.double ? 2 : 1
      break
    case 'attr_spend': {
      if (c.attrPoints <= 0) break
      const caps = d().attrCaps
      if (c.attributes[ev.attr] >= caps[ev.attr]) break
      const oldMax = d()
      c.attributes[ev.attr]++
      c.attrPoints--
      const now = d()
      c.hp += now.maxHp - oldMax.maxHp
      c.stamina += now.maxStamina - oldMax.maxStamina
      c.mana += now.maxMana - oldMax.maxMana
      break
    }
    case 'location':
      s.location = ev.name
      break
    case 'trait_used':
      c.traitUsedDay = s.time.day
      break
  }
  return s
}

export function project(initial: GameState, events: GameEvent[], settings: CampaignSettings): GameState {
  return events.reduce((st, ev) => applyEvent(st, ev, settings), initial)
}

export { ATTRS }
