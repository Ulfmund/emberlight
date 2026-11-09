import { describe, expect, it } from 'vitest'
import { findPersona, PERSONAS } from './personas'
import { DEFAULT_SETTINGS, initialState, project, rollWorldEvent, type CharacterBuild, type EventKind } from './rules'

const build: CharacterBuild = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}
const onTheRoad = project(initialState(build, DEFAULT_SETTINGS), [{ type: 'place_kind', kind: 'road' }], DEFAULT_SETTINGS)

/** Which kinds of events a storyteller brings, over an even sweep of the dice (an event every time). */
function mix(persona: string): Partial<Record<EventKind, number>> {
  const out: Partial<Record<EventKind, number>> = {}
  for (let p = 0.0025; p < 1; p += 0.005) {
    let first = true
    const ev = rollWorldEvent(onTheRoad, { ...DEFAULT_SETTINGS, persona }, { turnsSinceLast: 9 }, () => (first ? ((first = false), 0) : p))
    if (ev) out[ev.kind] = (out[ev.kind] ?? 0) + 1
  }
  return out
}
/** How often anything happens at all, over an even sweep of the first die. */
function howOften(persona: string): number {
  let n = 0
  for (let p = 0.001; p < 0.3; p += 0.002) if (rollWorldEvent(onTheRoad, { ...DEFAULT_SETTINGS, persona }, { turnsSinceLast: 9 }, (() => { let first = true; return () => (first ? ((first = false), p) : 0.5) })())) n++
  return n
}

describe('the storytellers', () => {
  it('are all there, each with what they bring and a picture', () => {
    const ids = PERSONAS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ['chronicler', 'whalechan', 'veteran', 'romance', 'old_soul']) expect(ids).toContain(id)
    for (const p of PERSONAS) {
      expect(p.brings.length, p.id).toBeGreaterThan(10)
      expect(p.icon, p.id).toBeTruthy()
      if (p.id !== 'chronicler') expect(p.voice.length, p.id).toBeGreaterThan(100)
    }
    expect(findPersona('whalechan')?.voice).toMatch(/whale-fin maid/)
    expect(findPersona('veteran')?.voice).toMatch(/nobody gets left behind/)
    // Every storyteller with a voice has a habit, for the end of the DM's instructions.
    for (const p of PERSONAS) if (p.voice) expect(p.habit, p.id).toBeTruthy()
  })

  it('shape what happens, not just how it is told', () => {
    const even = mix('chronicler')
    const romance = mix('romance')
    const veteran = mix('veteran')
    expect(romance.wanderer ?? 0).toBeGreaterThan(even.wanderer ?? 0)
    expect(romance.encounter ?? 0).toBeLessThan(even.encounter ?? 0)
    expect(veteran.encounter ?? 0).toBeGreaterThan(even.encounter ?? 0)
    expect(mix('mystery').discovery ?? 0).toBeGreaterThan(even.discovery ?? 0)
    // How often: the Gambler brings more, Whalechan and the Hearthkeeper fewer.
    const base = howOften('chronicler')
    expect(howOften('gambler')).toBeGreaterThan(base)
    expect(howOften('whalechan')).toBeLessThan(base)
    expect(howOften('hearth')).toBeLessThan(base)
    // A character card tells the story in its own voice, with no leanings.
    expect(mix('card:abc')).toEqual(even)
    expect(howOften('card:abc')).toBe(base)
  })
})
