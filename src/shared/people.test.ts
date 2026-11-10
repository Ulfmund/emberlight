import { describe, expect, it } from 'vitest'
import { bornAt, callingFor, personKind, personLine, personTags } from './people'
import { applyMemoryEvent, emptyMemory, entityLine, type Memory, type MemoryEvent } from './memory'
import { birthEvent, heirStart, HEIR_YEARS } from './family'
import {
  ageBands,
  ageRange,
  DEFAULT_SETTINGS,
  guessRole,
  initialState,
  randomBuild,
  rescaleAge,
  stageAt,
  startingAge,
  typicalAge,
  validateBuild,
  ageYears,
  type CharacterBuild
} from './rules'
import { scribeToEvents, type ScribeInput } from '../server/ai/jobs/scribe'
import { successorOpening } from '../server/core/campaigns'
import { recordPrompt } from '../server/routes/media'

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
const met = (extra: Partial<Extract<MemoryEvent, { type: 'entity' }>>, day = 10): MemoryEvent => ({ type: 'entity', kind: 'person', name: 'Hild', day, ...extra })

describe('age in years', () => {
  it('finds the stage of life from the years, at each people’s own pace', () => {
    expect([16, 20, 21, 35, 36, 55, 56, 90].map((y) => stageAt(y, 'human'))).toEqual(['young', 'young', 'adult', 'adult', 'middle', 'middle', 'elder', 'elder'])
    expect(stageAt(135, 'elf')).toBe('adult')
    expect(stageAt(100, 'elf')).toBe('young')
    expect(stageAt(68, 'dwarf')).toBe('adult')
    expect(typicalAge('adult', 'dwarf')).toBe(68)
  })

  it('offers an adventurer 16 to 90 (in human years), anyone from birth', () => {
    expect(ageRange('human', 'adventurer')).toEqual({ min: 16, max: 90 })
    expect(ageRange('elf', 'adventurer')).toEqual({ min: 80, max: 450 })
    expect(ageRange('human', 'anyone')).toEqual({ min: 0, max: 100 })
    expect(ageBands('human', 'adventurer')).toEqual([
      { age: 'young', from: 16, to: 20 },
      { age: 'adult', from: 21, to: 35 },
      { age: 'middle', from: 36, to: 55 },
      { age: 'elder', from: 56, to: 90 }
    ])
  })

  it('keeps the same point in life for another people, and starts the story at the age chosen', () => {
    expect(rescaleAge(27, 'human', 'dwarf')).toBe(68)
    expect(rescaleAge(68, 'dwarf', 'elf')).toBe(136)
    expect(startingAge({ ...build, years: 31 })).toBe(31)
    expect(startingAge(build)).toBe(27)
    expect(ageYears(initialState({ ...build, years: 31 }, DEFAULT_SETTINGS))).toBe(31)
  })

  it('checks the age against the stage, and rolls ages that fit', () => {
    expect(validateBuild({ ...build, years: 31 }, 'realistic')).toEqual([])
    expect(validateBuild({ ...build, years: 12 }, 'realistic')).toContain('An adventurer among the humans is between 16 and 90 years old.')
    expect(validateBuild({ ...build, years: 40 }, 'realistic')).toContain('At 40, humans are middle-aged, not adult.')
    let seed = 7
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 100; i++) {
      const b = randomBuild(rng, 'realistic', 'Test')
      expect(b.years).toBeDefined()
      expect(stageAt(b.years!, b.race)).toBe(b.age)
      expect(validateBuild(b, 'realistic')).toEqual([])
    }
  })
})

