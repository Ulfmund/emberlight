import { z } from 'zod'
import { ATTR_INFO, ATTRS, BACKGROUNDS, RACE_BACKGROUNDS, RACES, SKILL_IDS, SKILLS, type BackgroundId, type HeroWishes, type RaceId, type SexId } from '@shared/rules'
import type { Provider } from '../providers'

/**
 * The Quick Hero's stats (docs/spec/03-characters-and-cards.md#quick-hero): from how the player
 * describes their hero, the calling and the strengths that fit. The rules then make it a legal
 * build (hero.ts), and the player can change anything after.
 */

const score = z.number().int()
export const HeroSchema = z.object({
  calling: z.enum(Object.keys(BACKGROUNDS) as [BackgroundId, ...BackgroundId[]]).describe("The calling from the list that's closest to what they do"),
  STR: score.describe(ATTR_INFO.STR.label),
  AGI: score.describe(ATTR_INFO.AGI.label),
  END: score.describe(ATTR_INFO.END.label),
  INT: score.describe(ATTR_INFO.INT.label),
  ARC: score.describe(ATTR_INFO.ARC.label),
  WIT: score.describe(ATTR_INFO.WIT.label),
  PRE: score.describe(ATTR_INFO.PRE.label),
  skills: z.array(z.enum(SKILL_IDS as [string, ...string[]])).describe('Up to 6 skills they would have practised most, most practised first')
})

const SYSTEM = `You set up a character's game stats in a fantasy roleplaying game from how the player describes them. Read who they are (their people, age, job, looks, manner and anything else said) and judge what they'd be good at.
- calling: pick the one from CALLINGS closest to what they do.
- Attributes, 8 to 18: 10 is ordinary. Give their real strengths 14 to 17, what they're poor at 8 or 9, the rest 10 to 12. A scholar is high in Intellect and low in Strength; a dockhand the other way round. Age matters: the old are wiser, the young quicker.
- skills: what they'd have practised, from SKILLS.`

export type HeroAsk = { race: RaceId; sex: SexId; years: number; job: string; appearance: string; personality: string; details: string }

export async function suggestHero(provider: Provider, model: string, ask: HeroAsk, signal?: AbortSignal): Promise<HeroWishes> {
  const callings = RACE_BACKGROUNDS[ask.race].map((id) => `${id} (${BACKGROUNDS[id].label}: ${BACKGROUNDS[id].blurb})`).join('; ')
  const cut = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n)
  const prompt = `THE HERO: a ${RACES[ask.race].label.toLowerCase()} ${ask.sex === 'female' ? 'woman' : 'man'} of ${ask.years}.
Job: ${cut(ask.job, 80) || 'not said'}.
Looks: ${cut(ask.appearance, 600) || 'not said'}.
Manner: ${cut(ask.personality, 600) || 'not said'}.
Also: ${cut(ask.details, 1200) || 'nothing'}.

CALLINGS (for ${RACES[ask.race].plural.toLowerCase()}): ${callings}
ATTRIBUTES: ${ATTRS.map((a) => `${a} (${ATTR_INFO[a].label}: ${ATTR_INFO[a].blurb})`).join('; ')}
SKILLS: ${SKILL_IDS.map((s) => `${s} (${SKILLS[s].blurb})`).join('; ')}

What stats fit this hero?`
  const out = await provider.complete(model, { system: SYSTEM, messages: [{ role: 'user', content: prompt }], schema: HeroSchema, name: 'hero', signal })
  return { calling: out.calling, attributes: Object.fromEntries(ATTRS.map((a) => [a, out[a]])), skills: out.skills.slice(0, 6) }
}
