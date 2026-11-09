import { describe, expect, it } from 'vitest'
import { findTemplate } from './items'
import { carriedKg, capacityKg, defenseValue, encumbrance, hasTool, mainWeapon, needs } from './gear'
import { applyEvent, DEFAULT_SETTINGS, initialState, project, type GameEvent, type GameState } from './state'
import { resolveCheck, type CheckRequest } from './checks'
import { BACKGROUNDS, RACE_BACKGROUNDS, RACE_IDS } from './tables'
import type { CharacterBuild } from './character'
import { scribeToEvents, type ScribeOutput } from '../../server/ai/jobs/scribe'

const build = (p: Partial<CharacterBuild> = {}): CharacterBuild => ({
  name: 'Brenna Rook',
  race: 'human',
  sex: 'female',
  age: 'adult',
  background: 'hunter',
  humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 },
  skills: {},
  appearance: '',
  personality: '',
  ...p
})
const S = DEFAULT_SETTINGS
const run = (st: GameState, evs: GameEvent[]) => project(st, evs, S)

describe('item names', () => {
  it('finds what a named item is', () => {
    expect(findTemplate('Rusty iron sword')?.id).toBe('sword')
    expect(findTemplate('Skinning knife')?.id).toBe('skinning_knife')
    expect(findTemplate("Smith's hammer")?.id).toBe('hammer')
    expect(findTemplate('Bag of scrap iron')?.id).toBe('iron_bar')
    expect(findTemplate('Arrows')?.id).toBe('arrows')
    expect(findTemplate('oak staff')?.id).toBe('staff')
    expect(findTemplate('Small purse')).toBeUndefined()
  })

  it('knows every item in every starting kit', () => {
    for (const r of RACE_IDS) for (const b of RACE_BACKGROUNDS[r]) for (const k of BACKGROUNDS[b].kit) expect(findTemplate(k.name), `${b}: ${k.name}`).toBeDefined()
  })
})

describe('equipment', () => {
  it('starts with the kit in hand and on the body', () => {
    const hunter = initialState(build(), S).character
    expect(mainWeapon(hunter)).toMatchObject({ name: 'Shortbow', skill: 'ranged', attr: 'AGI', ammo: 'arrow' })
    // A two-handed bow leaves no hand free for the knife.
    expect(hunter.inventory.find((i) => i.name === 'Skinning knife')?.equipped).toBeUndefined()
    const smith = initialState(build({ background: 'smith' }), S).character
    expect(mainWeapon(smith).name).toBe("Smith's hammer")
    expect(smith.inventory.find((i) => i.name === 'Leather apron')?.equipped).toBe('body')
  })

  it('works out defense from armour and agility, capped by heavy armour', () => {
    let st = initialState(build({ background: 'sellsword' }), S)
    // 10 + leather armour 2 + AGI 15 (+2)
    expect(defenseValue(st.character).total).toBe(14)
    st = run(st, [{ type: 'item', name: 'Round shield', delta: 1 }])
    expect(st.character.inventory.find((i) => i.name === 'Round shield')?.equipped).toBe('off')
    expect(defenseValue(st.character).total).toBe(16)
    st = run(st, [{ type: 'item', name: 'Plate armour', delta: 1 }, { type: 'equip', name: 'Plate armour' }])
    // Plate replaces the leather and stops agility helping: 10 + plate 6 + shield 2 + 0.
    expect(defenseValue(st.character).total).toBe(18)
    expect(st.character.inventory.find((i) => i.name === 'Leather armour')?.equipped).toBeUndefined()
  })

  it('a two-handed weapon and a shield push each other out', () => {
    let st = initialState(build({ background: 'sellsword' }), S)
    st = run(st, [{ type: 'item', name: 'Round shield', delta: 1 }, { type: 'item', name: 'Greataxe', delta: 1 }, { type: 'equip', name: 'Greataxe' }])
    const inv = st.character.inventory
    expect(inv.find((i) => i.name === 'Greataxe')?.equipped).toBe('main')
    expect(inv.find((i) => i.name === 'Round shield')?.equipped).toBeUndefined()
    expect(inv.find((i) => i.name === 'Sword')?.equipped).toBeUndefined()
    st = run(st, [{ type: 'equip', name: 'Round shield' }])
    expect(st.character.inventory.find((i) => i.name === 'Greataxe')?.equipped).toBeUndefined()
  })

  it('weighs what is carried and slows an overloaded character', () => {
    let st = initialState(build({ attributes: { STR: 8, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 } }), S)
    expect(capacityKg(st.character)).toBe(40)
    expect(encumbrance(st.character)).toBe('none')
    st = run(st, [{ type: 'item', name: 'Iron ore', delta: 22 }])
    expect(carriedKg(st.character)).toBeGreaterThan(44)
    expect(encumbrance(st.character)).toBe('encumbered')
    const req: CheckRequest = { skill: 'stealth', difficulty: 'easy', modifier: 0, advantage: 'none', reason: 'sneak', dramatic: false, withStrangers: false, risk: { severity: 'none', source: 'environment' } }
    const r = resolveCheck(st, S, req, () => 0.5)
    expect(r.result.advantage).toBe('disadvantage')
    expect(r.result.edge).toContain('Carrying too much')
  })

  it('needs the right tool for a trade', () => {
    const st = initialState(build(), S)
    expect(hasTool(st.character, 'hunting')).toBe(true)
    expect(hasTool(st.character, 'mining')).toBe(false)
    const req: CheckRequest = { skill: 'mining', difficulty: 'easy', modifier: 0, advantage: 'none', reason: 'dig', dramatic: false, withStrangers: false, risk: { severity: 'none', source: 'environment' } }
    expect(resolveCheck(st, S, req, () => 0.5).result.edge).toEqual(['No tool for Mining'])
  })
})

