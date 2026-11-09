import { describe, expect, it } from 'vitest'
import { TimelineLog } from './timeline'
import { applyEvent, DEFAULT_SETTINGS, initialState, type CharacterBuild, type Foe, type GameEvent } from './rules'

const build: CharacterBuild = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}
const foe = (id: string, name: string): Foe => ({
  id, name, template: 'bandit', family: 'humanoid', tier: 'standard', level: 1, hp: 10, maxHp: 10, defense: 12, attack: 3, damage: [1, 6, 1], initiative: 1, status: 'fighting', behavior: 'cautious', verb: 'slashes at', xp: 12, loot: []
})

function play(events: GameEvent[]) {
  const log = new TimelineLog()
  let st = initialState(build, DEFAULT_SETTINGS)
  for (const ev of events) {
    const before = st
    st = applyEvent(st, ev, DEFAULT_SETTINGS)
    log.see(ev, before, st)
  }
  return { entries: log.done(), memory: log.memory }
}

describe('the timeline', () => {
  it("records the story's milestones, day by day, and nothing else", () => {
    const { entries, memory } = play([
      { type: 'location', name: 'Millbrook Crossing' },
      { type: 'entity', kind: 'person', name: 'Old Tam', summary: 'the ferryman at Millbrook.', day: 1 },
      { type: 'entity', kind: 'person', name: 'Old Tam', facts: ['missing two fingers'], day: 1 },
      { type: 'entity', kind: 'quest', name: 'Find the missing ferry', giver: 'Old Tam', day: 1 },
      { type: 'time', minutes: 60 },
      { type: 'location', name: 'The Wicker Goose' },
      { type: 'location', name: 'Millbrook Crossing' },
      { type: 'combat_start', combat: { id: 'c', round: 1, foes: [foe('f1', 'Bandit 1'), foe('f2', 'Bandit 2')], playerInitiative: 10, surprise: null, dodging: false } },
      { type: 'combat_end', outcome: 'victory' },
      { type: 'xp', amount: 500, reason: 'Defeated the bandits' },
      { type: 'renown', amount: 1, deed: 'drove the bandits from the ferry' },
      { type: 'time', minutes: 24 * 60 },
      { type: 'entity', kind: 'quest', name: 'the missing ferry', status: 'done', day: 2 },
      { type: 'entity', kind: 'item', name: 'the ferry key', holder: 'you', day: 2 },
      { type: 'entity', kind: 'item', name: 'the miller’s ledger', holder: 'the miller', day: 2 },
      { type: 'entity', kind: 'faction', name: 'the Town Watch', standingChange: 1, facts: ['handed over a thief (+1)'], day: 2 },
      // Already as high as it goes after this: the next two deeds can't move it, so they aren't milestones.
      { type: 'entity', kind: 'faction', name: 'the Watch', standingChange: 2, facts: ['saved the sergeant (+2)'], day: 2 },
      { type: 'entity', kind: 'faction', name: 'the Watch', standingChange: 2, facts: ['saved him again (+2)'], day: 2 },
      { type: 'party_join', companion: { id: 'ally_wenna', name: 'Wenna', role: 'scout' } },
      { type: 'learn_spell', id: 'spark' },
      { type: 'weather', weather: 'rain' },
      { type: 'entity_edit', id: 'person:old tam', summary: 'the old ferryman' },
      { type: 'entity', kind: 'person', name: 'Old Tam', status: 'dead', day: 2 }
    ])
    expect(entries.map((e) => [e.day, e.text, e.tone])).toEqual([
      [1, 'Came to Millbrook Crossing', 'neutral'],
      [1, 'Old Tam, the ferryman at Millbrook, came into the story', 'neutral'],
      [1, 'Took on: Find the missing ferry (for Old Tam)', 'neutral'],
      [1, 'Came to The Wicker Goose', 'neutral'],
      [1, 'Won a fight against Bandit 1 and Bandit 2', 'good'],
      [1, expect.stringMatching(/^Reached level \d+$/), 'good'],
      [1, 'Drove the bandits from the ferry', 'good'],
      [2, 'Done: Find the missing ferry', 'good'],
      [2, 'Came by the ferry key', 'good'],
      [2, 'the Town Watch thinks better of you: handed over a thief', 'good'],
      [2, 'the Town Watch thinks better of you: saved the sergeant', 'good'],
      [2, 'Wenna joined you', 'good'],
      [2, 'Learned Spark', 'good'],
      [2, 'Old Tam died', 'bad']
    ])
    // It kept the memory as it went (the view uses it rather than building it again).
    expect(memory.entities.map((e) => e.name)).toEqual(['Old Tam', 'Find the missing ferry', 'the ferry key', 'the miller’s ledger', 'the Town Watch'])
    expect(memory.entities[0].summary).toBe('the old ferryman')
  })

  it("marks a death, and an heir's arrival", () => {
    const { entries } = play([
      { type: 'status', status: 'dead', reason: 'Bled out' },
      {
        type: 'new_character',
        build: { ...build, name: 'Ada Rook' },
        days: 3650,
        fallen: { name: 'Brenna Rook', race: 'human', sex: 'female', background: 'hunter', level: 1, renown: 0, deeds: [], day: 1, cause: 'Bled out' },
        inherit: { coins: 0, renown: 0, items: [] }
      }
    ])
    expect(entries.map((e) => e.text)).toEqual(['Brenna Rook died: Bled out', "Ada Rook took up the tale, as Brenna Rook's child"])
    expect(entries[1].day).toBeGreaterThan(3000)
  })
})
