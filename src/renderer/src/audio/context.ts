import { usePrefs } from '../prefs'

/**
 * One audio context for everything (docs/spec/09-audio.md#controls): effects, music and
 * ambience each have their own channel, all through a master channel (the mute button) and a
 * gentle limiter. Volumes follow the device's settings live.
 */
export type Buses = { ctx: AudioContext; master: GainNode; sfx: GainNode; music: GainNode; ambience: GainNode; reverb: AudioNode }

let buses: Buses | null = null

/** A short, soft room for the music (made, not loaded). */
function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

function levels(b: Buses) {
  const p = usePrefs.getState()
  const t = b.ctx.currentTime
  b.master.gain.setTargetAtTime(p.muted ? 0 : 1, t, 0.05)
  b.sfx.gain.setTargetAtTime(p.sound ? p.volume : 0, t, 0.05)
  b.music.gain.setTargetAtTime(p.musicVolume * 0.55, t, 0.1)
  b.ambience.gain.setTargetAtTime(p.ambienceVolume * 0.8, t, 0.1)
}

export function getAudio(): Buses | null {
  try {
    if (!buses) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      const ctx = new AC()
      const master = ctx.createGain()
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -16
      comp.ratio.value = 4
      master.connect(comp).connect(ctx.destination)
      const sfx = ctx.createGain()
      const music = ctx.createGain()
      const ambience = ctx.createGain()
      sfx.connect(master)
      ambience.connect(master)
      // Music: mostly dry, with some room.
      const conv = ctx.createConvolver()
      conv.buffer = impulse(ctx, 2.6, 2.4)
      const wet = ctx.createGain()
      wet.gain.value = 0.32
      music.connect(master)
      music.connect(conv).connect(wet).connect(master)
      buses = { ctx, master, sfx, music, ambience, reverb: conv }
      levels(buses)
      usePrefs.subscribe(() => buses && levels(buses))
    }
    if (buses.ctx.state === 'suspended') void buses.ctx.resume()
    return buses
  } catch {
    return null
  }
}

/** Browsers only allow sound after the player has touched or clicked something. */
export function unlockAudio() {
  getAudio()
}

/** A big moment (a level, a death, a critical): the music dips under it for a breath. */
export function duck(secs = 1.8, to = 0.3) {
  const b = buses
  if (!b) return
  const t = b.ctx.currentTime
  const level = usePrefs.getState().musicVolume * 0.55
  b.music.gain.cancelScheduledValues(t)
  b.music.gain.setTargetAtTime(level * to, t, 0.06)
  b.music.gain.setTargetAtTime(level, t + secs, 0.5)
}

// ---- small helpers shared by the ambience and the music ------------------------------------------

const noiseCache = new WeakMap<AudioContext, Record<string, AudioBuffer>>()

/** Four seconds of white, pink or brown noise, made once per context. */
export function noiseBuffer(ctx: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBuffer {
  const cache = noiseCache.get(ctx) ?? {}
  noiseCache.set(ctx, cache)
  if (cache[color]) return cache[color]
  const len = ctx.sampleRate * 4
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0,
    last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (color === 'white') d[i] = w * 0.5
    else if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else {
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
  }
  cache[color] = buf
  return buf
}

/** A looping noise source, started at a random point so layers don't line up. */
export function loopNoise(ctx: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, color)
  src.loop = true
  src.start(ctx.currentTime, Math.random() * 3.5)
  return src
}

export function filter(ctx: AudioContext, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

export function gainNode(ctx: AudioContext, value: number): GainNode {
  const g = ctx.createGain()
  g.gain.value = value
  return g
}

/** Calls `fn` again and again, a random time apart. Returns a stop function. */
export function every(minMs: number, maxMs: number, fn: () => void): () => void {
  let t: ReturnType<typeof setTimeout>
  let on = true
  const next = () => {
    t = setTimeout(() => {
      if (!on) return
      try {
        fn()
      } catch {
        /* a sound failing must not stop the others */
      }
      next()
    }, minMs + Math.random() * (maxMs - minMs))
  }
  next()
  return () => {
    on = false
    clearTimeout(t)
  }
}

export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
export const rand = (a: number, b: number) => a + Math.random() * (b - a)
