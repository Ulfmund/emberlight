import type { Rng } from './character'
import type { FoeSpec } from './combat'
import { SETTLED, type CampaignSettings, type EventFrequency, type GameState, type PlaceKind, type Weather } from './state'
import { seasonOf, type Season } from './calendar'
import { findPersona } from '../personas'

/**
 * Random events (docs/spec/06-ai-dm.md#5-random-events): the world doesn't wait for the player.
 * Each turn has a small chance of an event, larger when travelling or sleeping rough, picked
 * from a table for the kind of place and time of day. The narrator is told to work it in.
 */

export type EventKind = 'encounter' | 'weather' | 'wanderer' | 'discovery' | 'omen' | 'complication' | 'opportunity'
type Where = 'settlement' | 'road' | 'wild' | 'water' | 'ruin' | 'any'

export type WorldEvent = {
  id: string
  where: Where[]
  kind: EventKind
  /** What the narrator is told to introduce. */
  text: string
  weight: number
  time?: 'day' | 'night'
  /** Hostile encounters: who attacks, and whether they try to catch the character unawares. */
  foes?: FoeSpec[]
  ambush?: boolean
  /** Can happen while the character sleeps. */
  atRest?: boolean
  /** Weather events: what the sky does (the soundscape follows). */
  weather?: Weather
  /** Only in these seasons (snow in winter, never rain). */
  seasons?: Season[]
}

