import { describe, expect, it } from 'vitest'
import { birthEvent, birthsDuring, childrenOf, childStage, familyBrief, marriageEvent, spouseOf, yearsOld, yearsToComeOfAge } from './family'
import { applyMemoryEvent, emptyMemory, type Memory, type MemoryEvent } from './memory'
import { DEFAULT_SETTINGS, initialState, project, type CharacterBuild, type GameState } from './rules'
import { TimelineLog } from './timeline'

const S = DEFAULT_SETTINGS
const build: CharacterBuild = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}
const remember = (...evs: MemoryEvent[]): Memory => {
  const m = emptyMemory()
  const counter = { n: 0 }
  for (const ev of evs) applyMemoryEvent(m, ev, counter)
  return m
}
const at = (day: number): GameState => ({ ...initialState(build, S), time: { day, minute: 8 * 60 } })

describe('marriage and children', () => {
  it('marries someone from the story, and tells the DM about the family', () => {
    const wenna: MemoryEvent = { type: 'entity', kind: 'person', name: 'Wenna', summary: 'the ferryman’s granddaughter', day: 1 }
    let m = remember(wenna, marriageEvent(at(40), 'Wenna'))
    expect(spouseOf(m)).toMatchObject({ name: 'Wenna', relation: 'spouse', attitude: 'devoted' })
    expect(spouseOf(m)!.facts).toContain('Married Brenna Rook on day 40')
    m = remember(wenna, marriageEvent(at(40), 'Wenna'), birthEvent(at(400), { name: 'Ada Rook', sex: 'female' }, 'Wenna'))
    const ada = childrenOf(m)[0]
    expect(ada).toMatchObject({ name: 'Ada Rook', relation: 'child', born: 400, summary: "Brenna Rook's daughter with Wenna" })
    expect(ada.ties).toEqual([{ how: 'daughter of', name: 'Wenna' }])
    expect(familyBrief(m, at(400 + 6 * 360))).toBe('Married to Wenna.\nChildren: Ada Rook (6, a child).')
    // Widowed.
    m = remember(wenna, marriageEvent(at(40), 'Wenna'), { type: 'entity', kind: 'person', name: 'Wenna', status: 'dead', day: 90 })
    expect(familyBrief(m, at(90))).toBe('Married to Wenna, who has died: the character is widowed.')
  })

  it('children grow up with the calendar, at their people’s pace', () => {
    expect(yearsOld({ born: 100 }, 100 + 3 * 360 + 10)).toBe(3)
    expect(yearsOld({}, 500)).toBeUndefined()
    expect(['a baby', 'a small child', 'a child', 'a youth', 'grown']).toEqual([1, 4, 10, 14, 16].map((y) => childStage(y, 'human')))
    expect(childStage(40, 'elf')).toBe('a child')
    expect(yearsToComeOfAge(10, 'human')).toBe(6)
    expect(yearsToComeOfAge(10, 'elf')).toBe(70)
    expect(yearsToComeOfAge(20, 'human')).toBe(0)
  })

  it('may bring children over years spent raising a family, while she is young enough', () => {
    const married = remember({ type: 'entity', kind: 'person', name: 'Wenna', day: 1 }, marriageEvent(at(1), 'Wenna'))
    const lucky = birthsDuring(at(1), married, 5 * 360, () => 0.1)
    expect(lucky).toHaveLength(5)
    expect(lucky.map((e) => (e as { born: number }).born)).toEqual([37, 397, 757, 1117, 1477])
    expect(lucky.every((e) => e.type === 'entity' && e.relation === 'child' && e.name.endsWith(' Rook'))).toBe(true)
    expect(birthsDuring(at(1), married, 5 * 360, () => 0.9)).toEqual([])
    // Nobody to raise them with: none.
    expect(birthsDuring(at(1), emptyMemory(), 5 * 360, () => 0.1)).toEqual([])
    // Past forty-five, no more.
    const older: GameState = { ...at(1), character: { ...at(1).character, ageAtStart: 44 } }
    expect(birthsDuring(older, married, 5 * 360, () => 0.1)).toHaveLength(1)
  })

  it('goes on the timeline: a wedding, and a birth on the day it happened', () => {
    const log = new TimelineLog()
    let st = at(40)
    for (const ev of [{ type: 'entity', kind: 'person', name: 'Wenna', day: 40 }, marriageEvent(st, 'Wenna'), birthEvent(at(400), { name: 'Ada Rook', sex: 'female' }, 'Wenna')] as MemoryEvent[]) {
      const before = st
      st = project(st, [ev], S)
      log.see(ev, before, st)
    }
    expect(log.done().map((e) => [e.day, e.text])).toEqual([
      [40, 'Wenna came into the story'],
      [40, 'Married Wenna'],
      [400, 'Ada Rook was born']
    ])
  })
})
