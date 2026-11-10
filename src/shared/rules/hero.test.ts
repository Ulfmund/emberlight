import { describe, expect, it } from 'vitest'
import { fitBuild, wishesFromCalling } from './hero'
import { pointsLeft, randomBuild, startingSkillLevel, validateBuild, type CharacterBuild } from './character'
import { ATTRS, RACE_BACKGROUNDS, SKILL_IDS } from './tables'

// (Another people, so no age in years carried over from the random one.)
const base = (p: Partial<CharacterBuild> = {}): CharacterBuild => ({ ...randomBuild(() => 0.5, 'realistic', 'Ilse'), years: undefined, age: 'adult', ...p })

describe('the Quick Hero', () => {
  it('turns a scholar into someone clever and not strong, within the rules', () => {
    const b = fitBuild(base({ race: 'human', sex: 'female' }), { calling: 'acolyte', attributes: { INT: 17, WIT: 14, STR: 8, AGI: 10, END: 9, ARC: 12, PRE: 11 }, skills: ['lore', 'medicine', 'persuasion'] }, 'realistic')
    expect(b.background).toBe('acolyte')
    expect(validateBuild(b, 'realistic')).toEqual([])
    expect(b.attributes.INT).toBeGreaterThan(b.attributes.STR)
    expect(b.attributes.STR).toBe(8)
    expect(b.humanBonus).toEqual(['INT', 'WIT'])
    expect(startingSkillLevel(b, 'lore')).toBeGreaterThan(1)
    // Every point spent: nothing wasted.
    expect(pointsLeft(b.attributes)).toBeLessThanOrEqual(1)
  })

  it('keeps to the callings of their own people, and to the limits, whatever the AI asks for', () => {
    let seed = 3
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 150; i++) {
      const b0 = randomBuild(rng, i % 2 ? 'realistic' : 'off', 'Test')
      const wishes = {
        calling: ['farmhand', 'moonsinger', 'raider', 'nonsense'][i % 4],
        attributes: Object.fromEntries(ATTRS.map((a) => [a, Math.round(rng() * 30) - 5])),
        skills: [...([...SKILL_IDS] as string[]).sort(() => rng() - 0.5).slice(0, 6), 'flying']
      }
      const b = fitBuild(b0, wishes, i % 2 ? 'realistic' : 'off')
      expect(RACE_BACKGROUNDS[b.race]).toContain(b.background)
      expect(validateBuild(b, i % 2 ? 'realistic' : 'off')).toEqual([])
    }
  })

  it('without the AI, leans on what the calling needs', () => {
    const w = wishesFromCalling('hunter')
    const b = fitBuild(base({ race: 'human' }), w, 'realistic')
    expect(b.background).toBe('hunter')
    expect(b.attributes.AGI).toBeGreaterThan(10)
    expect(validateBuild(b, 'realistic')).toEqual([])
  })
})
