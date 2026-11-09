import { z } from 'zod'
import type { Summary } from '@shared/memory'
import type { Provider } from '../providers'

/**
 * The Summarizer (docs/spec/07-memory-and-lore.md#timeline): condenses old parts of the story
 * so the DM keeps remembering them after they no longer fit in the model's context.
 */

const STYLE = `Write in past tense, third person, plainly and concretely. Name people and places exactly as the story spells them. Keep what will matter later: who was met and what they want, promises, debts, threats, injuries, items gained or lost, secrets learned, decisions made, and anything left unresolved. Leave out atmosphere, weather and dialogue wording. Never invent anything.`

export const SceneSchema = z.object({
  title: z.string().describe('A short title for this stretch of story, 2 to 6 words'),
  summary: z.string().describe('3 to 6 sentences')
})

export const ChapterSchema = z.object({
  title: z.string().describe('A short chapter title, 2 to 6 words'),
  summary: z.string().describe('One paragraph of 4 to 8 sentences')
})

export const ArcSchema = z.object({
  storySoFar: z.string().describe('The whole story so far in 4 to 8 sentences')
})

export type StoryLine = { role: 'user' | 'assistant'; content: string }

export async function summarizeScene(provider: Provider, model: string, player: string, lines: StoryLine[]) {
  const text = lines.map((l) => `${l.role === 'user' ? `${player.toUpperCase()} (the player)` : 'DM'}: ${l.content}`).join('\n\n')
  return provider.complete(model, {
    system: `You summarize part of a fantasy roleplaying game for the game's long-term memory. The player character is ${player}. ${STYLE}`,
    messages: [{ role: 'user', content: `${text}\n\nSummarize this part of the story.` }],
    schema: SceneSchema,
    name: 'summarize_scene'
  })
}

export async function summarizeChapter(provider: Provider, model: string, player: string, scenes: Summary[]) {
  const text = scenes.map((s, i) => `${i + 1}. ${s.title} (day ${s.fromDay}${s.toDay !== s.fromDay ? `–${s.toDay}` : ''}): ${s.text}`).join('\n')
  return provider.complete(model, {
    system: `You combine scene summaries from a fantasy roleplaying game into one chapter summary for the game's long-term memory. The player character is ${player}. Keep events in order. ${STYLE}`,
    messages: [{ role: 'user', content: `${text}\n\nWrite the chapter summary.` }],
    schema: ChapterSchema,
    name: 'summarize_chapter'
  })
}

export async function updateArc(provider: Provider, model: string, player: string, arc: string, chapter: Summary) {
  return provider.complete(model, {
    system: `You keep the running "story so far" of a fantasy roleplaying game: the big picture of the whole campaign. The player character is ${player}. Keep the main threads, allies, enemies and goals; drop details that no longer matter. ${STYLE}`,
    messages: [
      {
        role: 'user',
        content: `STORY SO FAR:\n${arc || '(nothing yet: this is the first chapter)'}\n\nNEW CHAPTER: ${chapter.title}\n${chapter.text}\n\nRewrite the story so far to include the new chapter.`
      }
    ],
    schema: ArcSchema,
    name: 'story_so_far'
  })
}
