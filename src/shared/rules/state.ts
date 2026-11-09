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

export type CampaignSettings = {
  sexModifiers: SexMode
  mercy: Mercy
  rollMode: RollMode
  failForward: boolean
  ironman: boolean
  tone: 'grim' | 'grounded' | 'heroic' | 'whimsical' | 'horror'
  length: 'short' | 'medium' | 'long'
}

export const DEFAULT_SETTINGS: CampaignSettings = {
  sexModifiers: 'realistic',
  mercy: 'harsh',
  rollMode: 'dramatic',
  failForward: false,
  ironman: false,
  tone: 'grounded',
  length: 'medium'
}

export type InventoryItem = { name: string; qty: number; icon?: string }
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
}

export type GameState = {
  character: CharacterState
  /** In-game clock: day number and minutes since midnight. */
  time: { day: number; minute: number }
  location: string | null
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
  | { type: 'item'; name: string; delta: number; icon?: string }
  | { type: 'status'; status: Status; reason: string }
  | { type: 'death_roll'; roll: number; success: boolean; double: boolean }
  | { type: 'attr_spend'; attr: Attr }
  | { type: 'location'; name: string }
  | { type: 'trait_used' }
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
    inventory: bg.kit.map((k) => ({ name: k.name, qty: 'qty' in k && k.qty ? k.qty : 1, icon: k.icon })),
    status: 'alive',
    deathRolls: { success: 0, fail: 0 },
    traitUsedDay: null
  }
  return { character, time: { day: 1, minute: 8 * 60 }, location: null }
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
        c.hp = Math.min(dd.maxHp, Math.max(c.hp, 0) + Math.ceil(dd.maxHp / 2))
        c.conditions = c.conditions.filter((x) => x !== 'exhausted' && x !== 'well_fed')
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
        c.inventory.push({ name: ev.name, qty: ev.delta, icon: ev.icon })
      }
      break
    }
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
