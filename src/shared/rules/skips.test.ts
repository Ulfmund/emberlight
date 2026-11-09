import { describe, expect, it } from 'vitest'
import { parseSkip, PRACTICE_XP_PER_DAY, skipEvents, skipText, spanLabel, spanSentence } from './skips'
import { ageYears, DAYS_PER_YEAR } from './calendar'
import { skillLevelFromXp, type CharacterBuild } from './character'
import { applyEvent, DEFAULT_SETTINGS, derived, initialState, project, type GameState } from './state'
import { TimelineLog } from '../timeline'

const S = DEFAULT_SETTINGS
const build: CharacterBuild = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}

describe('long time-skips', () => {
  it('reads a skip asked for out of character, and nothing else', () => {
    expect(parseSkip('((Five years pass. I settle in Millbrook and work at the forge.))')).toEqual({ days: 1800, doing: 'I settle in Millbrook and work at the forge.', practise: [] })
    expect(parseSkip('((skip ahead a year while I train with Old Tam))')).toMatchObject({ days: 360, doing: 'I train with Old Tam' })
    expect(parseSkip('((let a season go by. I work the forge.))')).toMatchObject({ days: 90, doing: 'I work the forge.' })
    expect(parseSkip('((time skip: 3 years))')).toMatchObject({ days: 1080, doing: '' })
    expect(parseSkip('((Two weeks later))')).toMatchObject({ days: 14 })
    expect(parseSkip('((fast forward a few months))')).toMatchObject({ days: 90 })
    expect(parseSkip('((a decade passes))')).toMatchObject({ days: 3600 })
    // At most twenty years at once.
    expect(parseSkip('((let 50 years pass))')?.days).toBe(20 * DAYS_PER_YEAR)
    for (const no of ['Five years pass.', "((let's skip the small talk))", '((a year ago I lost my brother))', '((make it rain))', '"Five years," she says.']) expect(parseSkip(no), no).toBeNull()
  })

  it('names the time the way people say it', () => {
    expect([7, 14, 30, 90, 180, 360, 1800, 3600, 40].map(spanLabel)).toEqual(['a week', 'two weeks', 'a month', 'a season', 'two seasons', 'a year', 'five years', 'ten years', '40 days'])
    expect(spanSentence(360)).toBe('A year passes.')
    expect(spanSentence(1800)).toBe('Five years pass.')
    expect(skipText({ days: 1800, doing: ' I work at the forge. ' })).toBe('((Five years pass. I work at the forge.))')
  })

  it('moves the calendar, mends the character, and trains what they practise', () => {
    let st: GameState = initialState(build, S)
    st = project(st, [{ type: 'damage', amount: 9, source: 'beast', reason: 'a wolf bite' }, { type: 'time', minutes: 30 * 60 }, { type: 'condition', id: 'exhausted', on: true }, { type: 'weather', weather: 'rain' }], S)
    const evs = skipEvents(st, S, { days: DAYS_PER_YEAR, doing: 'I work at the forge.', practise: ['smithing'] })
    expect(evs[0]).toEqual({ type: 'time_skip', days: 360, doing: 'I work at the forge.' })
    const after = project(st, evs, S)
    expect(after.time).toEqual({ day: st.time.day + 360, minute: 8 * 60 })
    expect(ageYears(after)).toBe(ageYears(st) + 1)
    // Healed to full (and a year's practice can bring a level, and more health with it).
    expect(after.character.hp).toBe(derived(after, S).maxHp)
    expect(after.character.level).toBeGreaterThan(st.character.level)
    expect(after.character.conditions).toEqual([])
    expect(after.character.hungerMins).toBe(0)
    expect(after.weather).toBeNull()
    // A year at the forge: from nothing to about 13 (humans learn a little faster).
    expect(skillLevelFromXp(after.character.skillXp.smithing ?? 0)).toBeGreaterThanOrEqual(13)
    // Two skills share the time.
    const two = project(st, skipEvents(st, S, { days: DAYS_PER_YEAR, doing: '', practise: ['smithing', 'hunting'] }), S)
    expect(two.character.skillXp.smithing).toBeLessThan(after.character.skillXp.smithing!)
    expect(two.character.skillXp.smithing).toBeGreaterThan(PRACTICE_XP_PER_DAY * 150)
    // Never past what they can ever learn.
    const ages = project(st, skipEvents(st, S, { days: 20 * DAYS_PER_YEAR, doing: '', practise: ['smithing'] }), S)
    expect(skillLevelFromXp(ages.character.skillXp.smithing ?? 0)).toBeLessThanOrEqual(50)
  })

  it("keeps a captive's chains, and does nothing for the dead", () => {
    const st = project(initialState(build, S), [{ type: 'condition', id: 'captured', on: true }], S)
    expect(applyEvent(st, { type: 'time_skip', days: 90 }, S).character.conditions).toEqual(['captured'])
    const dead = applyEvent(initialState(build, S), { type: 'status', status: 'dead', reason: 'Bled out' }, S)
    expect(applyEvent(dead, { type: 'time_skip', days: 90 }, S).time.day).toBe(dead.time.day)
  })

  it('goes on the timeline as the time that went by, with a new stage of life', () => {
    const log = new TimelineLog()
    let st: GameState = initialState(build, S)
    st = { ...st, character: { ...st.character, ageAtStart: 33 } }
    for (const ev of skipEvents(st, S, { days: 5 * DAYS_PER_YEAR, doing: '', practise: [] })) {
      const before = st
      st = applyEvent(st, ev, S)
      log.see(ev, before, st)
    }
    expect(log.done().map((e) => e.text)).toEqual(['Five years went by: spring, year 6', 'Brenna Rook is middle-aged now, at 38'])
  })
})
