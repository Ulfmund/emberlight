import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { TRACK_TAGS, type Bed, type Mood, type Track, type TrackTag } from '@shared/scene'
import { newId } from '../store/db'

/**
 * The player's own music and sounds (docs/spec/09-audio.md#track-library): files they add, kept
 * in an `audio/` folder beside the save, with a manifest of what each is for.
 */

export const MAX_AUDIO = 40 * 1024 * 1024

export class AudioError extends Error {}

/** What a file really is, from its first bytes (never from its name alone). */
export function audioType(b: Uint8Array): { ext: string; mime: string } | null {
  const s = (from: number, to: number) => Buffer.from(b.subarray(from, to)).toString('latin1')
  if (s(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' }
  if (s(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' }
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' }
  if (s(0, 4) === 'fLaC') return { ext: 'flac', mime: 'audio/flac' }
  if (s(4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: 'webm', mime: 'audio/webm' }
  return null
}

/** A good first guess at what a file is for, from its name ("tavern_night.ogg"). */
export function guessTags(filename: string): { kind: Track['kind']; tags: TrackTag[] } {
  // "TavernNight_02.ogg" -> " tavern night 02 "
  const n = ` ${filename
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')} `
  const moods: [RegExp, Mood][] = [
    [/\b(battle|combat|fight|fighting|boss|war|clash|skirmish)\b/, 'combat'],
    [/\b(town|city|market|village|tavern|inn)\b/, 'town'],
    [/\b(night|nocturne|moon|moonlit|moonlight)\b/, 'night'],
    [/\b(tension|tense|danger|suspense|dark|dungeon|stealth|sneak)/, 'tension'],
    [/\b(sad|sorrow|grief|lament|funeral|death|requiem|mourning)\b/, 'sorrow'],
    [/\b(eerie|horror|haunted|haunting|ghost|ghosts|creepy)\b/, 'eerie'],
    [/\b(explore|exploring|exploration|travel|adventure|journey|road|overworld|fields?|wander)/, 'explore']
  ]
  const beds: [RegExp, Bed][] = [
    [/\b(wind|winds|windy|gust|gusts|breeze)\b/, 'wind'],
    [/\b(storm|storms|stormy|thunder|thunderstorm)\b/, 'storm'],
    [/\b(rain|rainy|rainfall|drizzle|downpour)\b/, 'rain'],
    [/\b(fire|fires|hearth|campfire|fireplace|crackling|crackle)\b/, 'fire'],
    [/\b(cricket|crickets|insects?|cicadas?)\b/, 'crickets'],
    [/\b(birds?|birdsong|forest|woods|woodland)\b/, 'birds'],
    [/\b(owl|owls)\b/, 'owl'],
    [/\b(river|stream|brook|creek|waterfall)\b/, 'river'],
    [/\b(sea|ocean|waves|shore|beach|harbou?r|coast)\b/, 'sea'],
    [/\b(drip|drips|dripping|cave|caves|cavern)\b/, 'drips'],
    [/\b(tavern|inn|pub|crowd|chatter)\b/, 'tavern'],
    [/\b(town|city|market|street|streets)\b/, 'town']
  ]
  const found = <T>(list: [RegExp, T][]) => [...new Set(list.filter(([re]) => re.test(n)).map(([, t]) => t))]
  const m = found(moods)
  const b = found(beds)
  const saysAmbient = /\b(ambient|ambience|ambiance|atmosphere|atmos|loop|sfx|sounds?|soundscape)\b/.test(n)
  const ambient = saysAmbient ? b.length > 0 || m.length === 0 : m.length === 0 && b.length > 0
  // Ambience with nothing recognisable gets no tags: the library asks the player to pick.
  return ambient ? { kind: 'ambience', tags: b } : { kind: 'music', tags: m.length ? m : ['explore'] }
}

export class AudioLibrary {
  private dir: string
  private file: string
  private tracks: (Track & { ext: string })[]

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'audio')
    this.file = join(this.dir, 'manifest.json')
    mkdirSync(this.dir, { recursive: true })
    this.tracks = this.load()
  }

  private load(): (Track & { ext: string })[] {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as { tracks?: (Track & { ext: string })[] }
      return (raw.tracks ?? []).filter((t) => existsSync(join(this.dir, `${t.id}.${t.ext}`)))
    } catch {
      return []
    }
  }

  private save() {
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, tracks: this.tracks }, null, 2))
    renameSync(tmp, this.file)
  }

  list(): Track[] {
    return this.tracks.map(({ ext: _ext, ...t }) => t)
  }

  import(bytes: Uint8Array, filename: string): Track {
    if (bytes.length > MAX_AUDIO) throw new AudioError('That file is too large (over 40 MB).')
    const type = audioType(bytes)
    if (!type) throw new AudioError("That isn't a sound file Emberlight can play (MP3, OGG, WAV, FLAC, M4A or WebM).")
    const id = newId('aud')
    writeFileSync(join(this.dir, `${id}.${type.ext}`), bytes)
    const name = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 80) || 'Untitled'
    const track = { id, name, ...guessTags(filename), volume: 0.8, mime: type.mime, size: bytes.length, ext: type.ext }
    this.tracks.push(track)
    this.save()
    const { ext: _ext, ...out } = track
    return out
  }

  update(id: string, patch: Partial<Pick<Track, 'name' | 'kind' | 'tags' | 'volume'>>): Track {
    const t = this.tracks.find((x) => x.id === id)
    if (!t) throw new AudioError('That sound is no longer in your library.')
    if (patch.name !== undefined) t.name = patch.name.trim().slice(0, 80) || t.name
    if (patch.kind) t.kind = patch.kind
    if (patch.tags) t.tags = [...new Set(patch.tags.filter((x) => (TRACK_TAGS as readonly string[]).includes(x)))]
    if (patch.volume !== undefined) t.volume = Math.max(0, Math.min(1, patch.volume))
    this.save()
    const { ext: _ext, ...out } = t
    return out
  }

  delete(id: string) {
    const t = this.tracks.find((x) => x.id === id)
    if (!t) return
    this.tracks = this.tracks.filter((x) => x.id !== id)
    this.save()
    rmSync(join(this.dir, `${t.id}.${t.ext}`), { force: true })
  }

  read(id: string): { data: Buffer; mime: string } | null {
    const t = this.tracks.find((x) => x.id === id)
    if (!t) return null
    try {
      return { data: readFileSync(join(this.dir, `${t.id}.${t.ext}`)), mime: t.mime }
    } catch {
      return null
    }
  }
}
