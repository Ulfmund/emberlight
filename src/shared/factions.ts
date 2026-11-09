import { SKILLS, type CheckRequest } from './rules'
import { findEntity, fmtStanding, mentions, standingLabel, type Entity, type Memory } from './memory'

/**
 * Factions (docs/spec/04-rules-system.md#factions): the groups the character deals with, and
 * what each thinks of them. A group's standing (−3 to +3) goes on social checks with its people,
 * and the DM lets it show in how they treat the character.
 */

export const factionsOf = (m: Memory) => m.entities.filter((e) => e.kind === 'faction')

/**
 * Whether `text` names a group: its whole name, without "the". A one-word name must keep its
 * capital ("the Watch" yes, "I keep watch" no).
 */
function saysName(text: string, name: string): boolean {
  const bare = name.trim().replace(/^the\s+/i, '')
  if (bare.length < 3) return false
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, bare.includes(' ') ? 'iu' : 'u')
  return pattern.test(text)
}

/** The group a social check is with: the one the Referee named, or the one its target is in. */
export function factionFor(m: Memory, req: Pick<CheckRequest, 'skill' | 'faction' | 'against' | 'reason'>): Entity | undefined {
  if (SKILLS[req.skill]?.group !== 'social') return undefined
  const named = req.faction?.trim() ? findEntity(m, 'faction', req.faction) : undefined
  if (named) return named
  const text = `${req.against ?? ''} ${req.reason}`
  const direct = factionsOf(m).find((e) => [e.name, ...e.aliases].some((n) => saysName(text, n)))
  if (direct) return direct
  const person = m.entities.find((e) => e.kind === 'person' && e.faction && mentions(text, e))
  return person?.faction ? findEntity(m, 'faction', person.faction) : undefined
}

/** Social checks with a group's people carry what the group thinks of the character. */
export function withReputation<T extends CheckRequest>(m: Memory, checks: T[]): T[] {
  return checks.map((req) => {
    const { reputation: _old, ...rest } = req
    const f = factionFor(m, rest)
    const value = f?.standing ?? 0
    return (value ? { ...rest, reputation: { faction: f!.name, value } } : rest) as T
  })
}

/** For the Referee: the groups known, what they think of the character, and who belongs to them. */
export function factionBrief(m: Memory, max = 8): string {
  const groups = factionsOf(m)
    .sort((a, b) => Math.abs(b.standing ?? 0) - Math.abs(a.standing ?? 0) || b.lastSeen - a.lastSeen)
    .slice(0, max)
  if (!groups.length) return ''
  const members = m.entities.filter((e) => e.kind === 'person' && e.faction && e.status !== 'dead').slice(0, 12)
  const people = members.length ? ` People in them: ${members.map((e) => `${e.name} (${e.faction})`).join(', ')}.` : ''
  return `${groups.map((g) => `${g.name}: ${standingLabel(g.standing).toLowerCase()} (${fmtStanding(g.standing ?? 0)})`).join('; ')}.${people}`
}

/** For the DM: the groups that think well or ill of the character (neutral ones go unsaid). */
export function factionStanding(m: Memory, max = 6): string {
  return factionsOf(m)
    .filter((g) => (g.standing ?? 0) !== 0)
    .sort((a, b) => Math.abs(b.standing ?? 0) - Math.abs(a.standing ?? 0) || b.lastSeen - a.lastSeen)
    .slice(0, max)
    .map((g) => `- ${g.name}: ${standingLabel(g.standing).toLowerCase()} (${fmtStanding(g.standing ?? 0)}).${g.facts.length ? ` Why: ${g.facts.slice(-2).join('; ')}.` : ''}`)
    .join('\n')
}
