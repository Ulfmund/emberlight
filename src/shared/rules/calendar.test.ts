import { describe, expect, it } from 'vitest'
import { ageLabel, ageStage, ageYears, buildNow, dateLabel, DAYS_PER_YEAR, seasonGathering, seasonOf, startingAge, yearOf } from './calendar'
import type { CharacterBuild } from './character'
import { resolveWork } from './crafting'
import { rollWorldEvent } from './encounters'
import { applyEvent, DEFAULT_SETTINGS, derived, initialState, project, type GameState } from './state'
import { soundscape, type Scene } from '../scene'
import { TimelineLog } from '../timeline'
import { narratorSystem } from '../../server/ai/narrator'

const S = DEFAULT_SETTINGS
const build: CharacterBuild = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}
const days = (n: number) => ({ type: 'time' as const, minutes: n * 24 * 60 })
const onDay = (st: GameState, day: number): GameState => ({ ...st, time: { ...st.time, day } })
/** Dice that come up as scripted d20 faces. */
const dice = (...faces: number[]) => {
  let i = 0
  return () => (faces[i++ % faces.length] - 1) / 20 + 0.001
}

describe('the calendar', () => {
  it('turns the season every 90 days and the year every 360, beginning in spring', () => {
    expect([1, 90, 91, 180, 181, 270, 271, 360, 361].map(seasonOf)).toEqual(['spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter', 'winter', 'spring'])
    expect([1, 360, 361, 721].map(yearOf)).toEqual([1, 1, 2, 3])
    expect(dateLabel(300)).toBe('Winter, year 1')
    expect(dateLabel(400)).toBe('Spring, year 2')
  })
})

describe('growing older', () => {
  it('starts each people at an age that fits them', () => {
    expect(startingAge({ race: 'human', age: 'adult' })).toBe(27)
    expect(startingAge({ race: 'elf', age: 'adult' })).toBe(135)
    expect(startingAge({ race: 'dwarf', age: 'young' })).toBe(45)
    expect(ageLabel(initialState(build, S))).toBe('27, adult')
  })

  it('ages a year every 360 days, and their limits follow the stage of life they reach', () => {
    const st = initialState(build, S)
    const at34: GameState = { ...st, character: { ...st.character, ageAtStart: 34 } }
    expect(ageStage(at34)).toBe('adult')
    const was = derived(at34, S).attrCaps
    const later = applyEvent(at34, days(2 * DAYS_PER_YEAR), S)
    expect(ageYears(later)).toBe(36)
    expect(ageLabel(later)).toBe('36, middle-aged')
    const now = derived(later, S).attrCaps
    expect(now.STR).toBe(was.STR - 1)
    expect(now.INT).toBe(was.INT + 1)
    expect(buildNow(later).age).toBe('middle')
    // The character as made is kept: only the stage they've reached changes.
    expect(later.character.build.age).toBe('adult')
  })

  it('ages the long-lived slowly, and never makes anyone younger than they began', () => {
    const elf = initialState({ ...build, race: 'elf' }, S)
    const twenty = applyEvent(elf, days(20 * DAYS_PER_YEAR), S)
    expect(ageYears(twenty)).toBe(155)
    expect(ageStage(twenty)).toBe('adult')
    const st = initialState({ ...build, age: 'middle' }, S)
    expect(ageStage({ ...st, character: { ...st.character, ageAtStart: 30 } })).toBe('middle')
  })

  it("begins an heir's years when they take up the tale", () => {
    let st = applyEvent(initialState(build, S), { type: 'status', status: 'dead', reason: 'Bled out' }, S)
    st = applyEvent(st, {
      type: 'new_character',
      build: { ...build, name: 'Ada Rook', age: 'young' },
      days: 3650,
      fallen: { name: 'Brenna Rook', race: 'human', sex: 'female', background: 'hunter', level: 1, renown: 0, deeds: [], day: 1, cause: 'Bled out' },
      inherit: { coins: 0, renown: 0, items: [] }
    }, S)
    expect(ageYears(st)).toBe(18)
    expect(ageYears(applyEvent(st, days(DAYS_PER_YEAR), S))).toBe(19)
  })
})

describe('what the seasons do', () => {
  it('makes gathering harder in winter and easier in autumn, and says why', () => {
    expect(seasonGathering('fishing', 'winter')?.value).toBe(-2)
    expect(seasonGathering('mining', 'winter')).toBeNull()
    const forest = project(initialState(build, S), [{ type: 'place_kind', kind: 'forest' }], S)
    const winter = resolveWork(onDay(forest, 300), S, { kind: 'gather', what: 'healing herbs' }, dice(12))
    const autumn = resolveWork(onDay(forest, 200), S, { kind: 'gather', what: 'healing herbs' }, dice(12))
    expect(winter.results[0].breakdown).toContainEqual({ label: 'Winter: little grows under the snow', value: -4 })
    expect(autumn.results[0].total - winter.results[0].total).toBe(6)
    expect(winter.log.join(' ')).toMatch(/harder this time of year/)
  })

  it('snows in winter, and rains the rest of the year', () => {
    const resting = project(initialState(build, S), [{ type: 'place_kind', kind: 'wild' }], S)
    const ids = (day: number) => {
      const seen = new Set<string>()
      for (let p = 0.005; p < 1; p += 0.01) {
        let first = true
        const ev = rollWorldEvent(onDay(resting, day), S, { intent: 'rest', turnsSinceLast: 9 }, () => (first ? ((first = false), 0) : p))
        if (ev) seen.add(ev.id)
      }
      return seen
    }
    const winter = ids(300)
    expect(winter.has('snow')).toBe(true)
    expect(winter.has('rain')).toBe(false)
    const summer = ids(120)
    expect(summer.has('rain')).toBe(true)
    expect(summer.has('snow')).toBe(false)
  })

  it('quiets the birds and crickets in winter, and the wind picks up', () => {
    const scene = (s: Partial<Scene> = {}): Scene => ({ place: 'forest', night: false, weather: null, combat: false, dead: false, horror: false, ...s })
    const summer = soundscape(scene({ season: 'summer' }))
    const winter = soundscape(scene({ season: 'winter' }))
    expect(summer.beds.birds).toBeGreaterThan(0)
    expect(winter.beds.birds).toBeUndefined()
    expect(soundscape(scene({ season: 'winter', night: true })).beds.crickets).toBeUndefined()
    expect(winter.beds.wind ?? 0).toBeGreaterThan(summer.beds.wind ?? 0)
  })

  it('marks the turning seasons and a new stage of life on the timeline', () => {
    const log = new TimelineLog()
    let st: GameState = initialState(build, S)
    st = { ...st, character: { ...st.character, ageAtStart: 35 } }
    for (const ev of [days(95), days(90), days(90), days(90)]) {
      const before = st
      st = applyEvent(st, ev, S)
      log.see(ev, before, st)
    }
    expect(log.done().map((e) => e.text)).toEqual(['Summer came', 'Autumn came', 'Winter came', 'Spring came: year 2 began', 'Brenna Rook is middle-aged now, at 36'])
  })

  it('tells the storyteller the season, the year and how old the character is', () => {
    const st = applyEvent(initialState(build, S), days(299), S)
    const prompt = narratorSystem(st, S, [])
    expect(prompt).toContain('Day 300 (winter, year 1)')
    expect(prompt).toMatch(/Winter: short days and long cold nights/)
    expect(prompt).toContain('27 years old (adult)')
  })
})
