import { describe, expect, it } from 'vitest'
import { buildFoes, foeHealth, resolveRound, shouldTrack, startCombat, type Foe } from './combat'
import { findEnemy } from './enemies'
import { DEFAULT_SETTINGS, initialState, project, type GameState } from './state'
import type { CharacterBuild } from './character'

const S = DEFAULT_SETTINGS
const build = (p: Partial<CharacterBuild> = {}): CharacterBuild => ({
  name: 'Brenna Rook',
  race: 'human',
  sex: 'male',
  age: 'adult',
  background: 'sellsword',
  humanBonus: ['STR', 'END'],
  attributes: { STR: 15, AGI: 12, END: 14, INT: 9, ARC: 8, WIT: 10, PRE: 10 },
  skills: {},
  appearance: '',
  personality: '',
  ...p
})

/** Dice that come up as scripted: each value is a d20 face (or any die, scaled from it). */
function dice(...faces: number[]) {
  let i = 0
  // rng() → face for a d20; other dice get the same fraction of their range.
  return () => {
    const f = faces[i++ % faces.length]
    return (f - 1) / 20 + 0.001
  }
}
const always = (x: number) => () => x

function inFight(foes: Foe[], st = initialState(build(), S), playerInitiative = 10): GameState {
  return project(st, [{ type: 'combat_start', combat: { id: 'c', round: 1, foes, playerInitiative, surprise: null, dodging: false } }], S)
}

describe('foes', () => {
  it('finds the kind and builds a fair stat block for the tier and level', () => {
    expect(findEnemy('three bandits')?.id).toBe('bandit')
    expect(findEnemy('a cave bear')?.id).toBe('bear')
    expect(findEnemy('the Free Pennies')?.id).toBe('bandit')
    const [captain] = buildFoes([{ kind: 'bandit captain' }], 1, always(0.5))
    expect(captain).toMatchObject({ name: 'Bandit captain', tier: 'elite', maxHp: 20, attack: 5, defense: 13, damage: [1, 6, 2] })
    const pack = buildFoes([{ kind: 'wolves', count: 3 }], 3, always(0.5))
    expect(pack.map((f) => f.name)).toEqual(['Wolf 1', 'Wolf 2', 'Wolf 3'])
    expect(buildFoes([{ kind: 'cave bears', count: 2 }], 1, always(0.5)).map((f) => f.name)).toEqual(['Cave bear 1', 'Cave bear 2'])
    expect(pack[0]).toMatchObject({ level: 3, maxHp: 15, attack: 4 })
    // One standard bandit and two weaker ones are still Bandits 1 to 3.
    const mixed = buildFoes([{ kind: 'bandit' }, { kind: 'bandits', count: 2, tier: 'minion' }, { kind: 'bandit', name: 'Red Hob', tier: 'elite' }], 1, always(0.5))
    expect(mixed.map((f) => f.name)).toEqual(['Bandit 1', 'Bandit 2', 'Bandit 3', 'Red Hob'])
  })

  it('tracks a fight only when it is more than one ordinary foe (mixed mode)', () => {
    const one = buildFoes([{ kind: 'wolf' }], 1, always(0.5))
    const two = buildFoes([{ kind: 'wolf', count: 2 }], 1, always(0.5))
    const boss = buildFoes([{ kind: 'bandit', tier: 'boss' }], 1, always(0.5))
    expect(shouldTrack('mixed', one)).toBe(false)
    expect(shouldTrack('mixed', two)).toBe(true)
    expect(shouldTrack('mixed', boss)).toBe(true)
    expect(shouldTrack('turn', one)).toBe(true)
    expect(shouldTrack('narrative', two)).toBe(false)
  })
})

