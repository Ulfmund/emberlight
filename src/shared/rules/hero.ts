import { attrCaps, pointsLeft, skillCaps, startingSkillBudget, startingSkillLevel, type CharacterBuild } from './character'
import { ATTR_START, ATTRS, BACKGROUNDS, RACE_BACKGROUNDS, SKILLS, SKILL_IDS, START_SKILL_MAX, attrStepCost, type Attr, type BackgroundId, type SexMode, type SkillId, type SkillMods } from './tables'

/**
 * The Quick Hero (docs/spec/03-characters-and-cards.md#quick-hero): the player describes their
 * hero in their own words, the AI says what stats fit (its "wishes"), and this turns the wishes
 * into a build the rules allow: the calling among their people's, the point-buy, the limits.
 */
export type HeroWishes = {
  calling: string
  /** How strong each attribute should be, 8 (weak) to 18 (exceptional). */
  attributes: Partial<Record<Attr, number>>
  /** Skills they'd have practised, most practised first. */
  skills: string[]
}

/** Without the AI: what the calling leans on. */
export function wishesFromCalling(background: BackgroundId): HeroWishes {
  const bg = BACKGROUNDS[background]
  const leans = new Set(Object.keys(bg.affinities).map((s) => SKILLS[s as SkillId].attr))
  return { calling: background, attributes: Object.fromEntries(ATTRS.map((a) => [a, leans.has(a) ? 15 : 10])), skills: Object.keys(bg.affinities) }
}

/** The wished-for hero as a build within the rules (the player can change it after). */
export function fitBuild(base: CharacterBuild, wishes: HeroWishes, sexMode: SexMode): CharacterBuild {
  const ids = RACE_BACKGROUNDS[base.race]
  const background = (ids as string[]).includes(wishes.calling) ? (wishes.calling as BackgroundId) : ids.includes(base.background) ? base.background : ids[0]
  const want = (a: Attr) => Math.max(ATTR_START, Math.min(20, Math.round(wishes.attributes[a] ?? 10)))
  const byWish = [...ATTRS].sort((x, y) => want(y) - want(x))
  const humanBonus = base.race === 'human' ? byWish.slice(0, 2) : []
  const partial = { ...base, background, humanBonus }
  const caps = attrCaps(partial, sexMode)
  const attributes = Object.fromEntries(ATTRS.map((a) => [a, ATTR_START])) as Record<Attr, number>
  const canRaise = (a: Attr) => attributes[a] < caps[a] && attrStepCost(attributes[a]) <= pointsLeft(attributes)
  // Toward the wishes, the furthest short first; then whatever's left on the most wished-for.
  for (let guard = 0; guard < 200; guard++) {
    const next = byWish.filter((a) => attributes[a] < want(a) && canRaise(a)).sort((x, y) => want(y) - attributes[y] - (want(x) - attributes[x]))[0]
    if (!next) break
    attributes[next]++
  }
  for (let guard = 0; guard < 200; guard++) {
    const next = byWish.find(canRaise)
    if (!next) break
    attributes[next]++
  }
  // Skills: the starting levels, spread over what they'd have practised, in turn.
  const sCaps = skillCaps({ ...partial }, sexMode)
  const wished = wishes.skills.filter((s): s is SkillId => (SKILL_IDS as readonly string[]).includes(s))
  const order = [...new Set([...wished, ...(Object.keys(BACKGROUNDS[background].affinities) as SkillId[])])]
  const skills: SkillMods = {}
  let budget = startingSkillBudget({ ...base, background })
  for (let guard = 0; budget > 0 && guard < 20; guard++) {
    let spent = false
    for (const s of order) {
      if (budget <= 0) break
      if (startingSkillLevel({ background, skills }, s) + 1 > Math.min(START_SKILL_MAX, sCaps[s])) continue
      skills[s] = (skills[s] ?? 0) + 1
      budget--
      spent = true
    }
    if (!spent) break
  }
  return { ...base, background, humanBonus, attributes, skills }
}
