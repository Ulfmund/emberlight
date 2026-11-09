import { useEffect } from 'react'
import { create } from 'zustand'
import { BEDS, sceneOf, soundscape, tracksFor, type Bed, type Soundscape, type Stinger, type Track } from '@shared/scene'
import type { CampaignView } from '@shared/view'
import { weatherNow } from '@shared/rules'
import { duck, getAudio } from './context'
import { usePrefs } from '../prefs'
import { play } from '../sound'
import { startBed, type Running } from './beds'
import { Composer } from './music'

/**
 * The mixer (docs/spec/09-audio.md#how-the-scene-decides-the-mix): it fades from the current
 * mix to the scene's, never cutting off. The player's own tracks, tagged with a mood or a bed,
 * are used first; otherwise the music and the ambience are made on the spot.
 */

/** The player's own music and sounds (loaded from the library on the computer). */
export const useTracks = create<{ tracks: Track[]; load(): Promise<void> }>((set) => ({
  tracks: [],
  load: async () => {
    try {
      const r = await fetch('/api/audio')
      if (r.ok) set({ tracks: (await r.json()) as Track[] })
    } catch {
      /* no library, no matter */
    }
  }
}))

const decoded = new Map<string, Promise<AudioBuffer>>()
function bufferFor(ctx: AudioContext, id: string): Promise<AudioBuffer> {
  if (!decoded.has(id))
    decoded.set(
      id,
      fetch(`/api/audio/${encodeURIComponent(id)}/file`)
        .then((r) => {
          if (!r.ok) throw new Error(`audio ${r.status}`)
          return r.arrayBuffer()
        })
        .then((b) => ctx.decodeAudioData(b))
        .catch((err) => {
          decoded.delete(id)
          throw err
        })
    )
  return decoded.get(id)!
}

type TrackRun = Running & { setVolume(v: number): void }

/** One of the player's tracks, looping, with its own level. */
function startTrack(ctx: AudioContext, out: AudioNode, t: Track): TrackRun {
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(out)
  const level = ctx.createGain()
  level.gain.value = t.volume
  level.connect(gain)
  let src: AudioBufferSourceNode | null = null
  let stopped = false
  void bufferFor(ctx, t.id).then((buf) => {
    if (stopped) return
    src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.connect(level)
    src.start()
  })
  return {
    gain,
    setVolume: (v) => level.gain.setTargetAtTime(v, ctx.currentTime, 0.2),
    stop: () => {
      stopped = true
      try {
        src?.stop()
      } catch {
        /* never started */
      }
      gain.disconnect()
    }
  }
}

type Layer = { key: string; run: Running | TrackRun | Composer }

const setVolume = (layer: Layer, t: Track) => 'setVolume' in layer.run && layer.run.setVolume(t.volume)

function ramp(g: GainNode, ctx: AudioContext, to: number, secs: number) {
  const t = ctx.currentTime
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(g.gain.value, t)
  g.gain.linearRampToValueAtTime(to, t + Math.max(0.05, secs))
}

class Mixer {
  private music: Layer | null = null
  private musicMood: string | null = null
  private beds = new Map<Bed, Layer>()

