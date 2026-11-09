import { z } from 'zod'
import type { Provider } from '../providers'

/**
 * The Vision job (docs/spec/02-models-and-backends.md): a picture, put into words, so the DM
 * (and any model, even one that can't see) knows what the player showed it.
 */

const DescribeSchema = z.object({ description: z.string().describe('The description, in plain prose') })

const SYSTEM = `You describe pictures for a fantasy roleplaying game, so a storyteller who can't see them knows exactly what's there. Write plain, concrete prose. Describe the thing itself as part of the world ("A tall woman with..."; "A silver amulet shaped like..."), never the picture: no "the image shows", no art style, no camera or lighting talk unless it matters to the story.`

export async function describeImage(
  provider: Provider,
  model: string,
  image: { mime: string; data: string },
  purpose: { kind: 'portrait'; who: string } | { kind: 'story'; said: string },
  signal?: AbortSignal
): Promise<string> {
  const ask =
    purpose.kind === 'portrait'
      ? `This is what the player character, ${purpose.who}, looks like. Describe their appearance in two or three sentences: build, face, hair, eyes, clothes and gear, anything striking.`
      : `In the story, the player shows this picture${purpose.said.trim() ? `, saying: "${purpose.said.trim().slice(0, 400)}"` : ''}. Describe what it shows in one to three sentences, as something that exists in the world.`
  const out = await provider.complete(model, { system: SYSTEM, messages: [{ role: 'user', content: ask }], schema: DescribeSchema, name: 'describe_image', images: [image], signal })
  const text = out.description.trim().replace(/^(the|this) (image|picture|photo) (shows|depicts)\s*/i, '')
  return (text.charAt(0).toUpperCase() + text.slice(1)).slice(0, 900)
}
