import { weatherNow, type CampaignSettings, type GameState, type PlaceKind, type Weather } from './rules'

/**
 * How the scene sounds (docs/spec/09-audio.md#how-the-scene-decides-the-mix): the place, the
 * hour, the weather, a fight, a death and the campaign's tone decide which music plays and
 * which ambient beds are mixed in, and how loud. A plain table, so it's easy to tune.
 */

export const MOODS = ['explore', 'town', 'night', 'tension', 'combat', 'sorrow', 'eerie'] as const
export type Mood = (typeof MOODS)[number]

export const BEDS = ['wind', 'rain', 'storm', 'fire', 'crickets', 'birds', 'river', 'sea', 'drips', 'tavern', 'town', 'owl'] as const
export type Bed = (typeof BEDS)[number]

/** What the player can tag their own tracks with (moods and beds both). */
export const TRACK_TAGS = [...MOODS, ...BEDS] as const
export type TrackTag = (typeof TRACK_TAGS)[number]

export type Scene = { place: PlaceKind | null; night: boolean; weather: Weather | null; combat: boolean; dead: boolean; horror: boolean }

export type Soundscape = {
  music: Mood | null
  /** Bed → how loud (0 to 1). */
  beds: Partial<Record<Bed, number>>
  /** Seconds to fade into this (quick when a fight starts). */
  fade: number
}

export function sceneOf(state: GameState, settings: Pick<CampaignSettings, 'tone'>): Scene {
  const hour = Math.floor(state.time.minute / 60)
  return {
    place: state.placeKind,
    night: hour < 6 || hour >= 20,
    weather: weatherNow(state),
    combat: Boolean(state.combat),
    dead: state.character.status === 'dead',
    horror: settings.tone === 'horror'
  }
}

const PLACE_BEDS: Record<PlaceKind, { day: Partial<Record<Bed, number>>; night: Partial<Record<Bed, number>>; music: Mood }> = {
  town: { day: { town: 0.55, wind: 0.12 }, night: { crickets: 0.25, wind: 0.15 }, music: 'town' },
  village: { day: { town: 0.35, birds: 0.25, wind: 0.15 }, night: { crickets: 0.4, owl: 0.2 }, music: 'town' },
  indoors: { day: { tavern: 0.55, fire: 0.45 }, night: { tavern: 0.45, fire: 0.5 }, music: 'town' },
  road: { day: { wind: 0.35, birds: 0.3 }, night: { crickets: 0.45, wind: 0.2 }, music: 'explore' },
  forest: { day: { birds: 0.55, wind: 0.22 }, night: { crickets: 0.5, owl: 0.3, wind: 0.15 }, music: 'explore' },
  hills: { day: { wind: 0.55, birds: 0.12 }, night: { wind: 0.45, crickets: 0.2 }, music: 'explore' },
  wild: { day: { wind: 0.45, birds: 0.2 }, night: { crickets: 0.4, wind: 0.3, owl: 0.15 }, music: 'explore' },
  water: { day: { river: 0.55, wind: 0.2, birds: 0.12 }, night: { river: 0.5, crickets: 0.25 }, music: 'explore' },
  ruin: { day: { wind: 0.4, drips: 0.2 }, night: { wind: 0.35, drips: 0.25, owl: 0.15 }, music: 'tension' },
  underground: { day: { drips: 0.55, wind: 0.08 }, night: { drips: 0.55, wind: 0.08 }, music: 'tension' }
}

export function soundscape(s: Scene): Soundscape {
  if (s.dead) return { music: 'sorrow', beds: { wind: 0.15 }, fade: 6 }
  const place = s.place ? PLACE_BEDS[s.place] : PLACE_BEDS.road
  const beds: Partial<Record<Bed, number>> = { ...(s.night ? place.night : place.day) }
  const sheltered = s.place === 'indoors' || s.place === 'underground'
  // Weather outside; heard through the walls when indoors.
  if (s.weather === 'rain') beds.rain = sheltered ? 0.2 : 0.65
  if (s.weather === 'storm') {
    beds.storm = sheltered ? 0.35 : 0.8
    delete beds.birds
  }
  if (s.weather === 'snow' || s.weather === 'fog') {
    delete beds.birds
    beds.wind = Math.max(beds.wind ?? 0, sheltered ? 0.05 : 0.35)
  }
  if ((s.weather === 'rain' || s.weather === 'storm') && !sheltered) {
    delete beds.birds
    delete beds.crickets
  }
  let music: Mood = s.night && (place.music === 'explore' || place.music === 'town') && s.place !== 'indoors' ? 'night' : place.music
  if (s.horror && (music === 'explore' || music === 'tension' || music === 'night')) music = 'eerie'
  if (s.combat) {
    // The fight takes over: its music, and the world half as loud.
    for (const k of Object.keys(beds) as Bed[]) beds[k] = (beds[k] ?? 0) * 0.5
    return { music: 'combat', beds, fade: 1.5 }
  }
  return { music, beds, fade: 5 }
}

/** Kinds of file the player's own library takes. */
export const AUDIO_TYPES: Record<string, string> = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', webm: 'audio/webm' }

export type Track = { id: string; name: string; kind: 'music' | 'ambience'; tags: TrackTag[]; volume: number; mime: string; size: number }
