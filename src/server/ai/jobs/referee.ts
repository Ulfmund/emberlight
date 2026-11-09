import { z } from 'zod'
import {
  combatSummary,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  ENEMY_TIERS,
  HARM_SOURCES,
  mainWeapon,
  SEVERITIES,
  SKILL_IDS,
  SKILLS,
  skillLevelFromXp,
  templateOf,
  type CheckRequest,
  type CombatAction,
  type FoeSpec,
  type GameState,
  type RefereeCall,
  type SkillId
} from '@shared/rules'
import type { ChatMessage } from '@shared/types'
import type { Provider } from '../providers'

/**
 * The Referee (docs/spec/06-ai-dm.md#2-referee-does-this-need-a-roll): it decides whether the
 * dice are needed, and whether a fight starts. In a fight, it turns the player's words into one
 * combat action for the engine to resolve.
 */

const skillEnum = z.enum(SKILL_IDS as [SkillId, ...SkillId[]])

const CheckSchema = z.object({
  skill: skillEnum.describe('Which skill is tested'),
  difficulty: z.enum(DIFFICULTIES),
  modifier: z.number().int().describe('Situation modifier from -4 to 4 (tools, terrain, help, haste)'),
  advantage: z.enum(['none', 'advantage', 'disadvantage']),
  reason: z.string().describe('A few words: what is being attempted'),
  dramatic: z.boolean().describe('True if a lot hangs on this roll'),
  withStrangers: z.boolean().describe('Social checks only: true if talking to strangers, officials or authority'),
  risk: z.enum(SEVERITIES).describe('How badly the character can be hurt if this fails'),
  riskSource: z.enum(HARM_SOURCES).describe('Who or what would hurt them: sentient = people/intelligent foes')
})

const FoeSchema = z.object({
  kind: z.string().describe('What they are, as the story says: "bandit", "cave bear", "wolves", "guard"'),
  count: z.number().int().describe('How many of them'),
  tier: z.enum(ENEMY_TIERS).describe('minion: weak, untrained or small; standard: an ordinary armed foe or dangerous animal; elite: a veteran, a leader, a big beast; boss: a legendary foe or warlord'),
  name: z.string().describe('Their name if they have one, otherwise empty')
})

export const RefereeSchema = z.object({
  intent: z.enum(['combat', 'social', 'explore', 'travel', 'rest', 'gather', 'craft', 'other']).default('other').describe('What kind of thing the character is doing'),
  checks: z.array(CheckSchema).describe('Zero, one or two checks. Empty when nothing is uncertain.'),
  fight: z
    .object({
      starts: z.boolean().describe('True if this action starts a fight: the character attacks someone, or provokes an attack that happens right now'),
      foes: z.array(FoeSchema).describe('Everyone who will fight the character, from the story. Empty if no fight'),
      playerAttacks: z.boolean().describe("True if the character's own action is an attack on one of them"),
      sneakAttack: z.boolean().describe('True if the character attacks unseen, from hiding')
    })
    .default({ starts: false, foes: [], playerAttacks: false, sneakAttack: false })
})
export type RefereeOutput = z.infer<typeof RefereeSchema>

export type RefereeResult = RefereeCall

const SYSTEM = `You are the Referee for a fantasy roleplaying game. You do not write story. You read what the player's character tries to do and decide whether the dice are needed.

Call for a check only when the outcome is genuinely uncertain AND failure would be interesting or costly. Talking normally, walking, looking around casually, eating, simple everyday tasks: no check (empty list). Never call for more than two checks.

Skills (pick the best fit):
${SKILL_IDS.map((s) => `- ${s}: ${SKILLS[s].blurb}`).join('\n')}

Difficulty: ${DIFFICULTIES.map((d) => `${d} (${DIFFICULTY_LABEL[d]})`).join(', ')}. Most things are moderate. Hard needs a skilled person; very_hard and above are for experts and heroes.

Risk: "none" when failure just means it doesn't work. "light" for scrapes, bruises, a small fall. "serious" for a real fight, a bad fall, a dangerous animal. "deadly" for lethal danger: a dragon, a long fall, an armed killer. Attacks against armed enemies are at least "serious". Be honest about danger; do not protect the player.

Fights: if the character attacks someone, or their action makes someone attack them right now, set fight.starts and list everyone who will fight them, as the story has them: what they are, how many, and how tough (tier). Only foes who are actually there. playerAttacks: whether the character's own action is the attack. sneakAttack: whether they strike unseen, from hiding. Also put the attack in checks as usual (melee, ranged or spellcasting, with its risk): it's used when the fight is told in prose instead of on the tracker.

Speech in "quotes" is what the character says; social checks only when they are trying to change someone's mind (persuade, lie, threaten, haggle). Social checks normally have risk "none": a failed persuasion means they aren't convinced. Only give a social check risk if failing means violence breaks out at that very moment, and then the harm comes from the people present (riskSource "sentient"), and then a fight starts too.`

/** The campaign's "roll frequency" DM setting. */
const ROLL_FREQUENCY = {
  fewer: '\n\nThis campaign wants FEWER rolls: call for a check only when failure would change the story in an interesting way.',
  normal: '',
  more: '\n\nThis campaign wants MORE rolls: whenever the outcome is at all uncertain, call for a check.'
}

