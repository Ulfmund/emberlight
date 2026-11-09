import { describe, expect, it } from 'vitest'
import { journeyOf, mapLayout as layout } from './journey'
import { applyEvent, DEFAULT_SETTINGS, initialState, type CharacterBuild, type GameEvent } from './rules'

const build: CharacterBuild = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}
const step = (st: ReturnType<typeof initialState>, ev: GameEvent) => applyEvent(st, ev, DEFAULT_SETTINGS)
const go = (name: string, kind?: GameEvent & { type: 'place_kind' }): GameEvent[] => [{ type: 'location', name }, ...(kind ? [kind] : [])]

describe('the journey', () => {
  it('records where the character has been, in order, and the ways between', () => {
    const events: GameEvent[] = [
      ...go('Millbrook Crossing', { type: 'place_kind', kind: 'water' }),
      { type: 'time', minutes: 60 },
      ...go('The Wicker Goose', { type: 'place_kind', kind: 'indoors' }),
      { type: 'time', minutes: 24 * 60 },
      ...go('the Wicker Goose'),
      ...go('Hollin’s Ford', { type: 'place_kind', kind: 'road' }),
      ...go('Millbrook Crossing', { type: 'place_kind', kind: 'water' }),
      ...go('The Wicker Goose', { type: 'place_kind', kind: 'indoors' })
    ]
    const { state, journey } = journeyOf(initialState(build, DEFAULT_SETTINGS), events, step)
    expect(state.location).toBe('The Wicker Goose')
    expect(journey.stops).toEqual([
      { name: 'Millbrook Crossing', kind: 'water', visits: 2, firstDay: 1, lastDay: 2 },
      { name: 'The Wicker Goose', kind: 'indoors', visits: 2, firstDay: 1, lastDay: 2 },
      { name: 'Hollin’s Ford', kind: 'road', visits: 1, firstDay: 2, lastDay: 2 }
    ])
    // Staying put isn't a journey; going back and forth counts each time.
    expect(journey.legs).toEqual([
      { from: 0, to: 1, times: 2 },
      { from: 1, to: 2, times: 1 },
      { from: 0, to: 2, times: 1 }
    ])
    expect(journey.here).toBe(1)
  })

  it('starts empty, and is drawn the same way every time, with room between places', () => {
    expect(journeyOf(initialState(build, DEFAULT_SETTINGS), [], step).journey).toEqual({ stops: [], legs: [], here: null })
    const names = ['Millbrook', 'The Wicker Goose', 'Hollin’s Ford', 'Greywater', 'The Barrow', 'Ashfall Pass', 'Saltmarsh']
    const events = names.flatMap((n) => go(n))
    const { journey } = journeyOf(initialState(build, DEFAULT_SETTINGS), events, step)
    const a = layout(journey)
    expect(layout(journey)).toEqual(a)
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(40)
      expect(p.x).toBeLessThanOrEqual(560)
      expect(p.y).toBeGreaterThanOrEqual(30)
      expect(p.y).toBeLessThanOrEqual(370)
    }
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) expect(Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y)).toBeGreaterThan(40)
    expect(layout({ stops: [journey.stops[0]], legs: [], here: 0 })).toEqual([{ x: 300, y: 192 }])
  })
})
