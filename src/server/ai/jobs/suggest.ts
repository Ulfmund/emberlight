import type { Genre } from '@shared/genre'
import { z } from 'zod'
import { callingName, combatSummary, mainWeapon, partySummary, RACES, type GameState } from '@shared/rules'
import type { ChatMessage } from '@shared/types'
import type { Provider } from '../providers'

/**
 * Help for a player who's stuck (docs/spec/06-ai-dm.md#8-suggestions): three things their
 * character could do now, and "ghost text" that finishes the sentence they're typing.
 */

export type Suggestion = { kind: 'bold' | 'careful' | 'say'; text: string }

// Models without a schema to hold them to sometimes leave one of these out, or send something
// that isn't text. That one comes back empty and is dropped; the other ideas are still shown.
const SuggestSchema = z.object({
  bold: z.string().describe('A bold or risky action, in the first person ("I ...")').catch(''),
  careful: z.string().describe('A careful, clever or sneaky action, in the first person').catch(''),
  say: z.string().describe('Something to say aloud, in "quotation marks", maybe with a small action').catch('')
})

/** The game, as each job names it (genre.ts). */
const GAME: Record<Genre, string> = { fantasy: 'a fantasy roleplaying game', scifi: 'a grim far-future science-fiction roleplaying game' }

const SUGGEST_SYSTEM = (genre: Genre) => `You help the player of ${GAME[genre]} decide what to do next. Read the story and offer three different things their character could do right now, each in the player's own voice: first person, present tense, one or two short sentences, under 30 words. Speech goes in "quotation marks". Use only people, places and things that are in the story or in the character's pack. Don't decide outcomes; only say what they try.`

const storyOf = (recent: ChatMessage[]) =>
  recent
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'PLAYER' : 'DM'}: ${m.content.slice(0, 1200)}`)
    .join('\n\n')

function who(state: GameState) {
  const c = state.character
  const b = c.build
  const weapon = mainWeapon(c)
  const pack = c.inventory.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || 'nothing'
  const fight = state.combat ? `\nA fight is on: ${combatSummary(state)}.${partySummary(state) ? ` Fighting beside them: ${partySummary(state)}.` : ''}` : ''
  return `The player character: ${b.name}, ${[RACES[b.race].label.toLowerCase(), callingName(b)].filter(Boolean).join(' ')}. Health ${c.hp}. Wielding ${weapon.unarmed ? 'nothing' : weapon.name}. Carrying: ${pack}.${fight}`
}

/** Strips what models like to add: labels, numbering, wrapping quotes around a whole action. */
function tidy(s: string, speech: boolean): string {
  let t = s.trim().replace(/^(bold|careful|say|option \d)\s*[:.-]\s*/i, '').replace(/^\d+[.)]\s*/, '')
  if (!speech && /^["“].*["”]$/.test(t) && !t.slice(1, -1).includes('"')) t = t.slice(1, -1).trim()
  return t.slice(0, 300)
}

export async function suggestActions(provider: Provider, model: string, state: GameState, recent: ChatMessage[], signal?: AbortSignal, genre: Genre = 'fantasy'): Promise<Suggestion[]> {
  const prompt = `The story so far (most recent last):\n${storyOf(recent) || '(the adventure is just starting)'}\n\n${who(state)}\n\nWhat could they do now? One bold option, one careful option, and one thing to say.`
  const out = await provider.complete(model, { system: SUGGEST_SYSTEM(genre), messages: [{ role: 'user', content: prompt }], schema: SuggestSchema, name: 'suggestions', signal })
  const list: Suggestion[] = [
    { kind: 'bold', text: tidy(out.bold, false) },
    { kind: 'careful', text: tidy(out.careful, false) },
    { kind: 'say', text: tidy(out.say, true) }
  ]
  // Only ideas with words in them. None at all, and the Ideas box says so.
  return list.filter((s) => /\p{L}/u.test(s.text))
}

// ---- ghost text -------------------------------------------------------------------------------

const GhostSchema = z.object({
  continuation: z.string().describe('The next few words the player would type, carrying on exactly where they stopped. Empty if their text already reads as finished')
})

const GHOST_SYSTEM = (genre: Genre) => `You finish the player's sentence in ${GAME[genre]}, like a phone keyboard's suggestion. Continue their text with the next few words (at most 12) in their voice, fitting the story. Never repeat what they already wrote, and never write what happens as a result: only more of what they do or say. If their text already reads as finished, answer with an empty continuation.`

/** The longest overlap between the end of what's typed and the start of the continuation. */
function overlap(typed: string, cont: string): number {
  const a = typed.toLowerCase()
  const b = cont.toLowerCase()
  for (let n = Math.min(a.length, b.length, 60); n > 2; n--) if (a.endsWith(b.slice(0, n))) return n
  return 0
}

export async function ghostText(provider: Provider, model: string, state: GameState, recent: ChatMessage[], typed: string, signal?: AbortSignal, genre: Genre = 'fantasy'): Promise<string> {
  const prompt = `The story so far (most recent last):\n${storyOf(recent.slice(-2)) || '(the adventure is just starting)'}\n\n${who(state)}\n\nThe player has typed so far:\n"""${typed}"""\n\nContinue it.`
  const out = await provider.complete(model, { system: GHOST_SYSTEM(genre), messages: [{ role: 'user', content: prompt }], schema: GhostSchema, name: 'ghost_text', signal })
  let cont = out.continuation.replace(/\s+/g, ' ')
  // Models sometimes echo the typed text back first.
  if (cont.trim().toLowerCase().startsWith(typed.trim().toLowerCase()) && typed.trim().length > 3) cont = cont.trim().slice(typed.trim().length)
  cont = cont.slice(overlap(typed, cont))
  const words = cont.split(' ')
  if (words.filter(Boolean).length > 12) cont = words.slice(0, words[0] === '' ? 13 : 12).join(' ')
  // A space between words, unless they're finishing a word they started.
  if (/\s$/.test(typed)) cont = cont.trimStart()
  else if (cont && !/^[\s,.;:!?'"”)\-]/.test(cont) && /[.,;:!?"”]$/.test(typed)) cont = ` ${cont}`
  return cont.trimEnd().slice(0, 140)
}