const toRequest = (ch: z.infer<typeof CheckSchema>): CheckRequest => ({
  skill: ch.skill,
  difficulty: ch.difficulty,
  modifier: Math.max(-4, Math.min(4, Math.round(ch.modifier))),
  advantage: ch.advantage,
  reason: ch.reason.slice(0, 120),
  dramatic: ch.dramatic,
  withStrangers: ch.withStrangers,
  risk: { severity: ch.risk, source: ch.riskSource }
})

function sheet(state: GameState) {
  const c = state.character
  const skills = SKILL_IDS.map((s) => [s, skillLevelFromXp(c.skillXp[s] ?? 0)] as const)
    .filter(([, l]) => l > 1)
    .map(([s, l]) => `${s} ${l}`)
    .join(', ')
  return `Character: ${c.build.name}, level ${c.level}. Trained skills: ${skills || 'none'}. Health ${c.hp}.`
}

const storyOf = (recent: ChatMessage[]) =>
  recent
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'PLAYER' : 'DM'}: ${m.content.slice(0, 800)}`)
    .join('\n\n')

export async function runReferee(
  provider: Provider,
  model: string,
  state: GameState,
  recent: ChatMessage[],
  action: string,
  rolls: 'fewer' | 'normal' | 'more' = 'normal'
): Promise<RefereeResult> {
  const prompt = `Recent story:\n${storyOf(recent) || '(the adventure is just starting)'}\n\n${sheet(state)}\n\nThe player now writes:\n"""${action}"""\n\nWhich checks (if any) does this need, and does a fight start?`
  const out = await provider.complete(model, {
    system: SYSTEM + ROLL_FREQUENCY[rolls],
    messages: [{ role: 'user', content: prompt }],
    schema: RefereeSchema,
    name: 'referee'
  })
  const fight = out.fight
  const foes: FoeSpec[] = fight.foes
    .filter((f) => f.kind.trim())
    .slice(0, 6)
    .map((f) => ({ kind: f.kind.trim().slice(0, 60), count: Math.max(1, Math.min(6, Math.round(f.count || 1))), tier: f.tier, name: f.name.trim().slice(0, 60) || undefined }))
  return {
    checks: out.checks.slice(0, 2).map(toRequest),
    intent: out.intent,
    fight: { starts: fight.starts && foes.length > 0, foes, playerAttacks: fight.playerAttacks, sneakAttack: fight.sneakAttack }
  }
}

// ---- In a fight ---------------------------------------------------------------------------------

export const CombatRefereeSchema = z.object({
  action: z.enum(['attack', 'power_attack', 'cast', 'defend', 'flee', 'use_item', 'talk', 'surrender', 'other']),
  target: z.string().describe('For attacks: the id of the foe attacked (e.g. "f2"); otherwise empty'),
  item: z.string().describe('For use_item: the name of the item from the pack; otherwise empty'),
  checks: z.array(CheckSchema).describe('For talk or other only: at most one check (risk none: the foes are the danger). Empty otherwise')
})

const COMBAT_SYSTEM = `You are the Referee in the middle of a fight in a fantasy roleplaying game. You do not write story. A combat engine rolls every attack; you only decide what the character is doing this round, as ONE action:
- attack: attacking a foe with their weapon (target: the foe's id). If they attack several, pick the main one.
- power_attack: an all-out, heavy blow (costs stamina, hits harder).
- cast: attacking with a spell or magic (if they have any).
- defend: guarding, parrying, dodging, taking cover, backing off.
- flee: running away, breaking off, escaping.
- use_item: drinking a potion, bandaging a wound, eating (item: its name from the pack).
- talk: trying to end the fight with words: threats, a demand to surrender, bargaining, lying. Give one check: intimidation, persuasion or deception.
- surrender: the character gives up and yields.
- other: anything else (shoving, grabbing, climbing, picking a lock, helping someone). Give at most one check if it's uncertain.
Speech in "quotes" alone, while still fighting, is talk only if it's meant to end the fight.`

export async function runCombatReferee(provider: Provider, model: string, state: GameState, recent: ChatMessage[], action: string): Promise<CombatAction> {
  const c = state.character
  const weapon = mainWeapon(c)
  const usable = c.inventory.filter((i) => {
    const t = templateOf(i)
    return t && (t.food || t.heal || t.cures?.length)
  })
  const prompt = `Recent story:\n${storyOf(recent)}\n\n${sheet(state)} Wielding ${weapon.unarmed ? 'nothing' : weapon.name}. Mana ${c.mana}. Usable items: ${usable.map((i) => i.name).join(', ') || 'none'}.\nFOES: ${combatSummary(state)}\n\nThe player now writes:\n"""${action}"""\n\nWhat is the character doing this round?`
  const out = await provider.complete(model, {
    system: COMBAT_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    schema: CombatRefereeSchema,
    name: 'combat_referee'
  })
  const checks = out.checks.slice(0, 1).map(toRequest)
  switch (out.action) {
    case 'attack':
      return { kind: 'attack', target: out.target.trim() }
    case 'power_attack':
      return { kind: 'power', target: out.target.trim() }
    case 'cast':
      return { kind: 'cast', target: out.target.trim() }
    case 'defend':
      return { kind: 'defend' }
    case 'flee':
      return { kind: 'flee' }
    case 'use_item':
      return { kind: 'use_item', item: out.item.trim() }
    case 'talk':
      return { kind: 'talk', checks }
    case 'surrender':
      return { kind: 'surrender' }
    default:
      return { kind: 'other', checks }
  }
}