describe('a round of combat', () => {
  it('the player attacks, the foe strikes back, and the fight goes on', () => {
    const foes = buildFoes([{ kind: 'bandit' }], 1, always(0.5))
    foes[0].initiative = 5
    // Player attack d20 15, damage d8 5; bandit attack d20 18, damage d6 4.
    const st = inFight(foes)
    const r = resolveRound(st, S, { kind: 'attack', target: 'f1' }, dice(15, 10, 18, 14))
    expect(r.results[0]).toMatchObject({ skill: 'melee', dc: 12, kept: 15 })
    const hit = r.events.find((e) => e.type === 'foe_hit')
    expect(hit).toBeDefined()
    expect(r.events.some((e) => e.type === 'foe_attack' && e.hit)).toBe(true)
    expect(r.state.character.hp).toBeLessThan(st.character.hp)
    expect(r.state.combat?.round).toBe(2)
    expect(r.log[0]).toBe('Round 1.')
    expect(r.log.join(' ')).toMatch(/attacks Bandit with Sword: rolled 15/)
    expect(r.outcome).toBeUndefined()
  })

  it('faster foes act before the player; a surprised player is hit first', () => {
    const foes = buildFoes([{ kind: 'wolf' }], 1, always(0.5))
    foes[0].initiative = 20
    const r = resolveRound(inFight(foes, undefined, 5), S, { kind: 'defend' }, dice(10))
    const order = r.events.filter((e) => e.type === 'foe_attack' || e.type === 'combat_dodge').map((e) => e.type)
    expect(order).toEqual(['foe_attack', 'combat_dodge'])
  })

  it('wins a fight: the last foe falls, XP and loot are given, the fight ends', () => {
    const foes = buildFoes([{ kind: 'bandit' }], 1, always(0.5))
    foes[0].hp = 1
    foes[0].initiative = 1
    const r = resolveRound(inFight(foes), S, { kind: 'attack' }, dice(19, 10, 1, 1))
    expect(r.outcome).toBe('victory')
    expect(r.state.combat).toBeNull()
    expect(r.events).toContainEqual({ type: 'xp', amount: 12, reason: 'Defeated Bandit' })
    expect(r.events.some((e) => e.type === 'coins')).toBe(true)
    expect(r.log.join(' ')).toContain('THE FIGHT IS WON')
  })

  it('a bow uses arrows, and without arrows it is only a club', () => {
    const foes = buildFoes([{ kind: 'wolf' }], 1, always(0.5))
    let st = inFight(foes, initialState(build({ background: 'hunter', attributes: { STR: 10, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 } }), S))
    let r = resolveRound(st, S, { kind: 'attack' }, dice(12, 10, 2))
    expect(r.state.character.inventory.find((i) => i.name === 'Arrows')?.qty).toBe(19)
    expect(r.results[0].skill).toBe('ranged')
    st = project(r.state, [{ type: 'item', name: 'Arrows', delta: -19 }], S)
    r = resolveRound(st, S, { kind: 'attack' }, dice(12, 10, 2))
    expect(r.results[0].skill).toBe('melee')
    expect(r.log.join(' ')).toContain('no arrows left')
  })

  it('fleeing succeeds on an Athletics success and ends the fight', () => {
    const foes = buildFoes([{ kind: 'bandit', count: 2 }], 1, always(0.5))
    foes.forEach((f) => (f.initiative = 1))
    const r = resolveRound(inFight(foes), S, { kind: 'flee' }, dice(18))
    expect(r.outcome).toBe('fled')
    expect(r.events.filter((e) => e.type === 'foe_attack')).toHaveLength(0)
  })

  it('cowards run when hurt, and the rest give up when beaten', () => {
    const foes = buildFoes([{ kind: 'goblin' }], 1, always(0.5))
    foes[0].hp = 1
    const r = resolveRound(inFight(foes), S, { kind: 'defend' }, always(0.1))
    expect(r.state.combat === null || r.state.combat?.foes[0].status === 'fled').toBe(true)
    expect(r.log.join(' ')).toContain('flees')
  })

  it('a band that has lost half its number may break; a fearless one never does', () => {
    const band = buildFoes([{ kind: 'bandit', count: 4, tier: 'minion' }], 1, always(0.5))
    band[0].status = 'down'
    band[1].status = 'down'
    for (const f of band) f.initiative = 1
    // The player guards; both survivors lose their nerve (unhurt, so only the morale rule applies).
    const r = resolveRound(inFight(band), S, { kind: 'defend' }, always(0.05))
    const left = r.state.combat?.foes.filter((f) => f.status === 'fighting') ?? []
    expect(left).toHaveLength(0)
    expect(r.log.join(' ')).toMatch(/flees|yields/)

    const dead = buildFoes([{ kind: 'skeleton', count: 4 }], 1, always(0.5))
    dead[0].status = 'down'
    dead[1].status = 'down'
    for (const f of dead) f.initiative = 1
    const r2 = resolveRound(inFight(dead), S, { kind: 'defend' }, always(0.05))
    expect(r2.state.combat?.foes.filter((f) => f.status === 'fighting')).toHaveLength(2)
  })

  it('minions fall to one good hit and hit softly', () => {
    const [rat] = buildFoes([{ kind: 'bandit', tier: 'minion' }], 1, always(0.5))
    expect(rat).toMatchObject({ maxHp: 4, attack: 1, defense: 11, damage: [1, 6, 0] })
  })

  it('a fight that drops the player ends in defeat (captured by people, not killed)', () => {
    const foes = buildFoes([{ kind: 'bandit', tier: 'boss' }], 3, always(0.5))
    foes[0].initiative = 20
    const st = project(inFight(foes, initialState(build({ sex: 'female' }), S), 1), [{ type: 'set_hp', hp: 1, reason: 'test' }], S)
    const r = resolveRound(st, S, { kind: 'attack' }, dice(19, 19, 19, 1, 1))
    expect(r.outcome).toBe('defeat')
    expect(r.state.combat).toBeNull()
    const c = r.state.character
    expect(c.status === 'downed' || c.status === 'dead' || c.conditions.includes('captured')).toBe(true)
  })

  it('talking foes down works when they are beaten', () => {
    const foes = buildFoes([{ kind: 'bandit', count: 2 }], 1, always(0.5))
    foes.forEach((f) => ((f.hp = 3), (f.initiative = 1)))
    const r = resolveRound(inFight(foes), S, { kind: 'talk', checks: [{ skill: 'intimidation', difficulty: 'moderate', modifier: 0, advantage: 'none', reason: 'demanding they surrender', dramatic: false, withStrangers: false, risk: { severity: 'none', source: 'sentient' } }] }, dice(19, 1))
    expect(r.outcome).toBe('truce')
  })

  it('describes foes in words', () => {
    const [f] = buildFoes([{ kind: 'bear' }], 1, always(0.5))
    expect(foeHealth(f)).toBe('unhurt')
    expect(foeHealth({ ...f, hp: Math.round(f.maxHp * 0.3) })).toBe('badly hurt')
  })
})

