import { z } from 'zod'
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  HARM_SOURCES,
  SEVERITIES,
  SKILL_IDS,
  SKILLS,
  skillLevelFromXp,
  type CheckRequest,
  type GameState,
  type SkillId
} from '@shared/rules'
import type { ChatMessage } from '@shared/types'
import type { Provider } from '../providers'

const skillEnum = z.enum(SKILL_IDS as [SkillId, ...SkillId[]])

export const RefereeSchema = z.object({
  checks: z
    .array(
      z.object({
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
    )
    .describe('Zero, one or two checks. Empty when nothing is uncertain.')
})
export type RefereeOutput = z.infer<typeof RefereeSchema>

const SYSTEM = `You are the Referee for a fantasy roleplaying game. You do not write story. You read what the player's character tries to do and decide whether the dice are needed.

Call for a check only when the outcome is genuinely uncertain AND failure would be interesting or costly. Talking normally, walking, looking around casually, eating, simple everyday tasks: no check (empty list). Never call for more than two checks.

Skills (pick the best fit):
${SKILL_IDS.map((s) => `- ${s}: ${SKILLS[s].blurb}`).join('\n')}

Difficulty: ${DIFFICULTIES.map((d) => `${d} (${DIFFICULTY_LABEL[d]})`).join(', ')}. Most things are moderate. Hard needs a skilled person; very_hard and above are for experts and heroes.

Risk: "none" when failure just means it doesn't work. "light" for scrapes, bruises, a small fall. "serious" for a real fight, a bad fall, a dangerous animal. "deadly" for lethal danger: a dragon, a long fall, an armed killer. Attacks against armed enemies are at least "serious". Be honest about danger; do not protect the player.

Combat: an attack, parry or dodge is a check. Use melee, ranged or spellcasting for attacking, defense for blocking or enduring blows.

Speech in "quotes" is what the character says; social checks only when they are trying to change someone's mind (persuade, lie, threaten, haggle). Social checks normally have risk "none": a failed persuasion means they aren't convinced. Only give a social check risk if failing means violence breaks out at that very moment, and then the harm comes from the people present (riskSource "sentient").`

export async function runReferee(
  provider: Provider,
  model: string,
  state: GameState,
  recent: ChatMessage[],
  action: string
): Promise<CheckRequest[]> {
  const c = state.character
  const skills = SKILL_IDS.map((s) => [s, skillLevelFromXp(c.skillXp[s] ?? 0)] as const)
    .filter(([, l]) => l > 1)
    .map(([s, l]) => `${s} ${l}`)
    .join(', ')
  const context = recent
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'PLAYER' : 'DM'}: ${m.content.slice(0, 800)}`)
    .join('\n\n')
  const prompt = `Recent story:\n${context || '(the adventure is just starting)'}\n\nCharacter: ${c.build.name}, level ${c.level}. Trained skills: ${skills || 'none'}. Health ${c.hp}.\n\nThe player now writes:\n"""${action}"""\n\nWhich checks (if any) does this need?`

  const out = await provider.complete(model, {
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    schema: RefereeSchema,
    name: 'referee'
  })
  return out.checks.slice(0, 2).map((ch) => ({
    skill: ch.skill,
    difficulty: ch.difficulty,
    modifier: Math.max(-4, Math.min(4, Math.round(ch.modifier))),
    advantage: ch.advantage,
    reason: ch.reason.slice(0, 120),
    dramatic: ch.dramatic,
    withStrangers: ch.withStrangers,
    risk: { severity: ch.risk, source: ch.riskSource }
  }))
}
