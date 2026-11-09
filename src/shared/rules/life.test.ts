import { describe, expect, it } from 'vitest'
import { atHome, livelihood, livingPerDay, ROAD_PER_DAY, wagePerDay, weeklyPay, type Job } from './life'
import { skillXpForLevel, type CharacterBuild } from './character'
import { skipEvents } from './skips'
import { rollWorldEvent } from './encounters'
import { applyEvent, DEFAULT_SETTINGS, derived, initialState, project, type GameState } from './state'
import { TimelineLog } from '../timeline'
import { SkipSchema } from '../../server/routes/game'

const S = DEFAULT_SETTINGS
const build: CharacterBuild = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}
const job: Job = { title: "smith's hand", place: 'Millbrook', skill: 'smithing', board: false, since: 1 }
const inMillbrook = (): GameState => project(initialState(build, S), [{ type: 'location', name: 'Millbrook' }, { type: 'place_kind', kind: 'village' }, { type: 'coins', delta: 5000 }], S)

describe('homes and work', () => {
  it('pays by the skill, and costs less to live at home than on the road', () => {
    expect([1, 13, 50].map((l) => wagePerDay(l, false))).toEqual([7, 19, 56])
    expect(wagePerDay(13, true)).toBe(10)
    const st = inMillbrook()
    expect(livingPerDay(st)).toBe(ROAD_PER_DAY)
    expect(livingPerDay({ ...st, home: { kind: 'room', place: 'Millbrook', since: 1 } })).toBe(6)
    expect(livingPerDay({ ...st, home: { kind: 'cottage', place: 'Millbrook', since: 1 } })).toBe(4)
    expect(livingPerDay({ ...st, job: { ...job, board: true } })).toBe(0)
    // A beginner just keeps a rented room; a week is six days' work.
    const week = livelihood({ ...st, job, home: { kind: 'room', place: 'Millbrook', since: 1 } }, 7)
    expect(week).toEqual({ workdays: 6, wages: 42, costs: 42, net: 0 })
    expect(livelihood({ ...st, job }, 1).workdays).toBe(1)
    expect(weeklyPay(st, job)).toBe(42)
  })

  it('brings in pay over a skip at work, at the skill they have midway, and never below an empty purse', () => {
    const st: GameState = { ...inMillbrook(), job, home: { kind: 'cottage', place: 'Millbrook', since: 1 } }
    const year = project(st, skipEvents(st, S, { days: 360, doing: '', practise: ['smithing'], working: true }), S)
    // Smithing 1 → 13 over the year (about 7 at midway): 309 days at 13 copper, less 360 days at 4.
    expect(year.character.coins - st.character.coins).toBe(309 * 13 - 360 * 4)
    // Not working: they get by, and the purse doesn't move.
    expect(project(st, skipEvents(st, S, { days: 360, doing: '', practise: [], working: false }), S).character.coins).toBe(st.character.coins)
    // On the road with no skill, the pay doesn't cover it: savings fall, but not below nothing.
    const poor: GameState = { ...st, home: null, character: { ...st.character, coins: 30 } }
    expect(project(poor, skipEvents(poor, S, { days: 90, doing: '', practise: [], working: true }), S).character.coins).toBe(0)
  })

  it('the app can ask for a skip at work (the route keeps every part of it)', () => {
    expect(SkipSchema.parse({ days: 7, doing: 'I work.', practise: ['smithing'], working: true })).toEqual({ days: 7, doing: 'I work.', practise: ['smithing'], working: true })
    expect(SkipSchema.parse({ days: 360 })).toEqual({ days: 360, doing: '', practise: [] })
    expect(() => SkipSchema.parse({ days: 99999 })).toThrow()
  })

  it('mends them fully in their own bed, with nothing to wake them', () => {
    let st: GameState = { ...inMillbrook(), home: { kind: 'cottage', place: 'Millbrook', since: 1 } }
    st = applyEvent(st, { type: 'damage', amount: 15, source: 'beast', reason: 'a wolf bite' }, S)
    const max = derived(st, S).maxHp
    expect(atHome(st)).toBe(true)
    expect(applyEvent(st, { type: 'rest', kind: 'long' }, S).character.hp).toBe(max)
    const away = applyEvent(st, { type: 'location', name: 'the North Road' }, S)
    expect(atHome(away)).toBe(false)
    expect(applyEvent(away, { type: 'rest', kind: 'long' }, S).character.hp).toBeLessThan(max)
    // Resting at home, no event comes, whatever the dice.
    for (let p = 0.001; p < 1; p += 0.05) expect(rollWorldEvent(st, { ...S, events: 'chaos' }, { intent: 'rest', turnsSinceLast: 9 }, () => p)).toBeNull()
    // A short skip heals like a night's sleep each day; a week or more mends everything.
    const hurt = applyEvent(away, { type: 'damage', amount: 15, source: 'beast', reason: 'a second bite' }, S)
    expect(applyEvent(hurt, { type: 'time_skip', days: 1 }, S).character.hp).toBe(Math.min(max, Math.max(hurt.character.hp, 0) + Math.ceil(max / 2)))
    expect(applyEvent(hurt, { type: 'time_skip', days: 7 }, S).character.hp).toBe(max)
  })

  it("a child keeps the family home; nobody keeps the dead's work", () => {
    let st: GameState = { ...inMillbrook(), home: { kind: 'house', place: 'Millbrook', since: 1 }, job }
    st = applyEvent(st, { type: 'status', status: 'dead', reason: 'Fever' }, S)
    const fallen = { name: 'Brenna Rook', race: 'human' as const, sex: 'female' as const, background: 'hunter' as const, level: 1, renown: 0, deeds: [], day: 1, cause: 'Fever' }
    const child = applyEvent(st, { type: 'new_character', build: { ...build, name: 'Ada Rook' }, days: 3650, fallen, inherit: { coins: 0, renown: 0, items: [] } }, S)
    expect(child.home?.kind).toBe('house')
    expect(child.job).toBeNull()
    const stranger = applyEvent(st, { type: 'new_character', build: { ...build, name: 'Corin Vale' }, days: 0, fallen }, S)
    expect(stranger.home).toBeNull()
  })

  it('goes on the timeline', () => {
    const log = new TimelineLog()
    let st = inMillbrook()
    for (const ev of [{ type: 'home', home: { kind: 'room', place: 'Millbrook', since: 1 } }, { type: 'job', job }, { type: 'home', home: { kind: 'cottage', place: 'Millbrook', since: 9 } }, { type: 'job', job: null }, { type: 'home', home: null }] as const) {
      const before = st
      st = applyEvent(st, ev, S)
      log.see(ev, before, st)
    }
    expect(log.done().map((e) => e.text)).toEqual(['Took a room in Millbrook', "Took work as smith's hand in Millbrook", 'Bought a cottage in Millbrook', "Left work as smith's hand", 'Sold the cottage in Millbrook'])
    expect(skillXpForLevel(13)).toBe(1728)
  })
})
