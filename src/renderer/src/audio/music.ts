import type { Mood } from '@shared/scene'
import { filter, gainNode, midiHz, noiseBuffer, rand } from './context'

/**
 * Music made on the spot (docs/spec/09-audio.md#layers), one mood at a time: a slow pad over a
 * chord progression, a bass note, a sparse melody in the mood's mode, and drums for a fight.
 * Quiet and unhurried by design; the player's own tracks replace it when they've added some.
 */

type Spec = {
  /** MIDI note of the key's root (low). */
  root: number
  scale: number[]
  /** Chords as scale degrees. */
  chords: number[][]
  /** Seconds per chord. */
  chordSecs: number
  pad: { type: OscillatorType; cutoff: number; gain: number }
  melody: { density: number; voice: 'pluck' | 'flute'; octave: number }
  bass: boolean
  /** Beats per minute, for the fight's drums and its driving bass. */
  drums?: number
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10]
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]
const HARMONIC = [0, 2, 3, 5, 7, 8, 11]
const WHOLE = [0, 2, 4, 6, 8, 10]

const SPECS: Record<Mood, Spec> = {
  explore: { root: 50, scale: DORIAN, chords: [[0, 2, 4], [3, 5, 0], [4, 6, 1], [0, 2, 4], [6, 1, 3], [3, 5, 0]], chordSecs: 7, pad: { type: 'triangle', cutoff: 1400, gain: 0.05 }, melody: { density: 0.32, voice: 'pluck', octave: 2 }, bass: true },
  town: { root: 55, scale: MAJOR, chords: [[0, 2, 4], [4, 6, 1], [5, 0, 2], [3, 5, 0]], chordSecs: 5, pad: { type: 'triangle', cutoff: 1800, gain: 0.045 }, melody: { density: 0.45, voice: 'flute', octave: 1 }, bass: true },
  night: { root: 45, scale: AEOLIAN, chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], chordSecs: 9, pad: { type: 'triangle', cutoff: 900, gain: 0.05 }, melody: { density: 0.14, voice: 'pluck', octave: 2 }, bass: true },
  tension: { root: 40, scale: PHRYGIAN, chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 1, 3]], chordSecs: 8, pad: { type: 'sawtooth', cutoff: 650, gain: 0.035 }, melody: { density: 0.1, voice: 'pluck', octave: 2 }, bass: true },
  combat: { root: 38, scale: HARMONIC, chords: [[0, 2, 4], [5, 0, 2], [6, 1, 3], [4, 6, 1]], chordSecs: 1.875, pad: { type: 'sawtooth', cutoff: 1100, gain: 0.035 }, melody: { density: 0.3, voice: 'pluck', octave: 2 }, bass: true, drums: 128 },
  // Lower, darker and faster than an ordinary fight.
  boss: { root: 33, scale: PHRYGIAN, chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 1, 3], [5, 0, 2], [1, 3, 5]], chordSecs: 1.67, pad: { type: 'sawtooth', cutoff: 1500, gain: 0.045 }, melody: { density: 0.36, voice: 'pluck', octave: 2 }, bass: true, drums: 144 },
  sorrow: { root: 48, scale: AEOLIAN, chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], chordSecs: 10, pad: { type: 'triangle', cutoff: 1100, gain: 0.05 }, melody: { density: 0.22, voice: 'flute', octave: 1 }, bass: false },
  eerie: { root: 45, scale: WHOLE, chords: [[0, 2, 4], [1, 3, 5], [2, 4, 0]], chordSecs: 9, pad: { type: 'triangle', cutoff: 800, gain: 0.045 }, melody: { density: 0.12, voice: 'pluck', octave: 2 }, bass: true }
}

export class Composer {
  readonly gain: GainNode
  private timer: ReturnType<typeof setInterval>
  private nextChord: number
  private nextStep: number
  private nextBeat: number
  private chordIndex = 0
  private beat = 0
  private lastNote: number
  private stopped = false

  constructor(
    private ctx: AudioContext,
    out: AudioNode,
    mood: Mood,
    private spec: Spec = SPECS[mood]
  ) {
    this.gain = gainNode(ctx, 0)
    this.gain.connect(out)
    const t = ctx.currentTime + 0.1
    this.nextChord = t
    this.nextStep = t + spec.chordSecs / 8
    this.nextBeat = t
    this.lastNote = this.degree(0) + 12 * spec.melody.octave
    this.timer = setInterval(() => this.tick(), 100)
  }

  /** MIDI note of a scale degree (wrapping into higher octaves). */
  private degree(d: number) {
    const s = this.spec.scale
    return this.spec.root + s[((d % s.length) + s.length) % s.length] + 12 * Math.floor(d / s.length)
  }

  private tick() {
    if (this.stopped) return
    const ahead = this.ctx.currentTime + 0.35
    while (this.nextChord < ahead) {
      this.playChord(this.spec.chords[this.chordIndex % this.spec.chords.length], this.nextChord)
      this.chordIndex++
      this.nextChord += this.spec.chordSecs
    }
    while (this.nextStep < ahead) {
      if (Math.random() < this.spec.melody.density) this.playMelody(this.nextStep)
      this.nextStep += this.spec.chordSecs / 8
    }
    if (this.spec.drums) {
      const beatSecs = 60 / this.spec.drums / 2 // eighths
      while (this.nextBeat < ahead) {
        this.playBeat(this.beat, this.nextBeat)
        this.beat++
        this.nextBeat += beatSecs
      }
    }
  }

