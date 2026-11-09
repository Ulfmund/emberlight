import type { Bed } from '@shared/scene'
import { every, filter, gainNode, loopNoise, noiseBuffer, rand } from './context'

/**
 * Ambient beds (docs/spec/09-audio.md#layers), made on the spot: wind, rain, storms, fire,
 * crickets, birds, owls, rivers, the sea, cave drips, a tavern, a town. Each runs on its own and
 * starts silent; the mixer sets how loud.
 */
export type Running = { gain: GainNode; stop: () => void }

type Make = (ctx: AudioContext, out: GainNode, stops: (() => void)[]) => void

/** A one-shot tone with a quick rise and an exponential fall. */
function blip(ctx: AudioContext, out: AudioNode, o: { freq: number; to?: number; at?: number; dur: number; gain: number; type?: OscillatorType; pan?: number }) {
  const t = ctx.currentTime + (o.at ?? 0)
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, t)
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.gain, t + Math.min(0.02, o.dur / 4))
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  let tail: AudioNode = g
  if (o.pan !== undefined && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner()
    p.pan.value = o.pan
    g.connect(p)
    tail = p
  }
  osc.connect(g)
  tail.connect(out)
  osc.start(t)
  osc.stop(t + o.dur + 0.05)
  osc.onended = () => tail.disconnect()
}

/** A short burst of filtered noise (a crackle, a drop, a crack of thunder). */
function burst(ctx: AudioContext, out: AudioNode, o: { dur: number; gain: number; type: BiquadFilterType; freq: number; q?: number; color?: 'white' | 'pink' | 'brown'; attack?: number; at?: number }) {
  const t = ctx.currentTime + (o.at ?? 0)
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, o.color ?? 'white')
  const f = filter(ctx, o.type, o.freq, o.q ?? 0.7)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.004))
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  src.connect(f).connect(g).connect(out)
  src.start(t, Math.random() * 3)
  src.stop(t + o.dur + 0.05)
  src.onended = () => g.disconnect()
}

/** Continuous noise through a filter, kept in the bed until it stops. */
function steady(ctx: AudioContext, out: AudioNode, stops: (() => void)[], color: 'white' | 'pink' | 'brown', type: BiquadFilterType, freq: number, level: number, q = 0.7) {
  const src = loopNoise(ctx, color)
  const f = filter(ctx, type, freq, q)
  const g = gainNode(ctx, level)
  src.connect(f).connect(g).connect(out)
  stops.push(() => {
    try {
      src.stop()
    } catch {
      /* already stopped */
    }
    g.disconnect()
  })
  return { f, g }
}

