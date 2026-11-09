import type { CastMember } from '../cards'

/**
 * Companions who travel with the player (docs/spec/04-rules-system.md#companions): people met
 * in the story, or characters from cards. The DM plays them in the story; in a fight the engine
 * plays them by their role and rolls their every blow, as it does a foe's.
 */

export const COMPANION_ROLES = ['fighter', 'archer', 'healer', 'mage', 'scout'] as const
export type CompanionRole = (typeof COMPANION_ROLES)[number]

export const ROLE_INFO: Record<CompanionRole, { label: string; what: string }> = {
  fighter: { label: 'Fighter', what: "Wades in with a blade, and draws the foes' blows." },
  archer: { label: 'Archer', what: 'Shoots from a distance; seldom hit.' },
  healer: { label: 'Healer', what: 'Tends whoever is worst hurt, and can bring you round when you fall.' },
  mage: { label: 'Mage', what: 'Hits hard with magic, but is easily hurt.' },
  scout: { label: 'Scout', what: 'Quick, and hard to pin down.' }
}

/** At most this many travel with the player at once. */
export const PARTY_MAX = 4

export type Companion = {
  id: string
  name: string
  role: CompanionRole
  /** The card in the campaign's cast they came from, if any. */
  card?: string
  /** Damage taken. Health is their maximum less this, so they keep pace as the player levels. */
  wounds: number
  /** Knocked out in a fight; back on their feet when it's over. */
  down: boolean
  joinedDay: number
}

type RoleStats = { hp: number; attack: number; defense: number; damage: [number, number, number]; heal?: [number, number, number]; ranged?: boolean; verb: string; draw: number }

/** Level-1 numbers: a little better than a standard foe, a little short of the player. */
const ROLE_STATS: Record<CompanionRole, RoleStats> = {
  fighter: { hp: 16, attack: 4, defense: 14, damage: [1, 8, 1], verb: 'cuts at', draw: 1.2 },
  archer: { hp: 12, attack: 4, defense: 13, damage: [1, 8, 0], ranged: true, verb: 'shoots at', draw: 0.5 },
  healer: { hp: 12, attack: 2, defense: 12, damage: [1, 6, 0], heal: [1, 8, 2], verb: 'strikes at', draw: 0.7 },
  mage: { hp: 10, attack: 4, defense: 11, damage: [1, 10, 1], ranged: true, verb: 'hurls a spell at', draw: 0.5 },
  scout: { hp: 12, attack: 4, defense: 14, damage: [1, 6, 2], verb: 'darts in at', draw: 0.8 }
}

export type CompanionStats = {
  maxHp: number
  attack: number
  defense: number
  damage: [number, number, number]
  heal?: [number, number, number]
  ranged: boolean
  verb: string
  /** How likely foes are to go for them (the player counts 2). */
  draw: number
}

/** A companion's numbers at the player's level (they grow as the player does, as foes do). */
export function companionStats(role: CompanionRole, level: number): CompanionStats {
  const s = ROLE_STATS[role] ?? ROLE_STATS.fighter
  const up = Math.max(0, level - 1)
  return {
    maxHp: Math.round(s.hp * (1 + 0.2 * up)),
    attack: s.attack + Math.floor(up / 2),
    defense: s.defense + Math.floor(up / 3),
    damage: [s.damage[0], s.damage[1], s.damage[2] + Math.floor(up / 3)],
    heal: s.heal ? [s.heal[0], s.heal[1], s.heal[2] + Math.floor(up / 2)] : undefined,
    ranged: Boolean(s.ranged),
    verb: s.verb,
    draw: s.draw
  }
}

export const companionHp = (a: Companion, level: number) => Math.max(0, companionStats(a.role, level).maxHp - a.wounds)

/** How a companion looks, in words (exact numbers are for the Sheet). */
export function allyHealth(a: Companion, level: number): string {
  if (a.down) return 'down'
  const max = companionStats(a.role, level).maxHp
  const r = (max - a.wounds) / max
  return r >= 1 ? 'unhurt' : r > 0.7 ? 'scratched' : r > 0.4 ? 'hurt' : 'badly hurt'
}

const ROLE_WORDS: [CompanionRole, RegExp][] = [
  ['healer', /\b(healers?|healing|priests?|priestess(es)?|clerics?|monks?|nuns?|herbalists?|physicians?|medics?|doctors?|druids?|midwi(fe|ves)|surgeons?|apothecar(y|ies)|acolytes?|wise wom[ae]n)\b/],
  ['mage', /\b(mages?|wizards?|witch(es)?|sorcer(er|ess|ers|esses)|warlocks?|magicians?|enchant(er|ers|ress)|conjurers?|necromancers?|spellcasters?|arcanists?|magus|magi)\b/],
  ['archer', /\b(archers?|hunters?|huntress(es)?|rangers?|bowm[ae]n|bowyers?|marksm[ae]n|poachers?|trappers?|crossbowm[ae]n)\b/],
  ['scout', /\b(thie(f|ves)|rogues?|scouts?|spy|spies|assassins?|cutpurses?|urchins?|smugglers?|pickpockets?|burglars?|trackers?)\b/]
]

/**
 * A first guess at what someone does in a fight, from who they are ("a priestess of the
 * dawn", "Old Tam, the ferryman"): the first such word in the opening lines wins. The player
 * can change it.
 */
export function guessRole(text: string): CompanionRole {
  const t = text.toLowerCase().slice(0, 600)
  let best: { role: CompanionRole; at: number } | null = null
  for (const [role, re] of ROLE_WORDS) {
    const m = re.exec(t)
    if (m && (!best || m.index < best.at)) best = { role, at: m.index }
  }
  return best?.role ?? 'fighter'
}

/** A steady id for someone from the story ("Old Tam" → ally_old_tam). */
export const allyId = (name: string) =>
  `ally_${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'friend'
  }`

/** The cast's companions travel with the player from the first page (their id is the card's). */
export function partyFromCast(cast: Pick<CastMember, 'cardId' | 'role' | 'name' | 'description' | 'personality'>[]): Companion[] {
  return cast
    .filter((m) => m.role === 'companion')
    .slice(0, PARTY_MAX)
    .map((m) => ({ id: m.cardId, name: m.name, role: guessRole(`${m.description}\n${m.personality}`), card: m.cardId, wounds: 0, down: false, joinedDay: 1 }))
}

/** Companions able to act (not knocked out). */
export const standing = (party: Companion[] | undefined) => (party ?? []).filter((a) => !a.down)

/** A healer on their feet, who can bring a fallen character round. */
export const carer = (party: Companion[] | undefined) => standing(party).find((a) => a.role === 'healer')