  apply(scape: Soundscape, tracks: Track[]) {
    const a = getAudio()
    if (!a) return
    const { ctx } = a
    const fade = scape.fade

    // Music: the same mood keeps playing (a track picked once stays until the mood changes),
    // unless the player has just added a track for it, or taken away the one playing.
    // The player's tracks for the mood, and for how hard the moment is (calm or intense).
    const own = scape.music ? tracksFor(tracks, scape.music, scape.intensity) : []
    const current = this.music?.key.startsWith('track:') ? own.find((t) => `track:${t.id}` === this.music!.key) : undefined
    const stale = scape.music === this.musicMood && this.music && (this.music.key.startsWith('gen:') ? own.length > 0 : !current)
    if (current && this.music) setVolume(this.music, current)
    if (scape.music !== this.musicMood || stale) {
      this.musicMood = scape.music
      const old = this.music
      this.music = null
      if (old) old.run instanceof Composer ? old.run.stop(fade) : (ramp(old.run.gain, ctx, 0, fade), setTimeout(() => (old.run as Running).stop(), (fade + 0.5) * 1000))
      if (scape.music) {
        if (own.length) {
          const t = own[Math.floor(Math.random() * own.length)]
          const run = startTrack(ctx, a.music, t)
          ramp(run.gain, ctx, 1, fade)
          this.music = { key: `track:${t.id}`, run }
        } else {
          const run = new Composer(ctx, a.music, scape.music)
          run.start(fade)
          this.music = { key: `gen:${scape.music}`, run }
        }
      }
    }

    // Ambience: each bed fades to its level; the player's own sound for a bed replaces it.
    for (const bed of BEDS) {
      const level = scape.beds[bed] ?? 0
      const layer = this.beds.get(bed)
      if (level <= 0) {
        if (layer) {
          this.beds.delete(bed)
          const run = layer.run as Running
          ramp(run.gain, ctx, 0, fade)
          setTimeout(() => run.stop(), (fade + 0.5) * 1000)
        }
        continue
      }
      const own = tracks.find((t) => t.kind === 'ambience' && t.tags.includes(bed))
      const key = own ? `track:${own.id}` : `bed:${bed}`
      if (layer && layer.key === key) {
        ramp((layer.run as Running).gain, ctx, level, fade)
        if (own) setVolume(layer, own)
        continue
      }
      if (layer) {
        const run = layer.run as Running
        ramp(run.gain, ctx, 0, fade)
        setTimeout(() => run.stop(), (fade + 0.5) * 1000)
      }
      const run = own ? startTrack(ctx, a.ambience, own) : startBed(ctx, a.ambience, bed)
      ramp(run.gain, ctx, level, fade)
      this.beds.set(bed, { key, run })
    }
  }

  /** Everything fades out (leaving the game). */
  silence(fade = 2) {
    this.apply({ music: null, beds: {}, fade, intensity: 'calm' }, [])
  }
}

let mixer: Mixer | null = null
const theMixer = () => (mixer ??= new Mixer())

/**
 * A big moment (a fight won, a quest done, a level, a death): the player's own short sound for
 * it, once, over the music; otherwise the one made on the spot.
 */
export function stinger(name: Stinger) {
  const { muted, sound } = usePrefs.getState()
  if (muted || !sound) return
  const own = useTracks.getState().tracks.filter((t) => t.kind === 'stinger' && t.tags.includes(name))
  const a = getAudio()
  if (!own.length || !a) return play(name)
  const t = own[Math.floor(Math.random() * own.length)]
  bufferFor(a.ctx, t.id)
    .then((buf) => {
      const src = a.ctx.createBufferSource()
      src.buffer = buf
      const level = a.ctx.createGain()
      level.gain.value = t.volume
      src.connect(level).connect(a.sfx)
      duck(Math.min(8, buf.duration + 0.4))
      src.start()
    })
    .catch(() => play(name))
}

/** Keeps the soundscape in step with the story being played. */
export function useSoundscape(view: CampaignView | null) {
  const tracks = useTracks((s) => s.tracks)
  const load = useTracks((s) => s.load)
  useEffect(() => {
    void load()
  }, [load])
  const st = view?.state
  const hour = st ? Math.floor(st.time.minute / 60) : 12
  const fighting = st?.combat?.foes.filter((f) => f.status === 'fighting') ?? []
  const key =
    view && st
      ? [st.placeKind, weatherNow(st), hour < 6 || hour >= 20, Boolean(st.combat), fighting.some((f) => f.tier === 'boss'), fighting.length >= 3, st.character.hp * 2 < view.derived.maxHp, st.character.status, view.settings.tone].join('|')
      : ''
  useEffect(() => {
    if (!view) return
    theMixer().apply(soundscape(sceneOf(view.state, view.settings)), tracks)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tracks])
  useEffect(() => () => theMixer().silence(2), [])
}
