import { describe, expect, it } from 'vitest'
import { callingName, randomBuild, skillLevelsSpent, startingSkillBudget, validateBuild, type CharacterBuild } from './character'
import { fitBuild } from './hero'
import { DEFAULT_SETTINGS as S, initialState } from './state'
import { CALLING_LEVELS, RACE_BACKGROUNDS, RACE_IDS } from './tables'
import { narratorSystem } from '../../server/ai/narrator'
import { OPENING_TEXT, openingText, successorOpening } from '../../server/core/campaigns'

const open: CharacterBuild = {
  name: 'Varro Krell', race: 'human', sex: 'male', age: 'adult', background: 'none', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 10, AGI: 15, END: 12, INT: 9, ARC: 8, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}

describe('No Calling', () => {
  it('is open to every people, and gives the calling’s skill levels to spread instead', () => {
    for (const r of RACE_IDS) expect(RACE_BACKGROUNDS[r][0]).toBe('none')
    expect(startingSkillBudget(open)).toBe(startingSkillBudget({ ...open, background: 'farmhand' }) + CALLING_LEVELS)
    let seed = 7
    const dice = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const b = randomBuild(dice, 'realistic', 'Ilse', { background: 'none' })
    expect(b.background).toBe('none')
    expect(skillLevelsSpent(b)).toBe(startingSkillBudget(b))
    expect(validateBuild(b, 'realistic')).toEqual([])
  })

  it('is never what a roll picks', () => {
    for (let i = 0; i < 40; i++) expect(randomBuild(Math.random, 'realistic', 'Ilse').background).not.toBe('none')
  })

  it('starts with a little gear', () => {
    expect(initialState(open, S).character.inventory.map((i) => i.name)).toContain('Dagger')
  })

  it('tells the DM no trade, or the player’s own words', () => {
    expect(callingName(open)).toBe('')
    expect(callingName({ ...open, job: ' Hive ganger ' })).toBe('Hive ganger')
    expect(callingName({ ...open, background: 'farmhand' })).toBe('farmhand')
    const sys = narratorSystem(initialState(open, S), S, [])
    expect(sys).toMatch(/Varro Krell: human, male, \d+ years old \(adult\)\./)
    expect(sys).not.toContain('no calling')
    expect(narratorSystem(initialState({ ...open, job: 'Deserter' }, S), S, [])).toMatch(/\(adult\), Deserter\./)
  })

  it('is what the Quick Hero falls back on when no calling fits', () => {
    const b = fitBuild({ ...open, background: 'farmhand' }, { calling: 'none', attributes: { AGI: 16 }, skills: ['ranged', 'stealth'] }, 'realistic')
    expect(b.background).toBe('none')
    expect(skillLevelsSpent(b)).toBe(startingSkillBudget(b))
    expect(validateBuild(b, 'realistic')).toEqual([])
  })
})

describe('the opening', () => {
  it('keeps the calling to the past, not where the story starts', () => {
    expect(OPENING_TEXT).toMatch(/their past/)
    expect(openingText([{ role: 'companion', name: 'Mira' } as never])).toMatch(/Mira is there too|with Mira there too.*their past/)
    const fallen = { name: 'Old Varro', cause: 'a fall', race: 'human', background: 'none', day: 9, deeds: [] } as never
    expect(successorOpening(fallen, open, false)).toContain('the same lands: Varro Krell, human.')
    expect(successorOpening(fallen, { ...open, background: 'farmhand' }, false)).not.toContain('somewhere that fits who they are')
  })
})