const MAKERS: Record<Bed, Make> = {
  wind: (ctx, out, stops) => {
    const { f, g } = steady(ctx, out, stops, 'pink', 'bandpass', 420, 0.6, 0.6)
    stops.push(
      every(2500, 6500, () => {
        const t = ctx.currentTime
        f.frequency.setTargetAtTime(rand(230, 950), t, rand(1.2, 3))
        g.gain.setTargetAtTime(rand(0.3, 0.95), t, rand(1, 2.5))
      })
    )
  },
  rain: (ctx, out, stops) => {
    steady(ctx, out, stops, 'white', 'highpass', 1100, 0.35)
    const { g } = steady(ctx, out, stops, 'white', 'bandpass', 3600, 0.25, 0.9)
    stops.push(every(40, 110, () => g.gain.setTargetAtTime(rand(0.08, 0.45), ctx.currentTime, 0.01)))
    stops.push(every(15, 60, () => burst(ctx, out, { dur: rand(0.01, 0.03), gain: rand(0.03, 0.12), type: 'bandpass', freq: rand(2500, 6000), q: 2 })))
  },
  storm: (ctx, out, stops) => {
    steady(ctx, out, stops, 'white', 'highpass', 900, 0.5)
    steady(ctx, out, stops, 'pink', 'lowpass', 500, 0.35)
    stops.push(every(30, 80, () => burst(ctx, out, { dur: rand(0.01, 0.03), gain: rand(0.05, 0.16), type: 'bandpass', freq: rand(2000, 5000), q: 2 })))
    stops.push(
      every(12000, 32000, () => {
        // A crack, sometimes, then the long rumble.
        if (Math.random() < 0.4) burst(ctx, out, { dur: 0.25, gain: 0.35, type: 'highpass', freq: 1500 })
        burst(ctx, out, { dur: rand(3, 5), gain: rand(0.5, 0.9), type: 'lowpass', freq: rand(90, 160), color: 'brown', attack: 0.12, at: rand(0, 0.3) })
      })
    )
  },
  fire: (ctx, out, stops) => {
    steady(ctx, out, stops, 'brown', 'lowpass', 320, 0.4)
    stops.push(every(30, 320, () => burst(ctx, out, { dur: rand(0.006, 0.03), gain: rand(0.05, 0.4), type: 'highpass', freq: rand(1500, 3500) })))
    stops.push(every(1500, 5000, () => burst(ctx, out, { dur: rand(0.15, 0.4), gain: 0.08, type: 'bandpass', freq: 800, q: 0.8, color: 'pink', attack: 0.05 })))
  },
  crickets: (ctx, out, stops) => {
    const voices = [rand(4200, 4500), rand(4600, 4900), rand(5000, 5300)]
    stops.push(
      every(350, 1500, () => {
        const f = voices[Math.floor(Math.random() * voices.length)]
        const pan = rand(-0.7, 0.7)
        const pulses = 2 + Math.floor(Math.random() * 3)
        for (let i = 0; i < pulses; i++) blip(ctx, out, { freq: f, at: i * 0.045, dur: 0.025, gain: rand(0.04, 0.08), pan })
      })
    )
  },
  birds: (ctx, out, stops) => {
    stops.push(
      every(900, 4500, () => {
        const notes = 1 + Math.floor(Math.random() * 4)
        const base = rand(2200, 3800)
        const pan = rand(-0.8, 0.8)
        let at = 0
        for (let i = 0; i < notes; i++) {
          const dur = rand(0.06, 0.15)
          blip(ctx, out, { freq: base * rand(0.85, 1.2), to: base * rand(0.7, 1.4), at, dur, gain: rand(0.05, 0.1), pan })
          at += dur + rand(0.04, 0.14)
        }
      })
    )
  },
  owl: (ctx, out, stops) => {
    stops.push(
      every(11000, 28000, () => {
        const f = rand(330, 400)
        const pan = rand(-0.6, 0.6)
        blip(ctx, out, { freq: f, to: f * 0.93, dur: 0.38, gain: 0.08, pan })
        blip(ctx, out, { freq: f * 1.02, to: f * 0.95, at: 0.55, dur: 0.22, gain: 0.06, pan })
        blip(ctx, out, { freq: f, to: f * 0.9, at: 0.85, dur: 0.45, gain: 0.07, pan })
      })
    )
  },
  river: (ctx, out, stops) => {
    steady(ctx, out, stops, 'brown', 'lowpass', 420, 0.45)
    const { f } = steady(ctx, out, stops, 'pink', 'bandpass', 800, 0.35, 0.9)
    stops.push(every(700, 1800, () => f.frequency.setTargetAtTime(rand(450, 1500), ctx.currentTime, 0.5)))
    stops.push(every(2500, 7000, () => burst(ctx, out, { dur: rand(0.1, 0.25), gain: 0.05, type: 'bandpass', freq: rand(1200, 2500), q: 1.5, color: 'pink', attack: 0.03 })))
  },
  sea: (ctx, out, stops) => {
    const { g } = steady(ctx, out, stops, 'brown', 'lowpass', 650, 0.3)
    const foam = steady(ctx, out, stops, 'pink', 'highpass', 1800, 0.05)
    const wave = () => {
      const t = ctx.currentTime
      const peak = rand(0.7, 1)
      g.gain.setTargetAtTime(peak, t, 1.2)
      g.gain.setTargetAtTime(0.25, t + 3.2, 1.8)
      foam.g.gain.setTargetAtTime(peak * 0.18, t + 1.5, 0.8)
      foam.g.gain.setTargetAtTime(0.04, t + 3.5, 1.5)
    }
    wave()
    stops.push(every(7500, 11500, wave))
  },
  drips: (ctx, out, stops) => {
    steady(ctx, out, stops, 'brown', 'lowpass', 150, 0.12)
    // A hollow echo for the drops.
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.21
    const fb = gainNode(ctx, 0.35)
    const send = gainNode(ctx, 1)
    send.connect(out)
    send.connect(delay)
    delay.connect(fb).connect(delay)
    delay.connect(out)
    stops.push(() => {
      send.disconnect()
      delay.disconnect()
    })
    stops.push(every(1200, 5000, () => blip(ctx, send, { freq: rand(1100, 2300), to: rand(800, 1100), dur: rand(0.15, 0.3), gain: rand(0.05, 0.1) })))
  },
  tavern: (ctx, out, stops) => {
    for (const f of [320, 650, 1100]) {
      const { g } = steady(ctx, out, stops, 'pink', 'bandpass', f, 0.12, 2)
      stops.push(every(120, 420, () => g.gain.setTargetAtTime(rand(0.03, 0.2), ctx.currentTime, 0.06)))
    }
    stops.push(every(1500, 6000, () => blip(ctx, out, { freq: rand(2600, 3800), dur: rand(0.08, 0.16), gain: rand(0.02, 0.05), pan: rand(-0.6, 0.6) })))
  },
  town: (ctx, out, stops) => {
    for (const f of [400, 900]) {
      const { g } = steady(ctx, out, stops, 'pink', 'bandpass', f, 0.07, 1.5)
      stops.push(every(200, 600, () => g.gain.setTargetAtTime(rand(0.02, 0.1), ctx.currentTime, 0.1)))
    }
    // A bell, now and then.
    stops.push(
      every(45000, 110000, () => {
        for (const [m, gain] of [
          [1, 0.04],
          [2.01, 0.02],
          [2.98, 0.012]
        ] as const)
          blip(ctx, out, { freq: 196 * m, dur: 3.2, gain, pan: rand(-0.3, 0.3) })
      })
    )
  }
}

export function startBed(ctx: AudioContext, out: AudioNode, bed: Bed): Running {
  const gain = gainNode(ctx, 0)
  gain.connect(out)
  const stops: (() => void)[] = []
  MAKERS[bed](ctx, gain, stops)
  return {
    gain,
    stop: () => {
      for (const s of stops) s()
      gain.disconnect()
    }
  }
}
