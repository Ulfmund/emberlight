import { derived, seasonOf, weatherNow, type CampaignSettings, type GameState, type PlaceKind, type Season, type Weather } from './rules'

/**
 * How the scene sounds (docs/spec/09-audio.md#how-the-scene-decides-the-mix): the place, the
 * hour, the weather, a fight, a death and the campaign's tone decide which music plays and
 * which ambient beds are mixed in, and how loud. A plain table, so it's easy to tune.
 */

export const MOODS = ['explore', 'town', 'night', 'tension', 'combat', 'boss', 'sorrow', 'eerie'] as const
export type Mood = (typeof MOODS)[number]

export const BEDS = ['wind', 'rain', 'storm', 'fire', 'crickets', 'birds', 'river', 'sea', 'drips', 'tavern', 'town', 'owl'] as const
export type Bed = (typeof BEDS)[number]

/** Short one-off sounds for big moments (the player's own, or made on the spot). */
export const STINGERS = ['victory', 'quest', 'level', 'death'] as const
export type Stinger = (typeof STINGERS)[number]

/** What the player can tag their own tracks with (moods, beds and moments). */
export const TRACK_TAGS = [...MOODS, ...BEDS, ...STINGERS] as const
export type TrackTag = (typeof TRACK_TAGS)[number]

/** How hard a moment is: picks between the player's calm and intense tracks. */
export type Intensity = 'calm' | 'intense'

export type Scene = {
  place: PlaceKind | null
  night: boolean
  weather: Weather | null
  combat: boolean
  dead: boolean
  horror: boolean
  /** A boss among the foes still fighting. */
  boss?: boolean
  /** Foes still fighting. */
  foes?: number
  /** The character is below half health. */
  hurt?: boolean
  season?: Season
}

export type Soundscape = {
  music: Mood | null
  /** Bed → how loud (0 to 1). */
  beds: Partial<Record<Bed, number>>
  /** Seconds to fade into this (quick when a fight starts). */
  fade: number
  intensity: Intensity
}

export function sceneOf(state: GameState, settings: CampaignSettings): Scene {
  const hour = Math.floor(state.time.minute / 60)
  const fighting = (state.combat?.foes ?? []).filter((f) => f.status === 'fighting')
  return {
    place: state.placeKind,
    night: hour < 6 || hour >= 20,
    weather: weatherNow(state),
    combat: Boolean(state.combat),
    dead: state.character.status === 'dead',
    horror: settings.tone === 'horror',
    boss: fighting.some((f) => f.tier === 'boss'),
    foes: fighting.length,
    hurt: state.character.hp * 2 < derived(state, settings).maxHp,
    season: seasonOf(state.time.day)
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
  if (s.dead) return { music: 'sorrow', beds: { wind: 0.15 }, fade: 6, intensity: 'calm' }
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
  // Winter: no birdsong, no crickets, and more wind outside.
  if (s.season === 'winter') {
    delete beds.birds
    delete beds.crickets
    if (!sheltered) beds.wind = Math.min(0.8, (beds.wind ?? 0) + 0.15)
  }
  let music: Mood = s.night && (place.music === 'explore' || place.music === 'town') && s.place !== 'indoors' ? 'night' : place.music
  if (s.horror && (music === 'explore' || music === 'tension' || music === 'night')) music = 'eerie'
  if (s.combat) {
    // The fight takes over: its music (a boss's own), and the world half as loud. It turns
    // intense against a boss, against three or more, or when the character is badly hurt.
    for (const k of Object.keys(beds) as Bed[]) beds[k] = (beds[k] ?? 0) * 0.5
    const intense = Boolean(s.boss) || (s.foes ?? 0) >= 3 || Boolean(s.hurt)
    return { music: s.boss ? 'boss' : 'combat', beds, fade: 1.5, intensity: intense ? 'intense' : 'calm' }
  }
  return { music, beds, fade: 5, intensity: music === 'tension' || music === 'eerie' ? 'intense' : 'calm' }
}

/** Kinds of file the player's own library takes. */
export const AUDIO_TYPES: Record<string, string> = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', webm: 'audio/webm' }

export const TRACK_KINDS = ['music', 'ambience', 'stinger'] as const
export type TrackKind = (typeof TRACK_KINDS)[number]
/** Which moments a track suits: any, the calm ones, or the intense ones. */
export type TrackIntensity = 'any' | Intensity

export type Track = { id: string; name: string; kind: TrackKind; tags: TrackTag[]; intensity?: TrackIntensity; volume: number; mime: string; size: number }

/**
 * Of the player's tracks for a mood, the ones that suit the moment: those for its intensity (or
 * for any), else all of them. A boss fight takes fight tracks when there are no boss ones.
 */
export function tracksFor(tracks: Track[], mood: Mood, intensity: Intensity): Track[] {
  let own = tracks.filter((t) => t.kind === 'music' && t.tags.includes(mood))
  if (!own.length && mood === 'boss') own = tracks.filter((t) => t.kind === 'music' && t.tags.includes('combat'))
  const fit = own.filter((t) => !t.intensity || t.intensity === 'any' || t.intensity === intensity)
  return fit.length ? fit : own
}