export const WORLD_EVENTS: WorldEvent[] = [
  // ---- anywhere ------------------------------------------------------------------------
  { id: 'rain', where: ['any'], kind: 'weather', text: 'The weather turns: cold rain sweeps in, soaking everything and turning paths to mud.', weight: 3, atRest: true, weather: 'rain', seasons: ['spring', 'summer', 'autumn'] },
  { id: 'snow', where: ['any'], kind: 'weather', text: 'Snow begins to fall, thick and quiet, and the cold bites deeper with every hour.', weight: 3, atRest: true, weather: 'snow', seasons: ['winter'] },
  { id: 'fog', where: ['any'], kind: 'weather', text: 'A thick fog rolls in, swallowing sound and sight beyond a few paces.', weight: 2, weather: 'fog' },
  { id: 'omen_crows', where: ['any'], kind: 'omen', text: 'An omen: a flock of crows wheels overhead three times and settles, watching the character in silence.', weight: 1 },
  { id: 'omen_dream', where: ['any'], kind: 'omen', text: "A vivid dream or a sudden vision troubles the character: something from the story, twisted and strange. Make it hint at a real danger ahead.", weight: 1, atRest: true, time: 'night' },
  { id: 'storm', where: ['road', 'wild', 'water'], kind: 'weather', text: 'A storm breaks: thunder, driving rain, and wind strong enough to bring down branches. Shelter would be wise.', weight: 2, atRest: true, weather: 'storm', seasons: ['spring', 'summer', 'autumn'] },

  // ---- towns and villages --------------------------------------------------------------
  { id: 'pickpocket', where: ['settlement'], kind: 'complication', text: 'A pickpocket makes a try for the character\'s purse in the crowd. Ask for a hidden perception roll with [[ROLL: perception | moderate | a hand at your belt]].', weight: 2, time: 'day' },
  { id: 'messenger', where: ['settlement'], kind: 'wanderer', text: 'A breathless messenger or child seeks out the character with a message from someone who needs help, and won\'t say much more in public.', weight: 2 },
  { id: 'brawl', where: ['settlement'], kind: 'encounter', text: 'Two drunk, angry men pick a fight with the character, spoiling for trouble.', weight: 1, time: 'night', foes: [{ kind: 'thug', count: 2, tier: 'minion' }] },
  { id: 'notice', where: ['settlement'], kind: 'opportunity', text: 'A notice is being nailed up, or shouted by a crier: a reward offered for a job that fits the character\'s skills.', weight: 2, time: 'day' },
  { id: 'patrol', where: ['settlement', 'road'], kind: 'wanderer', text: "A patrol of local guards stops the character: questions, a toll, or a search, depending on the mood of the sergeant.", weight: 1, time: 'day' },
  { id: 'fire', where: ['settlement'], kind: 'complication', text: 'Shouting and smoke: a fire has broken out nearby, and people are running with buckets. Someone is trapped.', weight: 1 },
  { id: 'rumor', where: ['settlement'], kind: 'discovery', text: 'The character overhears a rumour that matters: something dangerous or valuable close by, half true at best.', weight: 2 },

  // ---- roads ---------------------------------------------------------------------------
  { id: 'travellers', where: ['road'], kind: 'wanderer', text: 'Travellers come the other way: a family with a handcart, or a pedlar, with news of the road ahead.', weight: 3, time: 'day' },
  { id: 'cart', where: ['road'], kind: 'opportunity', text: 'A cart lies broken in a ditch, its owner desperate for help before dark. They can pay a little.', weight: 2, time: 'day' },
  { id: 'body', where: ['road', 'wild'], kind: 'discovery', text: 'A body lies by the way, not long dead, with signs of what killed it. It has something on it worth finding.', weight: 1 },
  { id: 'bandits', where: ['road'], kind: 'encounter', text: 'Bandits spring an ambush from cover beside the road, demanding everything the character carries.', weight: 2, foes: [{ kind: 'bandit', count: 2 }, { kind: 'archer', count: 1 }], ambush: true },
  { id: 'highwayman', where: ['road'], kind: 'encounter', text: 'A lone highwayman steps out with a blade and a grin and demands a toll.', weight: 1, foes: [{ kind: 'bandit', count: 1 }] },

  // ---- the wild ------------------------------------------------------------------------
  { id: 'tracks', where: ['wild'], kind: 'discovery', text: 'Fresh tracks cross the way: something big passed here recently. Ask for a survival or lore roll to read them if it fits.', weight: 2 },
  { id: 'herbs', where: ['wild'], kind: 'discovery', text: 'A patch of useful plants grows here: healing herbs, if the character knows what to look for.', weight: 2, time: 'day' },
  { id: 'wolves', where: ['wild', 'road'], kind: 'encounter', text: 'Wolves: a hungry pack closes in, circling, testing for weakness.', weight: 2, time: 'night', foes: [{ kind: 'wolf', count: 3 }], ambush: true, atRest: true },
  { id: 'boar', where: ['wild'], kind: 'encounter', text: 'A wild boar bursts out of the undergrowth and charges.', weight: 1, foes: [{ kind: 'boar', count: 1 }] },
  { id: 'bear', where: ['wild'], kind: 'encounter', text: 'A great bear rears up ahead, angry at being disturbed.', weight: 1, foes: [{ kind: 'bear', count: 1, tier: 'elite' }] },
  { id: 'camp', where: ['wild'], kind: 'wanderer', text: "The smoke of a small campfire: a hunter, a hermit or an outlaw, wary of strangers.", weight: 2 },
  { id: 'ruin_glimpse', where: ['wild'], kind: 'discovery', text: 'Through the trees or across a slope, the character glimpses old stonework: a ruin nobody mentioned.', weight: 1, time: 'day' },
  { id: 'spiders', where: ['wild', 'ruin'], kind: 'encounter', text: 'Webs everywhere, and something large and many-legged drops from above.', weight: 1, foes: [{ kind: 'giant spider', count: 2 }], ambush: true },

  // ---- water ---------------------------------------------------------------------------
  { id: 'drowned', where: ['water'], kind: 'encounter', text: 'Something pale and dripping drags itself out of the water at the character.', weight: 1, time: 'night', foes: [{ kind: 'drowned one', count: 2 }], ambush: true, atRest: true },
  { id: 'boat', where: ['water'], kind: 'wanderer', text: 'A small boat drifts close: a fisher, a smuggler, or nobody at all.', weight: 2 },
  { id: 'catch', where: ['water'], kind: 'opportunity', text: 'Fish are rising thick in the shallows: easy pickings for anyone with a line or a net.', weight: 1, time: 'day' },

  // ---- ruins and the deep --------------------------------------------------------------
  { id: 'rats', where: ['ruin'], kind: 'encounter', text: 'Squealing in the dark: a swarm of giant rats pours out of a crack in the wall.', weight: 2, foes: [{ kind: 'giant rat', count: 4, tier: 'minion' }] },
  { id: 'skeletons', where: ['ruin'], kind: 'encounter', text: 'Bones stir and rise: the dead here do not rest.', weight: 1, foes: [{ kind: 'skeleton', count: 2 }] },
  { id: 'collapse', where: ['ruin'], kind: 'complication', text: 'The floor or ceiling groans and gives way nearby. Ask for an athletics roll with [[ROLL: athletics | moderate | the stone gives way]].', weight: 1 },
  { id: 'cache', where: ['ruin'], kind: 'discovery', text: 'A hidden cache: a loose stone or a rotten chest with something old and useful inside.', weight: 1 },
  { id: 'whispers', where: ['ruin'], kind: 'omen', text: 'Whispers in the dark, just too quiet to make out, that stop when the character stops.', weight: 1 },
  { id: 'ghouls', where: ['ruin'], kind: 'encounter', text: 'Hunched, grey shapes come shuffling out of the dark, hungry.', weight: 1, time: 'night', foes: [{ kind: 'ghoul', count: 2 }], ambush: true }
]

