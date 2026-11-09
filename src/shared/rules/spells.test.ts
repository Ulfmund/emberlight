import { describe, expect, it } from 'vitest'
import { castSpell, findSpell, knownSpells, spellById } from './spells'
import { buildFoes, resolveRound, type Foe } from './combat'
import { skillXpForLevel, type CharacterBuild } from './character'
import { DEFAULT_SETTINGS, initialState, project, type GameEvent, type GameState } from './state'
import { scribeToEvents } from '../../server/ai/jobs/scribe'

const S = DEFAULT_SETTINGS
const witch: CharacterBuild = {
  name: 'Wenna Rook',
  race: 'human',
  sex: 'female',
  age: 'adult',
  background: 'hedgewitch',
  humanBonus: ['ARC', 'WIT'],
  attributes: { STR: 8, AGI: 11, END: 11, INT: 12, ARC: 15, WIT: 13, PRE: 10 },
  skills: {},
  appearance: '',
  personality: ''
}

/** Dice that come up as scripted d20 faces (other dice get the same share of their range). */
const dice = (...faces: number[]) => {
  let i = 0
  return () => (faces[i++ % faces.length] - 1) / 20 + 0.001
}
const always = (x: number) => () => x
const with_ = (st: GameState, evs: GameEvent[]) => project(st, evs, S)
const inFight = (foes: Foe[], st = initialState(witch, S)) => with_(st, [{ type: 'combat_start', combat: { id: 'c', round: 1, foes, playerInitiative: 25, surprise: null, dodging: false } }])

describe('spells', () => {
  it('magical callings start with spells; elves with a light', () => {
    expect(initialState(witch, S).character.spells).toEqual(['mend', 'hex'])
    expect(initialState({ ...witch, background: 'sellsword' }, S).character.spells).toEqual([])
    expect(initialState({ ...witch, race: 'elf', background: 'hunter', humanBonus: [] }, S).character.spells).toEqual(['light'])
    expect(knownSpells(initialState(witch, S)).map((sp) => sp.name)).toEqual(['Mend', 'Hex'])
  })

  it('knows a spell by what the story calls it', () => {
    expect(findSpell('a firebolt')?.id).toBe('firebolt')
    expect(findSpell('I cast Mend on my arm')?.id).toBe('mend')
    expect(findSpell('fear')?.id).toBe('fear')
    expect(findSpell('chain lightning')?.id).toBe('chain_lightning')
    expect(findSpell('a nice song')).toBeUndefined()
  })

  it('heals out of a fight, for mana; without mana or the spell, nothing happens', () => {
    const hurt = with_(initialState(witch, S), [{ type: 'damage', amount: 6, source: 'beast', reason: 'bite' }, { type: 'condition', id: 'bleeding', on: true }])
    const r = castSpell(hurt, S, spellById('mend')!, dice(15))
    expect(r.state.character.mana).toBe(hurt.character.mana - 2)
    expect(r.state.character.hp).toBeGreaterThan(hurt.character.hp)
    expect(r.state.character.conditions).not.toContain('bleeding')
    expect(r.log[0]).toMatch(/^MAGIC: Mend works .*health back/)
    const dry = with_(hurt, [{ type: 'mana', delta: -hurt.character.mana }])
    expect(castSpell(dry, S, spellById('mend')!, dice(15)).log[0]).toMatch(/not enough mana/)
    expect(castSpell(hurt, S, spellById('firebolt')!, dice(15)).log[0]).toMatch(/doesn't know Firebolt/)
  })

  it('a natural 1 backfires', () => {
    const r = castSpell(initialState(witch, S), S, spellById('mend')!, dice(1, 1, 1))
    expect(r.log.join(' ')).toMatch(/BACKFIRE/)
  })

  it('in a fight: curses, sleep (not for leaders), and wards', () => {
    const band = buildFoes([{ kind: 'bandit', count: 2 }], 1, always(0.5))
    for (const f of band) f.initiative = 1
    // Hex: the first bandit fights at −2 from now on.
    let r = resolveRound(inFight(band), S, { kind: 'cast', target: 'f1', spell: 'hex' }, dice(18))
    expect(r.state.combat?.foes[0].attack).toBe(band[0].attack - 2)
    expect(r.log.join(' ')).toContain('Bandit 1 fights at −2 for the rest of the fight')

    // Sleep, learned later: an ordinary foe drops; a leader shrugs it off.
    const learned = with_(initialState(witch, S), [{ type: 'learn_spell', id: 'sleep' }, { type: 'skill_xp', skill: 'spellcasting', amount: skillXpForLevel(4) }])
    const boss = buildFoes([{ kind: 'bandit', count: 1 }, { kind: 'bandit captain', tier: 'elite', name: 'Red Hob' }], 1, always(0.5))
    for (const f of boss) f.initiative = 1
    r = resolveRound(inFight(boss, learned), S, { kind: 'cast', target: 'f1', spell: 'sleep' }, dice(18))
    expect(r.state.combat?.foes[0].status).toBe('asleep')
    r = resolveRound(inFight(boss, learned), S, { kind: 'cast', target: 'f2', spell: 'sleep' }, dice(18))
    expect(r.state.combat?.foes[1].status).toBe('fighting')
    expect(r.log.join(' ')).toContain('their will is too strong')

    // A ward makes the foes miss more: +2 Defense for the rest of the fight.
    const warded = with_(initialState(witch, S), [{ type: 'learn_spell', id: 'stoneskin' }, { type: 'skill_xp', skill: 'spellcasting', amount: skillXpForLevel(4) }])
    r = resolveRound(inFight(band, warded), S, { kind: 'cast', spell: 'stoneskin' }, dice(18))
    expect(r.state.combat?.ward).toBe(2)
    expect(r.log.join(' ')).toContain('+2 Defense for the rest of the fight')
  })

  it('a fight is won when every foe is down or asleep', () => {
    const learned = with_(initialState(witch, S), [{ type: 'learn_spell', id: 'sleep' }, { type: 'skill_xp', skill: 'spellcasting', amount: skillXpForLevel(4) }])
    const [lone] = buildFoes([{ kind: 'bandit' }], 1, always(0.5))
    lone.initiative = 1
    const r = resolveRound(inFight([lone], learned), S, { kind: 'cast', target: 'f1', spell: 'sleep' }, dice(18))
    expect(r.outcome).toBe('victory')
    expect(r.state.character.xp).toBeGreaterThan(0)
  })

  it('the story can teach a spell', () => {
    const st = initialState(witch, S)
    const out = {
      minutesPassed: 30, rest: 'none' as const, location: '', deed: '', deedRenown: 0, itemsGained: [], itemsLost: [], coinsChange: 0, milestoneXp: 0, healing: 0,
      conditionsOn: [], conditionsOff: [], records: [], placeKind: 'unknown', ate: 'none' as const, itemsUsed: [], itemsEquipped: [],
      spellsLearned: ['Firebolt', 'Mend', 'Fireball of Doom'],
      weather: 'unchanged' as const,
    companionsJoined: [],
    companionsLeft: []
    }
    const evs = scribeToEvents(out as Parameters<typeof scribeToEvents>[0], st)
    expect(evs.filter((e) => e.type === 'learn_spell')).toEqual([{ type: 'learn_spell', id: 'firebolt', name: 'Firebolt' }])
  })
})
