/**
 * DM personas (docs/spec/03-characters-and-cards.md#the-dm-is-a-card-too): the narrator's voice
 * and attitude. A persona changes how the story is told, never what the dice decided.
 * A campaign's `persona` setting is one of these ids, or "card:<id>" for a character card.
 */

export type Persona = {
  id: string
  name: string
  /** One line for the picker. */
  blurb: string
  /** Told to the narrator. Empty: the plain, fair default. */
  voice: string
  /** Whether ((out-of-character)) requests are followed, or met in character. */
  ooc: 'follow' | 'argue'
}

export const PERSONAS: Persona[] = [
  {
    id: 'chronicler',
    name: 'The Chronicler',
    blurb: 'Fair, vivid and even-handed. The default.',
    voice: '',
    ooc: 'follow'
  },
  {
    id: 'grim_bard',
    name: 'The Grim Bard',
    blurb: 'Dark, lyrical prose, omens and the weight of loss.',
    voice: 'You tell the tale like a bard singing of old sorrows: lyrical, dark, fond of omens, weather and the weight of loss. Beauty is always edged with decay. Never cheerful, never cruel for its own sake.',
    ooc: 'follow'
  },
  {
    id: 'old_soldier',
    name: 'The Old Soldier',
    blurb: 'Terse and unsentimental. Short sentences, plain violence.',
    voice: 'You narrate like an old soldier telling it straight: short sentences, plain words, no flourishes. Violence is quick, ugly and described honestly; so are its consequences. Practical details matter: footing, weather, gear, who is tired.',
    ooc: 'follow'
  },
  {
    id: 'hearth',
    name: 'The Hearthkeeper',
    blurb: 'Warm and cosy, with gentle humour. The world still bites.',
    voice: 'You tell the story warmly, like a storyteller by the fire: homely details, good food, small kindnesses and gentle humour. The world is still dangerous and the dice are still the dice; you just notice the light as well as the dark.',
    ooc: 'follow'
  },
  {
    id: 'trickster',
    name: 'The Trickster',
    blurb: 'Playful and contrary. Argues with your out-of-character requests.',
    voice: 'You are a sly, playful storyteller who enjoys surprising the player. Complications arrive with a wink, NPCs have their own mischief, and good luck tends to come with a catch. You are never unfair: what the dice decide still stands.',
    ooc: 'argue'
  }
]

export const DEFAULT_PERSONA = PERSONAS[0]

export const findPersona = (id: string) => PERSONAS.find((p) => p.id === id)

/** The card a "card:<id>" persona points at, if it is one. */
export const personaCardId = (id: string) => (id.startsWith('card:') ? id.slice(5) : null)