const WHERE: Record<PlaceKind, Where> = {
  town: 'settlement',
  village: 'settlement',
  indoors: 'settlement',
  road: 'road',
  forest: 'wild',
  hills: 'wild',
  wild: 'wild',
  water: 'water',
  ruin: 'ruin',
  underground: 'ruin'
}

/** Chance of an event on an ordinary turn, by the campaign's event frequency. */
export const EVENT_CHANCE: Record<EventFrequency, number> = { calm: 0.03, normal: 0.07, eventful: 0.14, chaos: 0.25 }

export type EventContext = {
  /** What the player is doing this turn (from the Referee). */
  intent?: string
  /** Something loud happened (a critical failure, a fight). */
  noise?: boolean
  /** Turns since the last event (to keep them from piling up). */
  turnsSinceLast: number
}

/** Rolls for a random event this turn. Null most of the time. */
export function rollWorldEvent(state: GameState, settings: CampaignSettings, ctx: EventContext, rng: Rng): WorldEvent | null {
  if (state.combat || state.character.status !== 'alive' || ctx.turnsSinceLast < 3) return null
  const place = state.placeKind ? WHERE[state.placeKind] : null
  const settled = state.placeKind ? SETTLED.includes(state.placeKind) : true
  const hour = Math.floor(state.time.minute / 60)
  const night = hour < 6 || hour >= 20
  const resting = ctx.intent === 'rest'
  // The storyteller's leanings (personas.ts): more or fewer events, and which kinds.
  const lean = findPersona(settings.persona)?.leanings
  let chance = EVENT_CHANCE[settings.events] * (lean?.chance ?? 1)
  if (ctx.intent === 'travel') chance *= 2.5
  else if (ctx.intent === 'explore') chance *= 1.3
  if (resting) chance *= settled ? 0.3 : 3
  if (settled) chance *= 0.7
  if (night && !settled) chance *= 1.3
  if (ctx.noise) chance += 0.1
  if (rng() >= Math.min(0.6, chance)) return null

  const fits = WORLD_EVENTS.filter(
    (e) =>
      (e.where.includes('any') || (place && e.where.includes(place)) || (!place && e.where.includes('settlement'))) &&
      (!e.time || (e.time === 'night') === night) &&
      (!e.seasons || e.seasons.includes(seasonOf(state.time.day))) &&
      (!resting || e.atRest)
  )
  const weight = (e: WorldEvent) => e.weight * (lean?.kinds?.[e.kind] ?? 1)
  const total = fits.reduce((n, e) => n + weight(e), 0)
  if (!total) return null
  let pick = rng() * total
  for (const e of fits) {
    pick -= weight(e)
    if (pick <= 0) return e
  }
  return fits[fits.length - 1]
}
