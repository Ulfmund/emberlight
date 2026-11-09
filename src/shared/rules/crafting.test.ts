import { describe, expect, it } from 'vitest'
import { canMake, countOf, findNode, findRecipe, NODES, recipeAction, RECIPES, resolveWork, workFromChecks } from './crafting'
import { itemTemplate } from './items'
import { skillXpForLevel, type CharacterBuild } from './character'
import { DEFAULT_SETTINGS, initialState, project, type GameEvent, type GameState, type PlaceKind } from './state'
import type { SkillId } from './tables'

const S = DEFAULT_SETTINGS
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

/** Dice that come up as scripted d20 faces. */
const dice = (...faces: number[]) => {
  let i = 0
  return () => (faces[i++ % faces.length] - 1) / 20 + 0.001
}

function at(place: PlaceKind | null, items: [string, number][] = [], skills: [SkillId, number][] = []): GameState {
  const evs: GameEvent[] = []
  if (place) evs.push({ type: 'place_kind', kind: place })
  for (const [name, n] of items) evs.push({ type: 'item', name, delta: n })
  for (const [skill, lvl] of skills) evs.push({ type: 'skill_xp', skill, amount: skillXpForLevel(lvl) })
  return project(initialState(build, S), evs, S)
}

describe('gathering and crafting', () => {
  it('only uses items the game knows', () => {
    for (const n of NODES) for (const y of n.yields) expect(itemTemplate(y.item), `${n.id}: ${y.item}`).toBeTruthy()
    for (const rc of RECIPES) {
      expect(itemTemplate(rc.output), rc.id).toBeTruthy()
      for (const x of rc.inputs) expect(itemTemplate(x.item), `${rc.id}: ${x.item}`).toBeTruthy()
    }
  })

  it('finds the right spot to gather, if the place has one', () => {
    expect(findNode(at('forest'), 'some firewood').node?.id).toBe('logs')
    expect(findNode(at('water'), 'fish').node?.id).toBe('fish')
    expect(findNode(at('forest'), 'healing herbs').node?.skill).toBe('herbalism')
    // The place is a hint, not a wall: the story may be on its way somewhere.
    expect(findNode(at('village'), 'copper ore').node?.id).toBe('copper')
    expect(findNode(at('forest'), 'tracking a deer', 'hunting').node?.skill).toBe('hunting')
    // Iron takes some skill; copper doesn't.
    expect(findNode(at('hills'), 'iron ore').why).toMatch(/Needs Mining 3/)
    expect(findNode(at('hills', [], [['mining', 3]]), 'iron ore').node?.id).toBe('iron')
    expect(findNode(at('hills'), 'I dig for ore').node?.skill).toBe('mining')
  })

  it('knows what it takes to make something', () => {
    expect(findRecipe('a healing draught')?.id).toBe('healing_draught')
    expect(findRecipe('arrows')?.id).toBe('arrows')
    expect(findRecipe('a cake')).toBeUndefined()
    const draught = findRecipe('healing_draught')!
    expect(canMake(at('town'), draught).why).toMatch(/Needs Alchemy 2/)
    expect(canMake(at('town', [], [['alchemy', 2]]), draught).why).toMatch(/Missing 2 × Healing moss, 1 × Empty vial/)
    expect(canMake(at('town', [['Healing moss', 2], ['Empty vial', 1]], [['alchemy', 2]]), draught).ok).toBe(true)
    // Out in the wild a fire needs a tinderbox; a forge needs a town.
    expect(canMake(at('forest', [['Healing moss', 2], ['Empty vial', 1]], [['alchemy', 2]]), draught).why).toMatch(/tinderbox/)
    expect(canMake(at('forest', [['Healing moss', 2], ['Empty vial', 1], ['Tinderbox', 1]], [['alchemy', 2]]), draught).ok).toBe(true)
    expect(canMake(at('forest', [['Copper ore', 1], ['Tin ore', 1]]), findRecipe('bronze_bar')!).why).toMatch(/forge/)
    expect(recipeAction(draught)).toBe('I brew a healing draught.')
    // A plain Herbalism check from the Referee is gathering; a Cooking one is crafting if it names a recipe.
    const check = (skill: SkillId, reason: string) => ({ skill, reason, difficulty: 'easy' as const, modifier: 0, advantage: 'none' as const, dramatic: false, withStrangers: false, risk: { severity: 'none' as const, source: 'environment' as const } })
    expect(workFromChecks([check('herbalism', 'looking for moss')])).toEqual({ kind: 'gather', what: 'looking for moss', skill: 'herbalism' })
    expect(workFromChecks([check('cooking', 'roasting the meat')])).toMatchObject({ kind: 'craft' })
    expect(workFromChecks([check('cooking', 'cooking something nice')])).toBeUndefined()
    expect(workFromChecks([check('stealth', 'sneaking')])).toBeUndefined()
    expect(recipeAction(findRecipe('arrows')!)).toBe('I fletch arrows.')
  })

  it('gathers more on a better roll, and nothing on a failure', () => {
    // No axe: the roll is at a disadvantage (both dice come up the same here).
    const narrow = resolveWork(at('forest'), S, { kind: 'gather', what: 'firewood' }, dice(9))
    expect(narrow.results[0].tier).toBe('narrow_success')
    expect(countOf(narrow.state, 'logs')).toBe(1)
    expect(narrow.log[0]).toMatch(/No proper tools for woodcutting/)
    const great = resolveWork(at('forest'), S, { kind: 'gather', what: 'firewood' }, dice(20))
    expect(countOf(great.state, 'logs')).toBe(4)
    expect(great.log.join(' ')).toContain('GATHERING: the character gets 4 × Logs.')
    const miss = resolveWork(at('forest'), S, { kind: 'gather', what: 'firewood' }, dice(2))
    expect(countOf(miss.state, 'logs')).toBe(0)
    expect(miss.results[0].skill).toBe('woodcutting')
    // Not skilled enough for iron yet: no roll at all.
    const none = resolveWork(at('hills'), S, { kind: 'gather', what: 'iron ore' }, dice(20))
    expect(none.results).toHaveLength(0)
    expect(none.log[0]).toMatch(/Needs Mining 3/)
  })

  it('makes things from materials; a bad failure spoils some of them', () => {
    const kit: [string, number][] = [['Healing moss', 4], ['Empty vial', 2]]
    const skilled: [SkillId, number][] = [['alchemy', 3]]
    const made = resolveWork(at('town', kit, skilled), S, { kind: 'craft', what: 'healing draught' }, dice(15))
    expect(countOf(made.state, 'healing_draught')).toBe(1)
    expect(countOf(made.state, 'healing_moss')).toBe(2)
    expect(countOf(made.state, 'empty_vial')).toBe(1)
    expect(made.log.join(' ')).toContain('made 1 × Healing draught')

    // A narrow failure loses only time.
    const close = resolveWork(at('town', kit, skilled), S, { kind: 'craft', what: 'healing draught' }, dice(9))
    expect(close.results[0].tier).toBe('narrow_failure')
    expect(countOf(close.state, 'healing_moss')).toBe(4)
    // A worse one spoils half the materials.
    const bad = resolveWork(at('town', kit, skilled), S, { kind: 'craft', what: 'healing draught' }, dice(3))
    expect(bad.results[0].tier).toMatch(/failure/)
    expect(countOf(bad.state, 'healing_moss')).toBe(3)
    expect(countOf(bad.state, 'healing_draught')).toBe(0)

    // Can't: nothing rolled, nothing used.
    const cant = resolveWork(at('town', [['Healing moss', 1]], skilled), S, { kind: 'craft', what: 'healing_draught' }, dice(20))
    expect(cant.results).toHaveLength(0)
    expect(cant.log.join(' ')).toMatch(/not possible\. Missing 1 × Healing moss/)
  })
})