describe('starting a fight', () => {
  it('an ambush can catch the player out, and initiative is rolled', () => {
    const foes = buildFoes([{ kind: 'wolf', count: 2 }], 1, always(0.5))
    const r = startCombat(initialState(build(), S), S, foes, dice(2, 10), { foesAmbush: true })
    expect(r.results[0]).toMatchObject({ skill: 'perception', hidden: true })
    expect(r.state.combat?.surprise).toBe('player')
    expect(r.log[0]).toContain('caught off guard')
    const sneak = startCombat(initialState(build({ background: 'thief' }), S), S, foes, dice(19, 10), { playerAmbushes: true })
    expect(sneak.state.combat?.surprise).toBe('foes')
  })
})

describe('range', () => {
  it('starts foes where the story puts them; archers keep their distance', () => {
    const [archer] = buildFoes([{ kind: 'archer' }], 1, always(0.5))
    const [bandit] = buildFoes([{ kind: 'bandit' }], 1, always(0.5))
    const [far] = buildFoes([{ kind: 'bandit', range: 'far' }], 1, always(0.5))
    expect([archer.range, bandit.range, far.range]).toEqual(['near', 'close', 'far'])
  })

  it("won't let a blade reach a foe far off: the swing becomes a move, and those in reach get a free swing", () => {
    const foes = buildFoes([{ kind: 'archer', range: 'far' }, { kind: 'bandit' }], 1, always(0.5))
    // The player goes first (initiative 30), so the free swing is the only blow before the move.
    const st = inFight(foes, initialState(build(), S), 30)
    const r = resolveRound(st, S, { kind: 'attack', target: foes[0].id }, dice(15))
    expect(r.log.join('\n')).toContain('is too far off to reach (far)')
    expect(r.log.join('\n')).toMatch(/Bandit slashes at the character as they break away \(a free swing\)/)
    expect(r.state.combat!.foes[0].range).toBe('near')
    expect(r.state.combat!.foes[0].hp).toBe(r.state.combat!.foes[0].maxHp)
    // Close In from near puts them within reach.
    // (Low dice: the foes miss, so the fight goes on.)
    const r2 = resolveRound(r.state, S, { kind: 'close_in', target: foes[0].id }, dice(2))
    expect(r2.state.combat!.foes[0].range).toBe('close')
  })

  it('makes foes who fight hand to hand close in first; archers shoot from where they are', () => {
    const foes = buildFoes([{ kind: 'bandit', range: 'near' }, { kind: 'archer', range: 'far' }], 1, always(0.5))
    const st = inFight(foes, initialState(build(), S), 1)
    const r = resolveRound(st, S, { kind: 'defend' }, dice(12))
    const log = r.log.join('\n')
    expect(log).toContain('Bandit closes in (now close).')
    expect(log).toMatch(/Archer shoots at the character/)
  })

  it('makes shooting at close quarters awkward, and fleeing easier with nobody in reach', () => {
    const archerPc = initialState(build({ background: 'hunter', attributes: { STR: 10, AGI: 15, END: 12, INT: 9, ARC: 8, WIT: 14, PRE: 10 } }), S)
    const [bandit] = buildFoes([{ kind: 'bandit' }], 1, always(0.5))
    const shot = resolveRound(inFight([bandit], archerPc, 30), S, { kind: 'attack', target: bandit.id }, dice(15))
    expect(shot.results[0].advantage).toBe('disadvantage')
    const [farOne] = buildFoes([{ kind: 'bandit', range: 'far' }], 1, always(0.5))
    const run = resolveRound(inFight([farOne], undefined, 30), S, { kind: 'flee' }, dice(15))
    expect(run.results[0].advantage).toBe('advantage')
  })
})
