import { z } from 'zod'
import { BACKGROUNDS, RACES, type GameState } from '@shared/rules'
import type { ChatMessage } from '@shared/types'
import type { Provider } from '../providers'

/**
 * The epitaph (docs/spec/03-characters-and-cards.md#when-a-character-dies): a line or two for a
 * character who has just died, shown on the death screen and kept in the Hall of the Fallen.
 */

const EpitaphSchema = z.object({
  epitaph: z.string().describe('One or two short sentences, the way the people who knew them would remember them')
})

const SYSTEM = `You write epitaphs for fallen adventurers in a fantasy roleplaying game: the words on a grave marker, or the line a tavern would remember them by. One or two short, plain sentences. Their name is carved above it, so don't start with it, and don't list their traits: say one true thing about who they were or what they did, and how they died. Be honest, not flattering, and never mock them. No stock phrases ("a testament to", "will never be forgotten"), no rhyming, no names of the living.`

export async function writeEpitaph(provider: Provider, model: string, state: GameState, cause: string, recent: ChatMessage[]): Promise<string> {
  const c = state.character
  const b = c.build
  const deeds = c.deeds.map((d) => d.text).join('; ')
  const story = recent
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'PLAYER' : 'DM'}: ${m.content.slice(0, 700)}`)
    .join('\n\n')
  const prompt = `${b.name}, ${RACES[b.race].label.toLowerCase()} ${BACKGROUNDS[b.background].label.toLowerCase()}, level ${c.level}, died on day ${state.time.day}${state.location ? ` near ${state.location}` : ''}: ${cause}.${deeds ? `\nKnown for: ${deeds}.` : ''}${b.personality ? `\nWhat they were like: ${b.personality.slice(0, 300)}` : ''}

The end of their story:
${story}

Write their epitaph.`
  const out = await provider.complete(model, { system: SYSTEM, messages: [{ role: 'user', content: prompt }], schema: EpitaphSchema, name: 'epitaph' })
  return out.epitaph.trim().replace(/^["“]|["”]$/g, '').slice(0, 400)
}
