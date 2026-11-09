import {
  BANNED_NAMES,
  CONDITIONS,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  RACES,
  RENOWN_TIERS,
  SEXES,
  AGES,
  BACKGROUNDS,
  SKILL_IDS,
  SKILLS,
  TIER_INFO,
  derived,
  generateName,
  skillLevelFromXp,
  type CampaignSettings,
  type CheckResult,
  type GameState,
  type Rng,
  type SkillId
} from '@shared/rules'
import type { ChatMessage } from '@shared/types'
import type { CardBookEntry, CastMember } from '@shared/cards'
import { formatCoins } from '../core/campaigns'

/**
 * The Narrator's prompt (docs/spec/06-ai-dm.md#6-narrate). The engine has already decided
 * what happened; the narrator turns it into story and must not change the outcome.
 */

const LENGTH = { short: '1–2 short paragraphs', medium: '2–4 paragraphs', long: '4–6 paragraphs' }
const TONE = {
  grim: 'grim and unforgiving: the world is cruel, hope is scarce',
  grounded: 'grounded and dangerous: a believable world where actions have weight',
  heroic: 'heroic and vivid: bold deeds, but real danger',
  whimsical: 'whimsical and warm, with real stakes underneath',
  horror: 'creeping horror: dread, the unknown, and fragile people'
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, '')} […]` : s)

/** Companions from imported cards, played by the DM. */
function companionBlock(cast: CastMember[]): string {
  const comps = cast.filter((m) => m.role === 'companion')
  if (!comps.length) return ''
  const one = (m: CastMember) =>
    [
      `${m.name}:`,
      m.description && clip(m.description, 4000),
      m.personality && `Personality: ${clip(m.personality, 800)}`,
      m.scenario && `Their situation: ${clip(m.scenario, 1200)}`,
      m.mesExample && `How they talk (examples only; never repeat them):\n${clip(m.mesExample.replace(/<START>/gi, '').trim(), 1500)}`
    ]
      .filter(Boolean)
      .join('\n')
  return `\n\nCOMPANIONS (you play them)
${comps.length === 1 ? 'This character travels' : 'These characters travel'} with the player. You voice them and decide what they do, like any other non-player character: they have their own will, can disagree, get hurt or die, and don't solve the player's problems for them. Their speech uses the @Name: line format too.
${comps.map(one).join('\n\n')}`
}

/** Lorebook entries from the cast's cards that the recent story touches. */
export function loreBlock(entries: CardBookEntry[]): string {
  if (!entries.length) return ''
  return `\n\nWORLD NOTES (background facts; use them when they matter)\n${entries.map((e) => `- ${e.content.trim()}`).join('\n')}`
}

/** Long-term memory for the prompt: older story in summary, and people and places met. */
export type MemoryText = { story: string; people: string; notes?: string }

function memoryBlock(m?: MemoryText): string {
  if (!m) return ''
  let out = ''
  if (m.notes?.trim()) out += `\n\nPINNED NOTES (the player wants you to always keep these true)\n${m.notes.trim()}`
  if (m.story.trim()) out += `\n\nTHE STORY SO FAR (older events, in order; the conversation continues from here)\n${m.story.trim()}`
  if (m.people.trim()) out += `\n\nPEOPLE AND PLACES FROM EARLIER (keep their names, facts and feelings consistent; people who are dead stay dead)\n${m.people.trim()}`
  return out
}

export function narratorSystem(
  state: GameState,
  settings: CampaignSettings,
  names: string[],
  cast: CastMember[] = [],
  lore: CardBookEntry[] = [],
  memory?: MemoryText
): string {
  const c = state.character
  const b = c.build
  const d = derived(state, settings)
  const sex = SEXES[settings.sexModifiers][b.sex]
  const skills = SKILL_IDS.map((s) => [s, skillLevelFromXp(c.skillXp[s] ?? 0)] as const)
    .filter(([, l]) => l >= 3)
    .sort((a, b2) => b2[1] - a[1])
    .slice(0, 8)
    .map(([s, l]) => `${SKILLS[s].label} ${l}`)
    .join(', ')
  const tier = RENOWN_TIERS.find((t) => c.renown >= t.min)!.label
  const deeds = c.deeds.slice(-4).map((x) => x.text).join('; ')
  const hour = Math.floor(state.time.minute / 60)
  const timeOfDay = hour < 5 ? 'night' : hour < 8 ? 'dawn' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 20 ? 'evening' : 'night'

  return `You are the Dungeon Master of a ${TONE[settings.tone]} fantasy roleplaying game.