describe('people made like characters', () => {
  it('reads like the creator: race and sex, age, calling', () => {
    const hild = { race: 'dwarf' as const, sex: 'female' as const, born: bornAt(54, 10), calling: 'smith' }
    expect(personLine(hild, 10)).toBe('Dwarf woman · 54 · smith')
    expect(personTags(hild, 10)).toBe('dwarf woman, 54, smith')
    // A year on, she's a year older.
    expect(personLine(hild, 370)).toBe('Dwarf woman · 55 · smith')
    expect(personLine({ sex: 'male', born: bornAt(7, 1) }, 1)).toBe('Boy · 7')
    expect(personLine({ race: 'elf', sex: 'male', born: bornAt(40, 1) }, 1)).toBe('Elf boy · 40')
    expect(personLine({ race: 'human', sex: 'female', born: 5 }, 100)).toBe('Human girl · baby')
    expect(personLine({ calling: 'innkeeper' }, 1)).toBe('innkeeper')
    expect(personLine({}, 1)).toBe('')
  })

  it('is painted from their card', () => {
    expect(personKind({ race: 'dwarf', sex: 'female', born: bornAt(54, 10) }, 10)).toBe('a 54-year-old dwarf woman')
    expect(personKind({ race: 'human', sex: 'male', born: bornAt(18, 10) }, 10)).toBe('an 18-year-old human man')
    expect(personKind({ race: 'elf', sex: 'female' }, 10)).toBe('an elf woman')
    expect(personKind({ calling: 'smith' }, 10)).toBe('')
    const m = remember(met({ race: 'dwarf', sex: 'female', age: 54, calling: 'smith', appearance: 'Grey braids, a burn-scarred left hand', summary: 'Runs the forge at Millbrook' }))
    expect(recordPrompt('oil painting', m.entities[0], 10)).toBe('oil painting, portrait of a 54-year-old dwarf woman, smith, Grey braids, a burn-scarred left hand, Runs the forge at Millbrook')
  })

  it('fills in what the record lacks, and never overwrites it', () => {
    const m = remember(
      met({ race: 'dwarf', sex: 'female', age: 54, calling: 'smith', appearance: 'Grey braids', personality: 'Gruff, fair' }),
      // A later guess doesn't move her age or change who she is.
      met({ race: 'human', sex: 'male', age: 40, calling: 'farmer', appearance: 'Tall', personality: 'Kind' }, 40)
    )
    const hild = m.entities[0]
    expect(hild).toMatchObject({ race: 'dwarf', sex: 'female', born: 10 - 54 * 360, calling: 'smith', appearance: 'Grey braids', personality: 'Gruff, fair' })
    // A record without them takes them when the story shows them.
    const later = remember(met({}), met({ age: 30, calling: 'ferrywoman' }, 20))
    expect(later.entities[0]).toMatchObject({ born: 20 - 30 * 360, calling: 'ferrywoman' })
    expect(later.entities[0].race).toBeUndefined()
  })

  it('takes the Journal’s word, and clears what the player clears', () => {
    const m = remember(met({ race: 'dwarf', sex: 'female', age: 54, calling: 'smith', appearance: 'Grey braids' }))
    const id = m.entities[0].id
    applyMemoryEvent(m, { type: 'entity_edit', id, race: 'elf', born: bornAt(300, 10), calling: null, appearance: '', personality: 'Patient as stone' }, { n: 5 })
    expect(m.entities[0]).toMatchObject({ race: 'elf', sex: 'female', born: 10 - 300 * 360, personality: 'Patient as stone' })
    expect(m.entities[0].calling).toBeUndefined()
    expect(m.entities[0].appearance).toBeUndefined()
    applyMemoryEvent(m, { type: 'entity_edit', id, race: null, sex: null, born: null }, { n: 6 })
    expect(m.entities[0].race).toBeUndefined()
    expect(m.entities[0].sex).toBeUndefined()
    expect(m.entities[0].born).toBeUndefined()
  })

  it('tells the DM who they are, and with room, how they look and carry themselves', () => {
    const m = remember(met({ race: 'dwarf', sex: 'female', age: 54, calling: 'smith', appearance: 'Grey braids', personality: 'Gruff, fair', summary: 'Runs the forge', attitude: 'friendly' }))
    expect(entityLine(m.entities[0], 2, { day: 10, looks: true })).toBe(
      '- Hild (dwarf woman, 54, smith, friendly toward the player, last seen day 10): Runs the forge. Appearance: Grey braids. Personality: Gruff, fair.'
    )
    expect(entityLine(m.entities[0], 2, { day: 10 })).toBe('- Hild (dwarf woman, 54, smith, friendly toward the player, last seen day 10): Runs the forge.')
  })
})

