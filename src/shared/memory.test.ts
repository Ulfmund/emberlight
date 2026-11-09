import { describe, expect, it } from 'vitest'
import { entityLine, mentions, projectMemory, relevantEntities, sameName, storySoFar, type MemoryEvent, type Summary } from './memory'
import { scribeToEvents, type ScribeOutput } from '../server/ai/jobs/scribe'
import { DEFAULT_SETTINGS, initialState, type CharacterBuild } from './rules'

const person = (name: string, extra: Partial<Extract<MemoryEvent, { type: 'entity' }>> = {}): MemoryEvent => ({ type: 'entity', kind: 'person', name, day: 1, ...extra })

describe('names', () => {
  it('knows when two names mean the same person', () => {
    expect(sameName('Tam', 'Old Tam')).toBe(true)
    expect(sameName('Mira', 'Mira Ashdown')).toBe(true)
    expect(sameName('Brother Aldric', 'aldric')).toBe(true)
    expect(sameName("Tam's", 'Tam')).toBe(true)
    expect(sameName('Mira Ashdown', 'Mira Fen')).toBe(false)
    expect(sameName('The Butcher', 'The Baker')).toBe(false)
    expect(sameName('Old', 'Old Tam')).toBe(false)
    // Descriptions only match exactly.
    expect(sameName('the ferryman', "the ferryman's girl")).toBe(false)
    expect(sameName('the ferryman', 'The ferryman')).toBe(true)
    expect(sameName('Grey-bearded man', 'grey-bearded man')).toBe(true)
    expect(sameName('Grey-bearded man', 'man')).toBe(false)
  })

  it('spots mentions by name, alias or a telling word', () => {
    const [tam] = projectMemory([person('Old Tam Reed', { aliases: ['the ferryman'] })]).entities
    expect(mentions('I wave to Tam.', tam)).toBe(true)
    expect(mentions('The ferryman spits.', tam)).toBe(true)
    expect(mentions('Tamsin laughs.', tam)).toBe(false)
  })
})

describe('memory from events', () => {
  it('merges records of the same person and keeps the fuller name', () => {
    const m = projectMemory([
      person('Tam', { summary: 'a ferryman', facts: ['missing two fingers'], attitude: 'unfriendly' }),
      { type: 'time', minutes: 60 } as never,
      person('Old Tam', { facts: ['missing two fingers', 'owes the player a favour'], attitude: 'friendly', day: 3 })
    ])
    expect(m.entities).toHaveLength(1)
    const tam = m.entities[0]
    expect(tam).toMatchObject({ name: 'Old Tam', aliases: ['Tam'], summary: 'a ferryman', attitude: 'friendly', firstSeenDay: 1, lastSeenDay: 3, mentions: 2 })
    expect(tam.facts).toEqual(['missing two fingers', 'owes the player a favour'])
  })

  it('renames a described stranger once their name comes out, and stays renamed', () => {
    const m = projectMemory([
      person('Grey-bearded man', { aliases: ['man in a leather apron'], facts: ['sits in the corner'] }),
      person('Sibbert', { aliases: ['grey-bearded man'], facts: ['hired the player for 20 silver'] }),
      // Later the story calls him by the description again: still Sibbert.
      person('grey-bearded man', { facts: ['paid up front'] })
    ])
    expect(m.entities).toHaveLength(1)
    expect(m.entities[0].name).toBe('Sibbert')
    expect(m.entities[0].aliases).toEqual(['man in a leather apron', 'Grey-bearded man'])
    expect(m.entities[0].facts).toEqual(['sits in the corner', 'hired the player for 20 silver', 'paid up front'])
  })

  it("doesn't merge a village with its inn", () => {
    const place = (name: string): MemoryEvent => ({ type: 'entity', kind: 'place', name, day: 1 })
    const m = projectMemory([place("Hollin's Ford"), place("Hollin's Ford inn"), place("the Hollin's Ford")])
    expect(m.entities.map((e) => e.name)).toEqual(["Hollin's Ford", "Hollin's Ford inn"])
  })

  it('keeps people and places apart, and caps facts', () => {
    const facts = Array.from({ length: 20 }, (_, i) => `fact number ${i}`)
    const m = projectMemory([person('Millbrook', { facts }), { type: 'entity', kind: 'place', name: 'Millbrook', day: 1 }])
    expect(m.entities.map((e) => e.kind)).toEqual(['person', 'place'])
    expect(m.entities[0].facts).toHaveLength(12)
    expect(m.entities[0].facts[11]).toBe('fact number 19')
  })

  it('records death', () => {
    const m = projectMemory([person('Wenna'), person('Wenna', { status: 'dead', facts: ['killed by the river-thing'] })])
    expect(entityLine(m.entities[0], 2)).toBe('- Wenna (DEAD, last seen day 1): no description yet. Known: killed by the river-thing.')
  })

  it('picks the people worth mentioning', () => {
    const m = projectMemory([person('Old Tam'), person('Wenna'), person('Harl'), { type: 'entity', kind: 'place', name: 'Millbrook Crossing', day: 1 }])
    const names = (xs: { name: string }[]) => xs.map((x) => x.name)
    // Place first, then whoever is mentioned, then the most recently seen.
    expect(names(relevantEntities(m, 'Tam waves.', 'Millbrook Crossing', 3))).toEqual(['Millbrook Crossing', 'Old Tam', 'Harl'])
    expect(names(relevantEntities(m, '', null, 5, ['Harl']))).toEqual(['Wenna', 'Old Tam'])
  })
})