HOW TO RUN THE GAME
- Write in second person ("you"), present tense, vivid but economical. Aim for ${LENGTH[settings.length]}.
- The player controls their character completely. Never decide, say, think or feel anything on the player character's behalf. Describe the world, other people, and the results of the character's actions, then stop and let the player act.
- In the player's messages, text "in quotation marks" is what the character says aloud; everything else is what they do. Text in ((double parentheses)) is an out-of-character instruction to you: follow it and don't treat it as story.
- A game engine rolls the dice. When the player's message ends with a [GAME ENGINE] block, it states what happened. Narrate exactly that outcome. Never turn a failure into a success or a success into a failure, never ignore damage, and never rescue the character at the last moment.${settings.failForward ? ' On a narrow failure, the character may succeed at a cost instead.' : ''}
- Match the outcome's strength: a critical success is memorable and brings something extra; a narrow success is a close call; a critical failure goes wrong in a way that matters.
- Stay in the story. Never write out-of-character notes, questions or ((bracketed)) asides yourself. If the player's action doesn't quite fit the scene (it mentions someone who isn't there, or an item they don't have), interpret it in the most sensible way the scene allows and narrate that; what the dice decided still stands.
- Play fair and play hard. The world does not bend to protect the player. Non-player characters have their own goals and act in their own interest.
- IMPORTANT FORMAT RULE: every time a non-player character speaks, put their words on a separate line that starts with @ and their name, then a colon, then the quoted words. The app turns these lines into speech bubbles with portraits. For example:
  The old man spits into the river.
  @Old Tam: "Road's not safe after dark."
  Never write speech inline like: "Road's not safe," the old man says.
- For new characters, prefer names from this list: ${names.join(', ')}. Never use these overused names: ${BANNED_NAMES.slice(0, 10).join(', ')}.
- Avoid stock phrases ("a shiver ran down your spine", "a testament to", "barely above a whisper").

ASKING FOR A ROLL
If something happens to the character that they might notice, resist or react to without having chosen to act (an ambush, a lie, a trap, a pickpocket), you may end your reply with exactly one line in this form, and then stop without revealing the outcome:
[[ROLL: skill | difficulty | short reason]]
Skills: ${SKILL_IDS.join(', ')}. Difficulty: ${DIFFICULTIES.join(', ')}. Use this sparingly, at most once every few turns.

THE PLAYER CHARACTER
${b.name}: ${RACES[b.race].label.toLowerCase()}, ${sex.label.toLowerCase()}, ${AGES[b.age].label.toLowerCase()} (${AGES[b.age].years}), ${BACKGROUNDS[b.background].label.toLowerCase()}.${b.appearance ? `\nAppearance: ${b.appearance}` : ''}${b.personality ? `\nPersonality: ${b.personality}` : ''}
Level ${c.level}. Health ${c.hp}/${d.maxHp}, stamina ${c.stamina}/${d.maxStamina}${d.maxMana ? `, mana ${c.mana}/${d.maxMana}` : ''}.${c.conditions.length ? `\nConditions: ${c.conditions.map((x) => CONDITIONS[x].label).join(', ')}.` : ''}
Best skills: ${skills || 'none trained yet'}.
Renown: ${tier}${deeds ? `, known for: ${deeds}` : ''}. ${renownGuide(tier, b.sex, settings)}
Carrying: ${c.inventory.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || 'nothing'}; ${formatCoins(c.coins)}.
${c.status === 'downed' ? 'STATUS: DOWNED: unconscious and dying.\n' : c.status === 'dead' ? 'STATUS: DEAD.\n' : ''}
WHERE AND WHEN
Day ${state.time.day}, ${timeOfDay}${state.location ? `, at ${state.location}` : ''}.${memoryBlock(memory)}${companionBlock(cast)}${loreBlock(lore)}`
}

function renownGuide(tier: string, sex: 'male' | 'female', settings: CampaignSettings) {
  const known = tier !== 'Nobody' && tier !== 'Local name'
  if (settings.sexModifiers === 'off') return known ? 'People may have heard of them.' : 'Strangers do not know them.'
  if (sex === 'male')
    return known
      ? 'His reputation precedes him; people who have heard of him take him more seriously.'
      : 'Strangers and officials do not know him and give him little respect until he proves himself.'
  return known
    ? 'People have heard of her and doors open readily.'
    : 'People are generally welcoming and willing to hear her out, but she is not taken seriously as a fighter.'
}

/** The engine's results for this turn, written for the narrator. */
export function engineNotes(
  before: GameState,
  after: GameState,
  settings: CampaignSettings,
  checks: CheckResult[],
  deathRoll?: { roll: number; success: boolean }
): string {
  const lines: string[] = []
  const max = derived(after, settings).maxHp
  if (deathRoll) {
    lines.push(`Death roll while unconscious: ${deathRoll.roll} (${deathRoll.success ? 'still clinging to life' : 'slipping away'}).`)
  }
  for (const ch of checks) {
    const t = TIER_INFO[ch.tier]
    lines.push(
      `${SKILLS[ch.skill].label} check (${ch.reason}; ${DIFFICULTY_LABEL[ch.difficulty]}): rolled ${ch.kept}${ch.bonus ? ` ${ch.bonus >= 0 ? '+' : '−'} ${Math.abs(ch.bonus)}` : ''} = ${ch.total} vs ${ch.dc} → ${t.label.toUpperCase()}. ${t.guide}${ch.kept === 20 ? ' (A natural 20!)' : ch.kept === 1 ? ' (A natural 1.)' : ''}`
    )
    if (ch.damage) lines.push(`The character takes ${ch.damage} damage from this. Health now ${Math.max(0, after.character.hp)}/${max}.`)
  }
  const a = after.character
  const b = before.character
  if (a.status === 'dead' && b.status !== 'dead') lines.push('THE CHARACTER IS DEAD. Narrate their death plainly. Do not undo it or offer a miraculous escape.')
  else if (a.status === 'downed' && b.status !== 'downed') lines.push('The character is DOWNED: they collapse, unconscious and dying. Narrate it; do not save them.')
  else if (a.status === 'alive' && b.status === 'downed') lines.push('The character has stabilised: still badly hurt, barely conscious.')
  if (a.conditions.includes('captured') && !b.conditions.includes('captured'))
    lines.push('The character is CAPTURED: overpowered and taken prisoner by their enemies, weapons taken. Narrate waking up as a prisoner.')
  if (a.hp === 1 && b.hp > 1 && a.build.race === 'orc' && a.traitUsedDay !== b.traitUsedDay && !a.conditions.includes('captured'))
    lines.push('The blow should have dropped them, but orcish fury keeps them on their feet (1 health left).')
  if (a.level > b.level) lines.push(`(The character has reached level ${a.level}. Don't mention numbers; at most a hint of growing confidence.)`)
  return lines.join('\n')
}

