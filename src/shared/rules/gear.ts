import { mod, skillLevelFromXp } from './character'
import { COINS_PER_KG, findTemplate, itemTemplate, UNKNOWN_WEIGHT, type Ammo, type ItemTemplate, type Slot } from './items'
import type { SkillId } from './tables'
import type { CharacterState, GameState, InventoryItem } from './state'

/**
 * What a character's gear and body add up to (docs/spec/04-rules-system.md#items-equipment-money
 * and #resources): defense, the weapon in hand, the weight carried, and hunger and tiredness.
 */

export const templateOf = (i: InventoryItem): ItemTemplate | undefined => itemTemplate(i.template) ?? findTemplate(i.name)

export function equippedIn(c: CharacterState, slot: Slot): { item: InventoryItem; template: ItemTemplate | undefined } | undefined {
  const item = c.inventory.find((i) => i.equipped === slot)
  return item ? { item, template: templateOf(item) } : undefined
}

export type Weapon = { name: string; dice: [number, number]; skill: 'melee' | 'ranged'; attr: 'STR' | 'AGI'; ammo?: Ammo; unarmed?: boolean }

/** The weapon in the main hand, or bare fists. */
export function mainWeapon(c: CharacterState): Weapon {
  const held = equippedIn(c, 'main')
  const w = held?.template?.weapon
  if (!held || !w) return { name: 'bare fists', dice: [1, 3], skill: 'melee', attr: 'STR', unarmed: true }
  const attr = w.skill === 'ranged' ? 'AGI' : w.finesse && c.attributes.AGI > c.attributes.STR ? 'AGI' : 'STR'
  return { name: held.item.name, dice: w.dice, skill: w.skill, attr, ammo: w.ammo }
}

/** Ammunition carried for a weapon (arrows for a bow…). */
export function ammoFor(c: CharacterState, kind: Ammo): InventoryItem | undefined {
  return c.inventory.find((i) => i.qty > 0 && templateOf(i)?.ammoKind === kind)
}

/** Armour from everything worn, and the cap it puts on how much agility helps. */
export function armor(c: CharacterState): { bonus: number; maxAgi: number | null; heavy: boolean } {
  let bonus = 0
  let maxAgi: number | null = null
  let heavy = false
  for (const i of c.inventory) {
    if (!i.equipped) continue
    const a = templateOf(i)?.armor
    if (!a) continue
    bonus += a.bonus
    if (a.maxAgi !== undefined) maxAgi = maxAgi === null ? a.maxAgi : Math.min(maxAgi, a.maxAgi)
    if (a.heavy) heavy = true
  }
  return { bonus, maxAgi, heavy }
}

/** How hard the character is to hit: 10 + Defense skill + armour + agility (capped by armour). */
export function defenseValue(c: CharacterState, extra = 0): { total: number; parts: { label: string; value: number }[] } {
  const a = armor(c)
  const agi = a.maxAgi === null ? mod(c.attributes.AGI) : Math.min(mod(c.attributes.AGI), a.maxAgi)
  const skill = Math.floor(skillLevelFromXp(c.skillXp.defense ?? 0) / 5)
  const parts = [
    { label: 'Base', value: 10 },
    { label: 'Defense skill', value: skill },
    { label: 'Armour', value: a.bonus },
    { label: a.maxAgi !== null && mod(c.attributes.AGI) > a.maxAgi ? 'Agility (limited by armour)' : 'Agility', value: agi }
  ]
  if (extra) parts.push({ label: 'Dodging', value: extra })
  return { total: parts.reduce((n, p) => n + p.value, 0), parts: parts.filter((p) => p.value !== 0 || p.label === 'Base') }
}

export function itemWeight(i: InventoryItem): number {
  return (templateOf(i)?.weight ?? UNKNOWN_WEIGHT) * i.qty
}

export function carriedKg(c: CharacterState): number {
  return Math.round((c.inventory.reduce((n, i) => n + itemWeight(i), 0) + c.coins / COINS_PER_KG) * 10) / 10
}

export const capacityKg = (c: CharacterState) => c.attributes.STR * 5

/** Over the limit: encumbered (disadvantage on agility checks). Over half again: overloaded. */
export function encumbrance(c: CharacterState): 'none' | 'encumbered' | 'overloaded' {
  const load = carriedKg(c)
  const cap = capacityKg(c)
  return load > cap * 1.5 ? 'overloaded' : load > cap ? 'encumbered' : 'none'
}

/** Whether the character carries a tool for a skill (no tool: disadvantage). */
export function hasTool(c: CharacterState, skill: SkillId): boolean {
  return c.inventory.some((i) => i.qty > 0 && (templateOf(i)?.tool ?? []).includes(skill))
}

/** Skills that need a tool to be practised properly. */
export const TOOL_SKILLS: SkillId[] = ['mining', 'woodcutting', 'fishing', 'hunting', 'smithing', 'alchemy', 'fletching']

// ---- Hunger and tiredness (docs/spec/04-rules-system.md#resources) ---------------------------

export type Hunger = 'fed' | 'peckish' | 'hungry' | 'starving'
export const HUNGER_LABEL: Record<Hunger, string> = { fed: 'Fed', peckish: 'Peckish', hungry: 'Hungry', starving: 'Starving' }

export function needs(state: GameState, survival: boolean): { hunger: Hunger; exhaustion: number; hoursSinceMeal: number; hoursAwake: number } {
  const c = state.character
  const hoursSinceMeal = Math.floor(c.hungerMins / 60)
  const hoursAwake = Math.floor(c.awakeMins / 60)
  // An old "hungry" condition from the story still counts.
  const told = c.conditions.includes('hungry')
  let hunger: Hunger = 'fed'
  if (survival) hunger = hoursSinceMeal >= 30 ? 'starving' : hoursSinceMeal >= 16 ? 'hungry' : hoursSinceMeal >= 8 ? 'peckish' : 'fed'
  if (told && (hunger === 'fed' || hunger === 'peckish')) hunger = 'hungry'
  // A day without sleep wears you down: one level at 18 hours awake, and another every 8.
  const fromWaking = survival && hoursAwake >= 18 ? 1 + Math.floor((hoursAwake - 18) / 8) : 0
  const exhaustion = Math.min(5, fromWaking + (c.conditions.includes('exhausted') ? 1 : 0))
  return { hunger, exhaustion, hoursSinceMeal, hoursAwake }
}
