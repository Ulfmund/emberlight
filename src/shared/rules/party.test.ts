import { describe, expect, it } from 'vitest'
import { combatSummary, partySummary, resolveRound, type Foe } from './combat'
import { DEFAULT_SETTINGS, derived, initialState, project, type GameEvent, type GameState } from './state'
import { allyHealth, allyId, carer, companionHp, companionStats, guessRole, PARTY_MAX, partyFromCast, type CompanionRole } from './party'
import type { CharacterBuild } from './character'

const S = DEFAULT_SETTINGS
const build: CharacterBuild = {
  name: 'Brenna Rook',
  race: 'human',
  sex: 'male',
  age: 'adult',
  background: 'sellsword',
  humanBonus: ['STR', 'END'],
  attributes: { STR: 15, AGI: 12, END: 14, INT: 9, ARC: 8, WIT: 10, PRE: 10 },
  skills: {},
  appearance: '',
  personality: ''
}
const always = (x: number) => () => x
const join = (name: string, role: CompanionRole = 'fighter'): GameEvent => ({ type: 'party_join', companion: { id: allyId(name), name, role } })
const withParty = (...evs: GameEvent[]) => project(initialState(build, S), evs, S)

/** A foe sturdy enough to last the round. */
const foe = (p: Partial<Foe> = {}): Foe => ({
  id: 'f1', name: 'Bandit', template: 'bandit', family: 'humanoid', tier: 'standard', level: 1, hp: 60, maxHp: 60, defense: 12, attack: 3, damage: [1, 6, 1],
  initiative: 1, status: 'fighting', behavior: 'fearless', verb: 'slashes at', xp: 12, loot: [], ...p
})
const inFight = (st: GameState, foes: Foe[], surprise: 'player' | 'foes' | null = null) =>
  project(st, [{ type: 'combat_start', combat: { id: 'c', round: 1, foes, playerInitiative: 10, surprise, dodging: false } }], S)

describe('companions', () => {
  it('guess what someone does in a fight from who they are', () => {
    expect(guessRole('A priestess of the dawn, kind and stern')).toBe('healer')
    expect(guessRole('Old Tam, the ferryman at Millbrook')).toBe('fighter')
    expect(guessRole('a hunter and trapper from the hills')).toBe('archer')
    expect(guessRole('the hedge witch of the fen')).toBe('mage')
    expect(guessRole('a cutpurse from the docks')).toBe('scout')
    // Whole words only, and the first one said wins.
    expect(guessRole('a healthy young man who keeps a monkey')).toBe('fighter')
    expect(guessRole('a thief who dreams of being a wizard')).toBe('scout')
    expect(allyId('Old Tam')).toBe('ally_old_tam')
  })

  it('keep pace with the player: stronger as they level, their wounds kept', () => {
    const one = companionStats('fighter', 1)
    const five = companionStats('fighter', 5)
    expect(one).toMatchObject({ maxHp: 16, attack: 4, defense: 14, damage: [1, 8, 1] })
    expect(five.maxHp).toBeGreaterThan(one.maxHp)
    expect(five.attack).toBeGreaterThan(one.attack)
    expect(companionStats('healer', 1).heal).toEqual([1, 8, 2])
    expect(companionStats('mage', 1).maxHp).toBeLessThan(one.maxHp)
    const tam = { id: 'a', name: 'Tam', role: 'fighter' as const, wounds: 6, down: false, joinedDay: 1 }
    expect(companionHp(tam, 1)).toBe(10)
    expect(companionHp(tam, 5)).toBe(five.maxHp - 6)
    expect(allyHealth(tam, 1)).toBe('hurt')
  })

  it('join, part ways and change their role; never twice, never the player, never too many', () => {
    let st = withParty(join('Old Tam'), join('old tam'), join('Brenna Rook'), join('Mira', 'healer'))
    expect(st.party.map((a) => [a.name, a.role])).toEqual([
      ['Old Tam', 'fighter'],
      ['Mira', 'healer']
    ])
    st = project(st, [{ type: 'party_role', id: allyId('Old Tam'), role: 'archer' }, { type: 'party_leave', id: allyId('Mira'), why: 'left' }], S)
    expect(st.party.map((a) => [a.name, a.role])).toEqual([['Old Tam', 'archer']])
    const crowd = withParty(...['A', 'B', 'C', 'D', 'E'].map((n) => join(n)))
    expect(crowd.party).toHaveLength(PARTY_MAX)
  })

  it('get hurt, go down, get up after the fight, and mend with rest', () => {
    const id = allyId('Tam')
    let st = withParty(join('Tam'))
    st = project(st, [{ type: 'ally_hit', id, amount: 99 }], S)
    expect(st.party[0]).toMatchObject({ wounds: 16, down: true })
    st = project(st, [{ type: 'combat_end', outcome: 'victory' }], S)
    expect(st.party[0]).toMatchObject({ wounds: 15, down: false })
    st = project(st, [{ type: 'rest', kind: 'short' }], S)
    expect(st.party[0].wounds).toBe(11)
    st = project(st, [{ type: 'ally_heal', id, amount: 5 }], S)
    expect(st.party[0].wounds).toBe(6)
    st = project(st, [{ type: 'rest', kind: 'long' }], S)
    expect(st.party[0].wounds).toBe(0)
  })

  it('a healer brings a fallen character round; a new hero sets out alone', () => {
    let st = withParty(join('Mira', 'healer'), { type: 'status', status: 'downed', reason: 'hit' }, { type: 'set_hp', hp: 0, reason: 'hit' })
    expect(carer(st.party)?.name).toBe('Mira')
    st = project(st, [{ type: 'ally_care', id: allyId('Mira'), name: 'Mira' }], S)
    expect(st.character).toMatchObject({ status: 'alive', hp: 1 })
    expect(st.character.conditions).toContain('wounded')
    // A healer who is down can't.
    expect(carer(project(st, [{ type: 'ally_hit', id: allyId('Mira'), amount: 99 }], S).party)).toBeUndefined()
    const fallen = { name: 'Brenna Rook', race: 'human' as const, sex: 'male' as const, background: 'sellsword' as const, level: 1, renown: 0, deeds: [], day: 1, cause: 'a fall' }
    expect(project(st, [{ type: 'new_character', build: { ...build, name: 'Ada Rook' }, days: 10, fallen }], S).party).toEqual([])
  })

  it("from cards, travel with the player from the start (the card's id is theirs)", () => {
    const cast = [
      { cardId: 'card_1', role: 'companion' as const, name: 'Elara', description: 'An elven ranger of the deep woods.', personality: '' },
      { cardId: 'card_2', role: 'player' as const, name: 'Me', description: '', personality: '' }
    ]
    expect(partyFromCast(cast)).toEqual([{ id: 'card_1', name: 'Elara', role: 'archer', card: 'card_1', wounds: 0, down: false, joinedDay: 1 }])
  })
})