/** A short reminder of past rolls, so the story keeps track of what happened. */
export function pastRollNote(checks: CheckResult[]) {
  if (!checks.length) return ''
  return `\n\n[Rolls: ${checks.map((c) => `${SKILLS[c.skill].label}: ${TIER_INFO[c.tier].label.toLowerCase()}`).join('; ')}]`
}

/**
 * Trims the story to fit the model's context. Keeps the first message (the opening) and
 * as many recent messages as fit in the character budget.
 */
export function fitHistory(messages: ChatMessage[], budgetChars: number): ChatMessage[] {
  if (!messages.length) return messages
  const out: ChatMessage[] = []
  let used = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const len = messages[i].content.length
    if (used + len > budgetChars && out.length >= 2) break
    out.unshift(messages[i])
    used += len
  }
  // The API wants the conversation to start with the player.
  while (out.length && out[0].role !== 'user') out.shift()
  return out
}

// ---- DM-initiated rolls -----------------------------------------------------------------

const ROLL_TAG = /\[\[\s*ROLL\s*:\s*([^|\]]+?)\s*\|\s*([^|\]]+?)\s*\|\s*([^\]]*?)\s*\]\]/i

export function extractRollRequest(text: string): {
  text: string
  request?: { skill: SkillId; difficulty: (typeof DIFFICULTIES)[number]; reason: string; hidden: boolean }
} {
  const m = ROLL_TAG.exec(text)
  if (!m) return { text }
  const cleaned = text.replace(ROLL_TAG, '').trimEnd()
  const skill = m[1].trim().toLowerCase().replace(/\s+/g, '') as SkillId
  const difficulty = m[2].trim().toLowerCase().replace(/\s+/g, '_') as (typeof DIFFICULTIES)[number]
  if (!SKILL_IDS.includes(skill)) return { text: cleaned }
  return {
    text: cleaned,
    request: {
      skill,
      difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'moderate',
      reason: m[3].trim().slice(0, 120) || 'something is happening',
      // Noticing things shouldn't tell the player what they're noticing.
      hidden: skill === 'perception'
    }
  }
}

// ---- Banned-name filter -----------------------------------------------------------------

/**
 * Swaps overused names as the text streams. The same banned name always becomes the same
 * replacement within a campaign (seeded by campaign id), so characters keep their names.
 */
export class NameFilter {
  private pending = ''
  private banned: Set<string>

  /** `allowed`: names that must never be swapped (the player's, and imported characters'). */
  constructor(
    private campaignId: string,
    allowed: string[] = []
  ) {
    const keep = new Set(allowed.flatMap((n) => n.split(/[^A-Za-z]+/)).filter(Boolean))
    this.banned = new Set(BANNED_NAMES.filter((n) => !keep.has(n)))
  }

  private replacement(name: string): string {
    let h = 2166136261
    for (const ch of this.campaignId + name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
    let a = h >>> 0
    const rng: Rng = () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    return generateName(rng, 'human', 'female', false).replace(/^./, (c) => c.toUpperCase())
  }

  private swap(s: string) {
    return s.replace(/\b[A-Z][a-z]+\b/g, (w) => (this.banned.has(w) ? this.replacement(w) : w))
  }

  push(chunk: string): string {
    const s = this.pending + chunk
    // Hold back a trailing word that might still be growing.
    const m = /[A-Za-z]+$/.exec(s)
    const cut = m ? m.index : s.length
    this.pending = s.slice(cut)
    return this.swap(s.slice(0, cut))
  }

  flush(): string {
    const s = this.swap(this.pending)
    this.pending = ''
    return s
  }

  /** For whole texts (e.g. the saved copy). */
  apply(text: string) {
    return this.swap(text)
  }
}
