import { describe, expect, it } from 'vitest'
import { findTemplate } from './items'
import { findEnemy } from './enemies'
import { buildFoes, resolveRound } from './combat'
import { mainWeapon } from './gear'
import { DEFAULT_SETTINGS as S, initialState, project } from './state'
import type { CharacterBuild } from './character'
import { narratorSystem } from '../../server/ai/narrator'

const hunter: CharacterBuild = {
  name: 'Varro Krell', race: 'human', sex: 'male', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 10, AGI: 15, END: 12, INT: 9, ARC: 8, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}

describe('far-future gear', () => {
  it('knows the guns, blades, armour and kit a story names', () => {
    const id = (n: string) => findTemplate(n)?.id
    expect(id('a battered laspistol')).toBe('laser_pistol')
    expect(id('Lasgun')).toBe('laser_rifle')
    expect(id('bolt pistol')).toBe('heavy_pistol')
    expect(id('Bolter')).toBe('heavy_rifle')
    expect(id('chainsword')).toBe('chainblade')
    expect(id('flak vest')).toBe('flak_vest')
    expect(id('Charge packs')).toBe('power_cells')
    expect(id('bolt rounds')).toBe('rounds')
    expect(id('medkit')).toBe('medkit')
    expect(id('ration bricks')).toBe('ration_bricks')
    // The fantasy things are still themselves.
    expect(id('crossbow bolts')).toBe('bolts')
    expect(id('longsword')).toBe('sword')
  })

  it('shoots with a power cell a shot, and makes do in close when they run out', () => {
    const st = project(initialState(hunter, S), [{ type: 'item', name: 'Laspistol', delta: 1 }, { type: 'equip', name: 'Laspistol' }, { type: 'item', name: 'Power cells', delta: 1 }], S)
    expect(mainWeapon(st.character)).toMatchObject({ skill: 'ranged', ammo: 'cell' })
    const [ganger] = buildFoes([{ kind: 'ganger', range: 'near' }], 1, () => 0.5)
    const fight = project(st, [{ type: 'combat_start', combat: { id: 'c', round: 1, foes: [ganger], playerInitiative: 30, surprise: null, dodging: false } }], S)
    const one = resolveRound(fight, S, { kind: 'attack', target: ganger.id }, () => 0.9)
    expect(one.state.character.inventory.find((i) => i.name === 'Power cells')).toBeUndefined()
    const two = resolveRound(one.state, S, { kind: 'attack', target: ganger.id }, () => 0.9)
    expect(two.log.join('\n')).toContain('has no power cells left')
  })

  it("starts a far-future hero with their calling's kit in its terms", () => {
    const st = initialState({ ...hunter, kit: 'scifi' }, S)
    const names = st.character.inventory.map((i) => i.name)
    expect(names).toContain('Laser rifle')
    expect(names).toContain('Power cells')
    expect(names).not.toContain('Shortbow')
    expect(mainWeapon(st.character)).toMatchObject({ name: 'Laser rifle', ammo: 'cell' })
    // Without it, the fantasy kit as ever.
    expect(initialState(hunter, S).character.inventory.map((i) => i.name)).toContain('Shortbow')
  })

  it('tells the DM fantasy gear in far-future words, and far-future gear as it is', () => {
    const st = project(initialState(hunter, S), [{ type: 'item', name: 'Bolt pistol', delta: 1 }], S)
    const sys = narratorSystem(st, { ...S, genre: 'scifi' }, [])
    expect(sys).toContain('Bolt pistol')
    expect(sys).toMatch(/Wielding: rifle/)
  })
})

describe('far-future foes', () => {
  it('knows gangers, servitors, mutants, aliens and daemons, and shooters by their guns', () => {
    expect(findEnemy('three hive gangers')?.id).toBe('ganger')
    expect(findEnemy('a combat servitor')?.id).toBe('servitor')
    expect(findEnemy('mutants')?.id).toBe('mutant')
    expect(findEnemy('a pack of genestealers')?.id).toBe('xeno_beast')
    expect(findEnemy('orks')?.id).toBe('orc')
    expect(findEnemy('a daemon')?.id).toBe('daemon')
    const [cultist] = buildFoes([{ kind: 'cultists with autoguns' }], 1, () => 0.5)
    expect(cultist).toMatchObject({ template: 'cultist', ranged: true, verb: 'shoots at', range: 'near' })
    const [plain] = buildFoes([{ kind: 'cultist' }], 1, () => 0.5)
    expect(plain).toMatchObject({ ranged: false, range: 'close' })
  })
})