describe('companions in a fight', () => {
  it('fight beside the character: the engine rolls their blows, and foes go for them too', () => {
    const st = inFight(withParty(join('Tam')), [foe()])
    const r = resolveRound(st, S, { kind: 'attack', target: 'f1' }, always(0.75))
    const hit = r.events.find((e) => e.type === 'foe_hit' && e.by === 'Tam')
    expect(hit).toMatchObject({ id: 'f1', amount: 8 })
    expect(r.log.some((l) => l.startsWith('Tam (companion, fighter) cuts at Bandit'))).toBe(true)
    // The bandit went for Tam (a fighter draws blows) and hit.
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'foe_attack', target: allyId('Tam'), hit: true }))
    expect(r.events.some((e) => e.type === 'ally_hit' && e.id === allyId('Tam'))).toBe(true)
    expect(r.state.party[0].wounds).toBeGreaterThan(0)
    expect(r.log.at(-1)).toMatch(/Where things stand: Bandit: .*; Tam \(companion\): /)
  })

  it('a healer tends whoever is worst hurt before fighting', () => {
    let st = withParty(join('Mira', 'healer'))
    st = project(st, [{ type: 'set_hp', hp: 3, reason: 'test' }], S)
    const r = resolveRound(inFight(st, [foe()]), S, { kind: 'defend' }, always(0.3))
    expect(r.events).toContainEqual({ type: 'heal', amount: 5, reason: 'Mira tends you' })
    expect(r.log.some((l) => l.startsWith('Mira (companion, healer) tends the character: 5 health back'))).toBe(true)
  })

  it("a companion's kill counts, and a knocked-out one sits the fight out", () => {
    const st = inFight(withParty(join('Tam')), [foe({ hp: 2 })])
    const r = resolveRound(st, S, { kind: 'defend' }, always(0.75))
    expect(r.events).toContainEqual({ type: 'xp', amount: 12, reason: 'Tam felled Bandit' })
    expect(r.outcome).toBe('victory')
    // Down before the round: no blow from them, and the foes leave them be.
    const out = inFight(withParty(join('Tam'), { type: 'ally_hit', id: allyId('Tam'), amount: 99 }), [foe()])
    const r2 = resolveRound(out, S, { kind: 'defend' }, always(0.99))
    expect(r2.events.some((e) => (e.type === 'foe_hit' && e.by) || e.type === 'ally_hit')).toBe(false)
  })

  it('hold back while the character talks or yields, and when caught off guard', () => {
    const party = withParty(join('Tam'))
    const talk = resolveRound(inFight(party, [foe()]), S, { kind: 'talk', checks: [] }, always(0.75))
    expect(talk.events.some((e) => e.type === 'foe_hit')).toBe(false)
    expect(talk.log).toContain('The companions hold back while the character talks.')
    const ambushed = resolveRound(inFight(party, [foe()], 'player'), S, { kind: 'defend' }, always(0.75))
    expect(ambushed.events.some((e) => e.type === 'foe_hit' && e.by)).toBe(false)
  })

  it('get away with a fleeing character, and are named for the Referee', () => {
    const st = inFight(withParty(join('Tam')), [foe()])
    const r = resolveRound(st, S, { kind: 'flee' }, always(0.99))
    expect(r.outcome).toBe('fled')
    expect(r.log.some((l) => l.includes('and their companions with them'))).toBe(true)
    expect(partySummary(st)).toBe('Tam (fighter): unhurt')
    expect(combatSummary(st)).not.toContain('Tam')
  })

  it('without companions, a fight goes exactly as before', () => {
    const plain = inFight(initialState(build, S), [foe()])
    const r = resolveRound(plain, S, { kind: 'attack', target: 'f1' }, always(0.75))
    expect(r.events.some((e) => e.type === 'foe_attack' && e.target)).toBe(false)
    expect(r.state.character.hp).toBeLessThan(derived(plain, S).maxHp)
  })
})