  private voice(freq: number, t: number, dur: number, o: { type: OscillatorType; gain: number; attack: number; release: number; cutoff: number; detune?: number }) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = o.type
    osc.frequency.value = freq
    if (o.detune) osc.detune.value = o.detune
    const f = filter(ctx, 'lowpass', o.cutoff, 0.5)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(o.gain, t + o.attack)
    g.gain.setValueAtTime(o.gain, t + Math.max(o.attack, dur - o.release))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(f).connect(g).connect(this.gain)
    osc.start(t)
    osc.stop(t + dur + 0.05)
    osc.onended = () => g.disconnect()
  }

  private playChord(degrees: number[], t: number) {
    const { pad, chordSecs, bass, drums } = this.spec
    const dur = chordSecs + 1.6 // overlap into the next chord
    for (const d of degrees) {
      const f = midiHz(this.degree(d) + 12)
      // Two slightly detuned voices make the pad breathe.
      this.voice(f, t, dur, { type: pad.type, gain: pad.gain, attack: Math.min(1.4, chordSecs / 2), release: 1.6, cutoff: pad.cutoff, detune: -6 })
      this.voice(f, t, dur, { type: pad.type, gain: pad.gain * 0.7, attack: Math.min(1.6, chordSecs / 2), release: 1.6, cutoff: pad.cutoff, detune: 7 })
    }
    if (bass && !drums) this.voice(midiHz(this.degree(degrees[0])), t, chordSecs + 0.8, { type: 'sine', gain: 0.09, attack: 0.4, release: 1, cutoff: 600 })
  }

  private playMelody(t: number) {
    const { melody, chordSecs } = this.spec
    // A small random walk through the scale, near where the tune last was.
    const scaleNotes: number[] = []
    for (let d = -3; d < 18; d++) scaleNotes.push(this.degree(d) + 12 * melody.octave)
    const near = scaleNotes.filter((n) => Math.abs(n - this.lastNote) <= 5 && n !== this.lastNote)
    const note = near[Math.floor(Math.random() * near.length)] ?? this.lastNote
    this.lastNote = note > this.spec.root + 12 * (melody.octave + 2) ? note - 12 : note
    const f = midiHz(this.lastNote)
    if (melody.voice === 'pluck') this.voice(f, t, rand(0.6, 1.2), { type: 'triangle', gain: 0.07, attack: 0.008, release: 0.55, cutoff: 2600 })
    else this.voice(f, t, rand(chordSecs / 4, chordSecs / 2), { type: 'sine', gain: 0.05, attack: 0.12, release: 0.5, cutoff: 3000 })
  }

  private playBeat(i: number, t: number) {
    const ctx = this.ctx
    const step = i % 8
    // Kick on 1 and 3, snare on 2 and 4, hats on the eighths, driving bass under it all.
    if (step === 0 || step === 4 || (step === 7 && Math.random() < 0.3)) {
      const osc = ctx.createOscillator()
      osc.frequency.setValueAtTime(130, t)
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.22)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.22, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
      osc.connect(g).connect(this.gain)
      osc.start(t)
      osc.stop(t + 0.32)
      osc.onended = () => g.disconnect()
    }
    const hit = (dur: number, freq: number, gain: number, type: BiquadFilterType) => {
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer(ctx, 'white')
      const f = filter(ctx, type, freq, 0.8)
      const g = ctx.createGain()
      g.gain.setValueAtTime(gain, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      src.connect(f).connect(g).connect(this.gain)
      src.start(t, Math.random() * 3)
      src.stop(t + dur + 0.02)
      src.onended = () => g.disconnect()
    }
    if (step === 2 || step === 6) hit(0.14, 1800, 0.09, 'bandpass')
    hit(0.03, 7000, step % 2 ? 0.02 : 0.035, 'highpass')
    const chord = this.spec.chords[(this.chordIndex - 1 + this.spec.chords.length) % this.spec.chords.length]
    const bassNote = this.degree(chord[0]) + (step % 4 === 3 ? 7 : 0)
    this.voice(midiHz(bassNote), t, 0.2, { type: 'sawtooth', gain: 0.05, attack: 0.005, release: 0.1, cutoff: 500 })
  }

  start(fade: number) {
    const t = this.ctx.currentTime
    this.gain.gain.cancelScheduledValues(t)
    this.gain.gain.setValueAtTime(this.gain.gain.value, t)
    this.gain.gain.linearRampToValueAtTime(1, t + fade)
  }

  stop(fade: number) {
    const t = this.ctx.currentTime
    this.gain.gain.cancelScheduledValues(t)
    this.gain.gain.setValueAtTime(this.gain.gain.value, t)
    this.gain.gain.linearRampToValueAtTime(0, t + fade)
    setTimeout(() => {
      this.stopped = true
      clearInterval(this.timer)
      this.gain.disconnect()
    }, (fade + 2.5) * 1000)
  }
}
