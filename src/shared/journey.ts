import type { GameEvent, GameState, PlaceKind } from './rules'
import { samePlace } from './memory'

/**
 * The journey so far (docs/spec/08-ui-ux.md#map): every place the character has been, in the
 * order they first got there, and the ways between them. Built from the branch being played,
 * like everything else, so a rewind takes the map back too.
 */

export type Stop = { name: string; kind: PlaceKind | null; visits: number; firstDay: number; lastDay: number }
export type Leg = { from: number; to: number; times: number }
export type Journey = { stops: Stop[]; legs: Leg[]; here: number | null }

export const emptyJourney = (): Journey => ({ stops: [], legs: [], here: null })

/** Fed every event in order (with the state after it); `done()` gives the map. */
export class JourneyLog {
  private stops: Stop[] = []
  private legs = new Map<string, Leg>()
  private here: number | null = null

  see(ev: GameEvent, st: GameState) {
    if (ev.type === 'location') {
      const name = ev.name.trim()
      if (!name) return
      let i = this.stops.findIndex((s) => samePlace(s.name, name))
      if (i < 0) {
        this.stops.push({ name, kind: st.placeKind, visits: 0, firstDay: st.time.day, lastDay: st.time.day })
        i = this.stops.length - 1
      }
      const stop = this.stops[i]
      if (this.here !== i) {
        stop.visits++
        if (this.here !== null) {
          const [a, b] = this.here < i ? [this.here, i] : [i, this.here]
          const leg = this.legs.get(`${a}-${b}`) ?? { from: a, to: b, times: 0 }
          leg.times++
          this.legs.set(`${a}-${b}`, leg)
        }
      }
      stop.lastDay = st.time.day
      this.here = i
    } else if (ev.type === 'place_kind' && this.here !== null) {
      // The Scribe says what sort of place it is just after it says where.
      this.stops[this.here].kind = ev.kind
    } else if (ev.type === 'time' && this.here !== null) {
      this.stops[this.here].lastDay = st.time.day
    }
  }

  done(): Journey {
    return { stops: this.stops, legs: [...this.legs.values()], here: this.here }
  }
}

export function journeyOf(start: GameState, events: GameEvent[], step: (st: GameState, ev: GameEvent) => GameState): { state: GameState; journey: Journey } {
  const log = new JourneyLog()
  let state = start
  for (const ev of events) {
    state = step(state, ev)
    log.see(ev, state)
  }
  return { state, journey: log.done() }
}

// ---- drawing it ------------------------------------------------------------------------------

export const MAP_W = 600
export const MAP_H = 400
const W = MAP_W
const H = MAP_H

/** A steady number from a name, so the same journey always draws the same way. */
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

/**
 * Places laid out along the way they were reached, then eased apart: the ways between them pull
 * like strings, every place pushes the others off, and the whole is fitted to the page.
 */
export function mapLayout(j: Journey): { x: number; y: number }[] {
  const n = j.stops.length
  if (!n) return []
  const p = j.stops.map((s, i) => {
    const a = i * 1.1 + hash(s.name) * 2
    return { x: W / 2 + Math.cos(a) * (40 + i * 18), y: H / 2 + Math.sin(a) * (30 + i * 12), vx: 0, vy: 0 }
  })
  const rest = Math.max(70, Math.min(140, 520 / Math.sqrt(n)))
  for (let it = 0; it < 320; it++) {
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        const dx = p[b].x - p[a].x || 0.01
        const dy = p[b].y - p[a].y || 0.01
        const d2 = Math.max(dx * dx + dy * dy, 25)
        const f = (rest * rest) / d2 / 6
        const d = Math.sqrt(d2)
        p[a].vx -= (dx / d) * f
        p[a].vy -= (dy / d) * f
        p[b].vx += (dx / d) * f
        p[b].vy += (dy / d) * f
      }
    for (const l of j.legs) {
      const a = p[l.from]
      const b = p[l.to]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const f = (d - rest) * 0.06
      a.vx += (dx / d) * f
      a.vy += (dy / d) * f
      b.vx -= (dx / d) * f
      b.vy -= (dy / d) * f
    }
    for (const q of p) {
      q.vx += (W / 2 - q.x) * 0.004
      q.vy += (H / 2 - q.y) * 0.006
      q.x += q.vx * 0.5
      q.y += q.vy * 0.5
      q.vx *= 0.6
      q.vy *= 0.6
    }
  }
  // Fit to the page, leaving room for the names.
  const xs = p.map((q) => q.x)
  const ys = p.map((q) => q.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const sx = x1 - x0 > 1 ? (W - 120) / (x1 - x0) : 1
  const sy = y1 - y0 > 1 ? (H - 110) / (y1 - y0) : 1
  const s = Math.min(sx, sy, 2.2)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  return p.map((q) => ({ x: W / 2 + (q.x - cx) * s, y: H / 2 - 8 + (q.y - cy) * s }))
}