describe('the Scribe’s cards', () => {
  const state = { ...initialState(build, DEFAULT_SETTINGS), time: { day: 10, minute: 600 } }
  const blank: ScribeInput = {
    minutesPassed: 10, rest: 'none', location: '', deed: '', deedRenown: 0, itemsGained: [], itemsLost: [], coinsChange: 0, milestoneXp: 0, healing: 0,
    conditionsOn: [], conditionsOff: [], records: [], placeKind: 'unknown', ate: 'none', itemsUsed: [], itemsEquipped: [], spellsLearned: [], weather: 'unchanged', companionsJoined: [], companionsLeft: []
  }
  const person = (extra: Record<string, unknown>) => scribeToEvents({ ...blank, records: [{ kind: 'person', name: 'Hild', what: 'the smith', ...extra }] as ScribeInput['records'] }, state).find((e) => e.type === 'entity')

  it('records someone new by the creator’s criteria', () => {
    expect(person({ race: 'dwarf', sex: 'female', age: 54, calling: 'Smith', appearance: '  Grey  braids ', personality: 'Gruff, fair' })).toMatchObject({
      race: 'dwarf', sex: 'female', age: 54, calling: 'Smith', appearance: 'Grey braids', personality: 'Gruff, fair'
    })
  })

  it('leaves out what it doesn’t know, and ages no people could reach', () => {
    const ev = person({ race: 'unknown', sex: 'unknown', age: 0 }) as Record<string, unknown>
    for (const k of ['race', 'sex', 'age', 'calling', 'appearance', 'personality']) expect(ev[k]).toBeUndefined()
    expect((person({ race: 'human', age: 300 }) as Record<string, unknown>).age).toBeUndefined()
    expect((person({ race: 'elf', age: 300 }) as Record<string, unknown>).age).toBe(300)
  })

  it('lets what a companion does decide how they fight', () => {
    expect(guessRole('Grove Healer')).toBe('healer')
    expect(guessRole('Lane Warden')).toBe('scout')
    expect(guessRole("Rune-Carver's Apprentice")).toBe('mage')
    expect(guessRole('Bone-Caller')).toBe('healer')
    const joined = scribeToEvents({ ...blank, companionsJoined: ['Hild'], records: [{ kind: 'person', name: 'Hild', what: 'a friend from the road', calling: 'hunter' }] as ScribeInput['records'] }, state)
    expect(joined.find((e) => e.type === 'party_join')).toMatchObject({ companion: { name: 'Hild', role: 'archer' } })
  })
})

describe('children and heirs', () => {
  const state = { ...initialState(build, DEFAULT_SETTINGS), time: { day: 400, minute: 600 } }

  it('gives a child their people and sex at birth', () => {
    expect(birthEvent(state, { name: 'Ada Rook', sex: 'female' }, 'Tam')).toMatchObject({ race: 'human', sex: 'female', born: 400 })
  })

  it('starts a child heir from their card, when they come of age', () => {
    // Born on day 400; their parent dies on day 400 + 6 years: ten years to wait.
    expect(heirStart({ born: 400 }, 400 + 6 * 360, 'human')).toEqual({ days: 10 * 360, age: 16 })
    // Grown already: they set out a few days on.
    expect(heirStart({ born: 400 - 20 * 360 }, 400, 'human')).toEqual({ days: 3, age: 20 })
    // Not known when they were born: years on, at an age the player chooses.
    expect(heirStart({}, 400, 'human')).toEqual({ days: HEIR_YEARS * 360 })
    // An elf of five isn't grown in twenty years: they set out then, as the youngest elf adventurer.
    expect(heirStart({ born: 400 - 5 * 360 }, 400, 'elf')).toEqual({ days: 20 * 360, age: 80 })
    expect(callingFor('Hunter', 'human')).toBe('hunter')
    expect(callingFor('grove healer', 'elf')).toBe('grovehealer')
    expect(callingFor('the village smith', 'human')).toBe('smith')
    expect(callingFor('grove healer', 'human')).toBeUndefined()
    expect(callingFor('innkeeper', 'human')).toBeUndefined()
  })

  it('says how long after the death the child sets out', () => {
    const fallen = { name: 'Brenna Rook', race: 'human' as const, sex: 'female' as const, background: 'hunter' as const, level: 3, renown: 4, deeds: [], day: 900, cause: 'a fall' }
    expect(successorOpening(fallen, { ...build, name: 'Ada Rook' }, true, 4 * 360)).toContain('4 years later, their child Ada Rook')
    expect(successorOpening(fallen, { ...build, name: 'Ada Rook' }, true, 3)).toContain('A few days later, their child Ada Rook')
    expect(successorOpening(fallen, { ...build, name: 'Ada Rook' }, true)).toContain('10 years later')
  })
})