describe('Journal corrections', () => {
  it('lets the player rename, rewrite and forget, and the AI keeps finding the record', () => {
    const m = projectMemory([
      person('Wilth', { summary: 'innkeeper', facts: ['roof leaks', 'wrong fact'], attitude: 'neutral' }),
      { type: 'entity_edit', id: 'person:wilth', name: 'Wilith', summary: 'innkeeper of the Goose', facts: ['roof leaks'], attitude: 'friendly' },
      // The AI still uses the old spelling sometimes: it lands on the same record.
      person('Wilth', { facts: ['lent the player a lantern'] })
    ])
    expect(m.entities).toHaveLength(1)
    expect(m.entities[0]).toMatchObject({ name: 'Wilith', aliases: ['Wilth'], summary: 'innkeeper of the Goose', attitude: 'friendly', facts: ['roof leaks', 'lent the player a lantern'] })
    const gone = projectMemory([person('Wilth'), { type: 'entity_forget', id: 'person:wilth' }])
    expect(gone.entities).toHaveLength(0)
  })

  it('edits summaries and keeps pinned notes', () => {
    const scene: Summary = { level: 'scene', title: 'S', text: 'old.', from: 'a', to: 'b', fromDay: 1, toDay: 1 }
    const m = projectMemory([
      { type: 'summary', summary: scene },
      { type: 'summary_edit', level: 'scene', to: 'b', title: 'Better', text: 'new.' },
      { type: 'note', id: 'n1', text: 'Mira is secretly the baron’s daughter.' },
      { type: 'note', id: 'n2', text: 'temp' },
      { type: 'note', id: 'n1', text: 'Mira is secretly the baron’s niece.' },
      { type: 'note_remove', id: 'n2' }
    ])
    expect(m.scenes[0]).toMatchObject({ title: 'Better', text: 'new.' })
    expect(m.notes).toEqual([{ id: 'n1', text: 'Mira is secretly the baron’s niece.' }])
  })
})

describe('story so far', () => {
  const scene = (n: number): Summary => ({ level: 'scene', title: `S${n}`, text: `scene ${n}.`, from: `m${n * 10}`, to: `m${n * 10 + 9}`, fromDay: n, toDay: n })
  const events: MemoryEvent[] = [1, 2, 3].map((n) => ({ type: 'summary', summary: scene(n) }))

  it('lists summaries in order and leaves out what is still shown word for word', () => {
    const m = projectMemory(events)
    expect(storySoFar(m, 10_000, () => false)).toBe('Scene, day 1: S1. scene 1.\nScene, day 2: S2. scene 2.\nScene, day 3: S3. scene 3.')
    expect(storySoFar(m, 10_000, (s) => s.title === 'S3')).toBe('Scene, day 1: S1. scene 1.\nScene, day 2: S2. scene 2.')
    // Short on space: the newest win.
    expect(storySoFar(m, 60, () => false)).toBe('Scene, day 2: S2. scene 2.\nScene, day 3: S3. scene 3.')
  })

  it('replaces chaptered scenes with the chapter and the overall arc', () => {
    const chapter: Summary = { level: 'chapter', title: 'C1', text: 'chapter one.', from: 'm10', to: 'm29', fromDay: 1, toDay: 2 }
    const m = projectMemory([...events, { type: 'summary', summary: chapter }, { type: 'arc', text: 'It began at Millbrook.' }])
    expect(storySoFar(m, 10_000, () => false)).toBe('Overall: It began at Millbrook.\nChapter, days 1–2: C1. chapter one.\nScene, day 3: S3. scene 3.')
  })
})

describe('Scribe memory output', () => {
  const build: CharacterBuild = {
    name: 'Brenna Rook',
    race: 'human',
    sex: 'female',
    age: 'adult',
    background: 'hunter',
    humanBonus: ['AGI', 'WIT'],
    attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 },
    skills: {},
    appearance: '',
    personality: ''
  }
  const blank: ScribeOutput = {
    minutesPassed: 10,
    rest: 'none',
    location: '',
    deed: '',
    deedRenown: 0,
    itemsGained: [],
    itemsLost: [],
    coinsChange: 0,
    milestoneXp: 0,
    healing: 0,
    conditionsOn: [],
    conditionsOff: [],
    people: [],
    places: []
  }

  it('records people and places, but never the player character or nameless extras', () => {
    const state = initialState(build, DEFAULT_SETTINGS)
    const evs = scribeToEvents(
      {
        ...blank,
        location: 'The Wicker Goose',
        people: [
          { name: 'Old Tam', otherNames: ['the ferryman'], who: 'ferryman at Millbrook', newFacts: ['owes Brenna a favour'], status: 'alive', attitude: 'friendly' },
          { name: 'Brenna', otherNames: [], who: 'the hunter', newFacts: [], status: 'alive', attitude: 'unknown' },
          { name: 'the tall guard', otherNames: [], who: 'a guard', newFacts: [], status: 'alive', attitude: 'neutral' }
        ],
        places: [{ name: 'Millbrook Crossing', what: 'a ferry landing', newFacts: [] }]
      },
      state
    )
    const mem = evs.filter((e) => e.type === 'entity')
    expect(mem.map((e) => (e as { name: string }).name)).toEqual(['Old Tam', 'Millbrook Crossing', 'The Wicker Goose'])
    expect(mem[0]).toMatchObject({ kind: 'person', aliases: ['the ferryman'], attitude: 'friendly', status: 'alive', facts: ['owes Brenna a favour'] })
  })
})
