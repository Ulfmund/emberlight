import { describe, expect, it } from 'vitest'
import { entityLine, projectMemory, relevantEntities, sameFaction, type MemoryEvent } from './memory'
import { factionBrief, factionFor, factionStanding, withReputation } from './factions'
import { checkBreakdown, DEFAULT_SETTINGS, initialState, type CharacterBuild, type CheckRequest } from './rules'

const group = (name: string, extra: Partial<Extract<MemoryEvent, { type: 'entity' }>> = {}): MemoryEvent => ({ type: 'entity', kind: 'faction', name, day: 1, ...extra })
const person = (name: string, extra: Partial<Extract<MemoryEvent, { type: 'entity' }>> = {}): MemoryEvent => ({ type: 'entity', kind: 'person', name, day: 1, ...extra })
const check = (p: Partial<CheckRequest> = {}): CheckRequest => ({
  skill: 'persuasion', difficulty: 'moderate', modifier: 0, advantage: 'none', reason: 'asking for the gate key', dramatic: false, withStrangers: true, risk: { severity: 'none', source: 'sentient' }, ...p
})

describe('factions', () => {
  it('go by shorter names too, but not by somebody else’s', () => {
    expect(sameFaction('the Watch', 'the Town Watch')).toBe(true)
    expect(sameFaction('Town Watch', 'the Town Watch')).toBe(true)
    expect(sameFaction('the Free Pennies', 'the Town Watch')).toBe(false)
    expect(sameFaction('the Order of the Ember', 'the Ember Order')).toBe(true)
  })

  it("remember what a group thinks of the character, kept between hated and honoured", () => {
    let m = projectMemory([group('the Town Watch', { summary: 'keepers of the peace' })])
    expect(m.entities[0]).toMatchObject({ kind: 'faction', name: 'the Town Watch', standing: 0, status: 'unknown' })
    m = projectMemory([group('the Town Watch'), group('the Watch', { standingChange: 2 }), group('Town Watch', { standingChange: 2 })])
    expect(m.entities).toHaveLength(1)
    expect(m.entities[0].standing).toBe(3)
    // The player can set it outright in the Journal.
    m = projectMemory([group('the Town Watch', { standingChange: 2 }), { type: 'entity_edit', id: 'faction:the town watch', standing: -1 }])
    expect(m.entities[0].standing).toBe(-1)
    expect(projectMemory([group('the Free Pennies', { standingChange: -2 }), group('the Free Pennies', { standingChange: -2 })]).entities[0].standing).toBe(-3)
  })

  it('know who belongs where, and bring a person’s group along when they come up', () => {
    const m = projectMemory([group('the Town Watch', { standingChange: 2, facts: ['caught the cutpurse for them (+2)'] }), person('Sergeant Pell', { summary: 'a gruff watchman', faction: 'the Town Watch' }), person('Old Tam')])
    const pell = m.entities.find((e) => e.name === 'Sergeant Pell')!
    expect(pell.faction).toBe('the Town Watch')
    expect(entityLine(pell, 2)).toContain('of the Town Watch')
    expect(entityLine(m.entities[0], 2)).toContain('faction; the player is trusted by them (+2)')
    expect(relevantEntities(m, 'Pell squints at you.', null, 5).map((e) => e.name)).toEqual(['Sergeant Pell', 'the Town Watch', 'Old Tam'])
    const edited = projectMemory([person('Sergeant Pell', { faction: 'the Town Watch' }), { type: 'entity_edit', id: 'person:sergeant pell', faction: null }])
    expect(edited.entities[0].faction).toBeUndefined()
  })

  it('put a standing on social checks with their people, and nowhere else', () => {
    const m = projectMemory([group('the Town Watch', { standingChange: 2 }), group('the Free Pennies', { standingChange: -2 }), person('Sergeant Pell', { faction: 'the Town Watch' })])
    expect(factionFor(m, check({ faction: 'the Watch' }))?.name).toBe('the Town Watch')
    expect(factionFor(m, check({ against: "Sergeant Pell's patience" }))?.name).toBe('the Town Watch')
    expect(factionFor(m, check({ reason: 'talking the Free Pennies out of a fight' }))?.name).toBe('the Free Pennies')
    // Not for climbing a wall, and not for a word that only looks like a name.
    expect(factionFor(m, check({ skill: 'athletics', faction: 'the Watch' }))).toBeUndefined()
    expect(factionFor(m, check({ reason: 'keeping watch through the night' }))).toBeUndefined()
    const [social, lock] = withReputation(m, [check({ faction: 'the Watch' }), check({ skill: 'athletics', faction: 'the Watch' })])
    expect(social.reputation).toEqual({ faction: 'the Town Watch', value: 2 })
    expect(lock.reputation).toBeUndefined()
    // A neutral group adds nothing, and an old standing is replaced, not kept.
    expect(withReputation(projectMemory([group('the Guild')]), [check({ faction: 'the Guild', reputation: { faction: 'x', value: 3 } })])[0].reputation).toBeUndefined()
  })

  it('show in the bonus, and are told to the Referee and the DM', () => {
    const build: CharacterBuild = {
      name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
      attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
    }
    const parts = checkBreakdown(initialState(build, DEFAULT_SETTINGS), DEFAULT_SETTINGS, check({ reputation: { faction: 'the Free Pennies', value: -2 } }))
    expect(parts).toContainEqual({ label: 'Standing with the Free Pennies', value: -2 })
    const m = projectMemory([group('the Town Watch', { standingChange: 2, facts: ['caught the cutpurse for them (+2)'] }), group('the Guild'), person('Sergeant Pell', { faction: 'the Town Watch' })])
    expect(factionBrief(m)).toBe('the Town Watch: trusted (+2); the Guild: neutral (0). People in them: Sergeant Pell (the Town Watch).')
    expect(factionStanding(m)).toBe('- the Town Watch: trusted (+2). Why: caught the cutpurse for them (+2).')
  })
})