describe('hunger and tiredness', () => {
  it('grows hungry and tired as time passes, and recovers', () => {
    let st = initialState(build(), S)
    expect(needs(st, true)).toMatchObject({ hunger: 'fed', exhaustion: 0 })
    st = run(st, [{ type: 'time', minutes: 10 * 60 }])
    expect(needs(st, true).hunger).toBe('peckish')
    st = run(st, [{ type: 'time', minutes: 8 * 60 }])
    expect(needs(st, true)).toMatchObject({ hunger: 'hungry', exhaustion: 1 })
    // Eating from the pack.
    st = run(st, [{ type: 'item', name: 'Travel rations', delta: 3 }, { type: 'use_item', name: 'Travel rations' }])
    expect(needs(st, true).hunger).toBe('fed')
    expect(st.character.inventory.find((i) => i.name === 'Travel rations')?.qty).toBe(2)
    st = run(st, [{ type: 'rest', kind: 'long' }])
    expect(needs(st, true).exhaustion).toBe(0)
    // With survival off, none of it applies.
    expect(needs(run(st, [{ type: 'time', minutes: 60 * 60 }]), false)).toMatchObject({ hunger: 'fed', exhaustion: 0 })
  })

  it("doesn't heal a starving body in its sleep", () => {
    let st = run(initialState(build(), S), [{ type: 'damage', amount: 8, source: 'beast', reason: 'bite' }, { type: 'time', minutes: 31 * 60 }])
    const hp = st.character.hp
    st = applyEvent(st, { type: 'rest', kind: 'long' }, S)
    expect(st.character.hp).toBe(hp)
    expect(needs(st, true).hunger).toBe('starving')
  })

  it('hunger and exhaustion count against checks', () => {
    const st = run(initialState(build(), S), [{ type: 'time', minutes: 27 * 60 }])
    const req: CheckRequest = { skill: 'athletics', difficulty: 'easy', modifier: 0, advantage: 'none', reason: 'climb', dramatic: false, withStrangers: false, risk: { severity: 'none', source: 'environment' } }
    const labels = resolveCheck(st, S, req, () => 0.5).result.breakdown.map((p) => `${p.label} ${p.value}`)
    expect(labels).toContain('Exhausted (2) -2')
    expect(labels).toContain('Hungry -1')
  })
})

describe('the Scribe and the pack', () => {
  const blank: ScribeOutput = {
    minutesPassed: 10, rest: 'none', location: '', deed: '', deedRenown: 0, itemsGained: [], itemsLost: [], coinsChange: 0, milestoneXp: 0, healing: 0,
    conditionsOn: [], conditionsOff: [], people: [], places: [], placeKind: 'unknown', ate: 'none', itemsUsed: [], itemsEquipped: [],
    spellsLearned: [],
    weather: 'unchanged' as const,
    companionsJoined: [],
    companionsLeft: [],
    factions: []
  }

  it('turns eating, drinking and bandaging into the items doing their work', () => {
    let st = initialState(build({ background: 'acolyte' }), S)
    st = run(st, [{ type: 'damage', amount: 6, source: 'beast', reason: 'bite' }, { type: 'condition', id: 'bleeding', on: true }])
    const evs = scribeToEvents({ ...blank, itemsUsed: [{ name: 'bandage', qty: 1 }], itemsLost: [{ name: 'Bandages', qty: 1 }], placeKind: 'forest' }, st, undefined, () => 0.99)
    expect(evs).toEqual(expect.arrayContaining([{ type: 'use_item', name: 'Bandages', heal: 4 }, { type: 'place_kind', kind: 'forest' }]))
    // The used bandage isn't also "lost".
    expect(evs.filter((e) => e.type === 'item')).toEqual([])
    const after = run(st, evs)
    expect(after.character.conditions).not.toContain('bleeding')
    expect(after.character.inventory.find((i) => i.name === 'Bandages')?.qty).toBe(3)
  })

  it('records a meal that is not from the pack, once', () => {
    const st = initialState(build({ background: 'farmhand' }), S)
    expect(scribeToEvents({ ...blank, ate: 'feast' }, st)).toContainEqual({ type: 'eat', hours: 24, wellFed: true })
    const fromPack = scribeToEvents({ ...blank, ate: 'meal', itemsUsed: [{ name: 'rations', qty: 1 }] }, st)
    expect(fromPack.filter((e) => e.type === 'eat')).toEqual([])
    expect(fromPack.filter((e) => e.type === 'use_item')).toHaveLength(1)
  })
})
