import { usePrefs } from './prefs'
import { duck, getAudio } from './audio/context'

/**
 * Sound effects, made on the spot with the Web Audio API: no audio files to download, and
 * each sound a little different every time. Quiet by design: the story is the main thing.
 */

export type Sound = 'roll' | 'land' | 'crit' | 'fumble' | 'success' | 'fail' | 'hit' | 'heal' | 'level' | 'coin' | 'item' | 'death' | 'tick'

/** The shared context, and the effects channel (its volume follows the device's settings). */
function audio(): { c: AudioContext; out: GainNode } | null {
  const a = getAudio()
  return a ? { c: a.ctx, out: a.sfx } : null
}

/** Browsers only allow sound after the player has touched or clicked something. */
export function unlockAudio() {
  getAudio()
}

type Tone = { freq: number; to?: number; type?: OscillatorType; at?: number; dur: number; gain?: number; attack?: number }

function tone(c: AudioContext, out: AudioNode, t: Tone) {
  const start = c.currentTime + (t.at ?? 0)
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = t.type ?? 'sine'
  o.frequency.setValueAtTime(t.freq, start)
  if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, start + t.dur)
  const peak = t.gain ?? 0.3
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(peak, start + (t.attack ?? 0.01))
  g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur)
  o.connect(g).connect(out)
  o.start(start)
  o.stop(start + t.dur + 0.05)
}

let noiseBuffer: AudioBuffer | null = null
function noise(c: AudioContext, out: AudioNode, n: { at?: number; dur: number; gain?: number; freq?: number; q?: number; type?: BiquadFilterType }) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== c.sampleRate) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = noiseBuffer.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const start = c.currentTime + (n.at ?? 0)
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  const f = c.createBiquadFilter()
  f.type = n.type ?? 'bandpass'
  f.frequency.value = n.freq ?? 1800
  f.Q.value = n.q ?? 1
  const g = c.createGain()
  g.gain.setValueAtTime(n.gain ?? 0.3, start)
  g.gain.exponentialRampToValueAtTime(0.0001, start + n.dur)
  src.connect(f).connect(g).connect(out)
  src.start(start, Math.random() * 0.5)
  src.stop(start + n.dur + 0.05)
}

const jitter = (x: number, by = 0.06) => x * (1 + (Math.random() * 2 - 1) * by)

const SOUNDS: Record<Sound, (c: AudioContext, out: AudioNode) => void> = {
  // The die rattling in the hand and across the table.
  roll: (c, out) => {
    let at = 0
    for (let i = 0; i < 9; i++) {
      at += 0.05 + Math.random() * 0.11
      noise(c, out, { at, dur: 0.045, gain: jitter(0.22, 0.3), freq: jitter(2600, 0.3), q: 3 })
      if (i % 3 === 2) tone(c, out, { freq: jitter(170), to: 90, at, dur: 0.07, gain: 0.12 })
    }
  },
  land: (c, out) => {
    tone(c, out, { freq: jitter(140), to: 60, dur: 0.18, gain: 0.35 })
    noise(c, out, { dur: 0.08, gain: 0.2, freq: 500, type: 'lowpass' })
  },
  crit: (c, out) => {
    ;[784, 988, 1175, 1568].forEach((f, i) => tone(c, out, { freq: f, type: 'triangle', at: i * 0.07, dur: 0.9 - i * 0.1, gain: 0.16 }))
    ;[2349, 3136].forEach((f, i) => tone(c, out, { freq: f, at: 0.28 + i * 0.05, dur: 1.2, gain: 0.05 }))
  },
  fumble: (c, out) => {
    tone(c, out, { freq: 90, to: 38, dur: 0.5, gain: 0.4 })
    noise(c, out, { at: 0.04, dur: 0.12, gain: 0.3, freq: 1800, q: 6 })
    tone(c, out, { freq: 233, to: 196, type: 'sawtooth', at: 0.1, dur: 0.4, gain: 0.04 })
  },
  success: (c, out) => {
    tone(c, out, { freq: 659, type: 'triangle', dur: 0.25, gain: 0.14 })
    tone(c, out, { freq: 988, type: 'triangle', at: 0.08, dur: 0.4, gain: 0.12 })
  },
  fail: (c, out) => {
    tone(c, out, { freq: 330, type: 'triangle', dur: 0.3, gain: 0.13 })
    tone(c, out, { freq: 262, type: 'triangle', at: 0.12, dur: 0.45, gain: 0.12 })
  },
  hit: (c, out) => {
    tone(c, out, { freq: jitter(120), to: 50, dur: 0.22, gain: 0.4 })
    noise(c, out, { dur: 0.12, gain: 0.25, freq: 900, type: 'lowpass' })
  },
  heal: (c, out) => {
    tone(c, out, { freq: 440, to: 880, dur: 0.6, gain: 0.08, attack: 0.15 })
    ;[1319, 1760].forEach((f, i) => tone(c, out, { freq: f, at: 0.18 + i * 0.1, dur: 0.6, gain: 0.05 }))
  },
  level: (c, out) => {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(c, out, { freq: f, type: 'triangle', at: i * 0.11, dur: 0.5, gain: 0.15 }))
    ;[523, 659, 784].forEach((f) => tone(c, out, { freq: f * 2, at: 0.5, dur: 1.4, gain: 0.06, attack: 0.05 }))
  },
  coin: (c, out) => {
    tone(c, out, { freq: jitter(1975, 0.03), dur: 0.12, gain: 0.1 })
    tone(c, out, { freq: jitter(2637, 0.03), at: 0.06, dur: 0.3, gain: 0.09 })
  },
  item: (c, out) => {
    tone(c, out, { freq: 520, to: 780, dur: 0.12, gain: 0.12 })
    noise(c, out, { dur: 0.05, gain: 0.08, freq: 3000, q: 2 })
  },
  death: (c, out) => {
    tone(c, out, { freq: 110, to: 55, dur: 2.6, gain: 0.25, attack: 0.3 })
    tone(c, out, { freq: 165, to: 82, type: 'triangle', dur: 2.4, gain: 0.08, attack: 0.4 })
    noise(c, out, { dur: 1.8, gain: 0.06, freq: 300, type: 'lowpass' })
  },
  tick: (c, out) => noise(c, out, { dur: 0.03, gain: 0.06, freq: 4000, q: 4 })
}

export function play(s: Sound) {
  const { sound, volume, muted } = usePrefs.getState()
  if (!sound || volume <= 0 || muted) return
  const a = audio()
  if (!a) return
  try {
    SOUNDS[s](a.c, a.out)
    if (s === 'level' || s === 'death' || s === 'crit' || s === 'fumble') duck(s === 'death' ? 3 : 1.8)
  } catch {
    /* sound is a nicety */
  }
}
