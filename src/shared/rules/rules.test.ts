import { describe, expect, it } from 'vitest'
import {
  validateBuild as validate,
  attrCaps,
  charLevelFromXp,
  charXpForLevel,
  maxHp,
  pointsLeft,
  randomBuild,
  skillCaps,
  skillLevelFromXp,
  skillXpForLevel,
  socialModifier,
  validateBuild,
  type CharacterBuild,
  type Rng
} from './character'
import { checkBreakdown, deathRollEvents, defeatEvents, resolveCheck, tierFor, type CheckRequest } from './checks'
import { applyEvent, DEFAULT_SETTINGS, derived, initialState, project, type GameState } from './state'
import { ATTRS, BACKGROUND_IDS, BACKGROUNDS, BANNED_NAMES, RACE_BACKGROUNDS, RACE_IDS } from './index'
import { generateName } from './names'

/** Deterministic random numbers for tests. */
function seq(...values: number[]): Rng {
  let i = 0
  return () => values[i++ % values.length]
}
function seeded(seed: number): Rng {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** rng value that makes d20 land on `n`. */
const d20 = (n: number) => (n - 1) / 20 + 0.001

const S = DEFAULT_SETTINGS

const base: CharacterBuild = {
  name: 'Brenna Rook',
  race: 'dwarf',
  sex: 'male',
  age: 'adult',
  background: 'smith',
  humanBonus: [],
  attributes: { STR: 15, AGI: 8, END: 14, INT: 10, ARC: 8, WIT: 10, PRE: 8 },
  skills: { athletics: 2, perception: 2, lore: 2 },
  appearance: '',
  personality: ''
}

describe('caps', () => {
  it('stacks race, sex and age on the base cap of 16', () => {
    const caps = attrCaps(base, 'realistic')
    expect(caps.STR).toBe(16 + 2 + 2) // dwarf +2, male +2
    expect(caps.ARC).toBe(16 - 3) // dwarf −3
    expect(caps.END).toBe(16 + 3 + 1)
  })

  it('makes a female elf a frail but strong caster', () => {
    const caps = attrCaps({ ...base, race: 'elf', sex: 'female' }, 'realistic')
    expect(caps.STR).toBe(16 - 2 - 3)
    expect(caps.ARC).toBe(16 + 2 + 2)
    const sCaps = skillCaps({ ...base, race: 'elf', sex: 'female', background: 'hedgewitch' }, 'realistic')
    expect(sCaps.spellcasting).toBe(50) // 2×20 + 5 elf + 5 female + 5 hedge witch → capped at 50
    expect(sCaps.melee).toBe(2 * 11)
  })

  it('ignores sex when the campaign turns modifiers off', () => {
    expect(attrCaps({ ...base, sex: 'female' }, 'off')).toEqual(attrCaps({ ...base, sex: 'male' }, 'off'))
  })

  it('keeps caps between 8 and 20', () => {
    const caps = attrCaps({ ...base, race: 'halfling', sex: 'female', age: 'elder' }, 'realistic')
    expect(caps.STR).toBe(8) // 16 −3 −3 −2 = 8
    for (const a of ATTRS) expect(caps[a]).toBeLessThanOrEqual(20)
  })

  it('gives humans +1 to their two chosen caps', () => {
    const caps = attrCaps({ ...base, race: 'human', humanBonus: ['INT', 'WIT'] }, 'realistic')
    expect(caps.INT).toBe(17)
    expect(caps.WIT).toBe(17)
  })
})

describe('point-buy and validation', () => {
  it('costs 1 per point up to 14 and 2 above', () => {
    const attrs = { STR: 16, AGI: 8, END: 8, INT: 8, ARC: 8, WIT: 8, PRE: 8 }
    expect(24 - pointsLeft(attrs)).toBe(6 + 2 + 2)
  })

  it('accepts the example build', () => {
    expect(validateBuild(base, 'realistic')).toEqual([])
  })

  it('rejects scores above the cap', () => {
    // female elf: STR cap 16 − 2 − 3 = 11
    const b = { ...base, race: 'elf' as const, sex: 'female' as const, attributes: { ...base.attributes, STR: 15 } }
    expect(validateBuild(b, 'realistic').some((e) => e.includes('STR'))).toBe(true)
  })

  it('random builds are always valid', () => {
    const rng = seeded(42)
    for (let i = 0; i < 200; i++) {
      const b = randomBuild(rng, i % 2 ? 'realistic' : 'off', 'Test')
      expect(validateBuild(b, i % 2 ? 'realistic' : 'off')).toEqual([])
      expect(pointsLeft(b.attributes)).toBeLessThanOrEqual(1)
    }
  })
})

describe('progression', () => {
  it('maps XP to levels and back', () => {
    for (const lvl of [1, 2, 5, 10, 30, 50]) expect(skillLevelFromXp(skillXpForLevel(lvl))).toBe(lvl)
    for (const lvl of [1, 2, 10, 30]) expect(charLevelFromXp(charXpForLevel(lvl))).toBe(lvl)
    expect(skillLevelFromXp(skillXpForLevel(10) - 1)).toBe(9)
  })

  it('levels up with +1 attribute point, +2 Renown and more health', () => {
    let st = initialState(base, S)
    const hp0 = derived(st, S).maxHp
    st = applyEvent(st, { type: 'xp', amount: charXpForLevel(2), reason: 'test' }, S)
    expect(st.character.level).toBe(2)
    expect(st.character.attrPoints).toBe(1)
    expect(st.character.renown).toBe(2)
    expect(derived(st, S).maxHp).toBeGreaterThan(hp0)
    expect(st.character.hp).toBe(derived(st, S).maxHp)
  })

  it('gives women less health and men a social penalty that Renown pays off', () => {
    expect(maxHp('female', 'realistic', 10, 1)).toBeLessThan(maxHp('male', 'realistic', 10, 1))
    expect(socialModifier('male', 'realistic', 0)).toBe(-2)
    expect(socialModifier('male', 'realistic', 100)).toBe(4)
    expect(socialModifier('female', 'realistic', 0)).toBe(2)
    expect(socialModifier('female', 'realistic', 100)).toBe(5)
  })
})

describe('checks', () => {
  const req: CheckRequest = {
    skill: 'athletics',
    difficulty: 'moderate',
    modifier: 0,
    advantage: 'none',
    reason: 'jumping the gap',
    dramatic: false,
    withStrangers: false,
    risk: { severity: 'none', source: 'environment' }
  }

  it('sorts results into tiers', () => {
    expect(tierFor(20, -15)).toBe('crit_success')
    expect(tierFor(1, 15)).toBe('crit_failure')
    expect(tierFor(10, 10)).toBe('overwhelming')
    expect(tierFor(10, 5)).toBe('clean_success')
    expect(tierFor(10, 0)).toBe('narrow_success')
    expect(tierFor(10, -1)).toBe('narrow_failure')
    expect(tierFor(10, -5)).toBe('failure')
    expect(tierFor(10, -10)).toBe('severe_failure')
  })

  it('adds the attribute modifier and a fifth of the skill level', () => {
    const st = initialState(base, S)
    const parts = checkBreakdown(st, S, req)
    // STR 15 → +2; athletics level 1 + 2 = 3 → +0
    expect(parts.reduce((s, p) => s + p.value, 0)).toBe(2)
  })

  it('grants full XP on success and half on failure', () => {
    const st = initialState(base, S)
    const win = resolveCheck(st, S, req, seq(d20(18)))
    const lose = resolveCheck(st, S, req, seq(d20(2)))
    const xp = (r: typeof win) => r.events.find((e) => e.type === 'skill_xp')
    expect(xp(win)).toMatchObject({ amount: 15 })
    expect(xp(lose)).toMatchObject({ amount: 8 })
  })

  it('only hurts on failure, harder on worse failures', () => {
    const st = initialState(base, S)
    const risky = { ...req, risk: { severity: 'serious' as const, source: 'beast' as const } }
    const ok = resolveCheck(st, S, risky, seq(d20(15), 0.5))
    expect(ok.result.damage).toBe(0)
    const narrow = resolveCheck(st, S, risky, seq(d20(9), 0.99)) // 9+2=11 vs 12 → narrow failure
    const crit = resolveCheck(st, S, risky, seq(d20(1), 0.99))
    expect(narrow.result.tier).toBe('narrow_failure')
    expect(crit.result.damage).toBeGreaterThan(narrow.result.damage)
  })

  it('applies the social modifier only to social checks with strangers', () => {
    const st = initialState(base, S)
    const social = { ...req, skill: 'persuasion' as const, withStrangers: true }
    expect(checkBreakdown(st, S, social).some((p) => p.label === 'Must prove yourself')).toBe(true)
    expect(checkBreakdown(st, S, { ...social, withStrangers: false }).some((p) => p.label === 'Must prove yourself')).toBe(false)
  })
})

describe('defeat', () => {
  const downedBy = (state: GameState, settings = S) => (source: 'sentient' | 'beast', roll: number) =>
    defeatEvents({ ...state, character: { ...state.character, hp: -1 } }, settings, source, seq(roll))

  it('women are usually captured by human enemies, men usually go down', () => {
    const woman = initialState({ ...base, race: 'human', humanBonus: ['INT', 'WIT'], sex: 'female' }, S)
    const man = initialState({ ...base, race: 'human', humanBonus: ['INT', 'WIT'] }, S)
    expect(downedBy(woman)('sentient', 0.5).some((e) => e.type === 'condition' && e.id === 'captured')).toBe(true)
    expect(downedBy(man)('sentient', 0.5).some((e) => e.type === 'status' && e.status === 'downed')).toBe(true)
  })

  it('beasts never capture', () => {
    const woman = initialState({ ...base, race: 'human', humanBonus: ['INT', 'WIT'], sex: 'female' }, S)
    expect(downedBy(woman)('beast', 0.01).some((e) => e.type === 'condition' && e.id === 'captured')).toBe(false)
  })

  it('orcs shrug off the first knockdown each day', () => {
    const orc = initialState({ ...base, race: 'orc' }, S)
    expect(downedBy(orc)('beast', 0.5)[0]).toMatchObject({ type: 'set_hp', hp: 1 })
  })

  it('brutal mercy kills at zero', () => {
    const st = initialState({ ...base, race: 'human', humanBonus: ['INT', 'WIT'] }, S)
    expect(downedBy(st, { ...S, mercy: 'brutal' })('sentient', 0.9)).toEqual([{ type: 'status', status: 'dead', reason: 'Struck down' }])
  })

  it('three failed death rolls kill, three successes stabilise', () => {
    let st = initialState({ ...base, race: 'human', humanBonus: ['INT', 'WIT'] }, S)
    st = project(st, [{ type: 'damage', amount: 999, source: 'beast', reason: '' }, { type: 'status', status: 'downed', reason: '' }], S)
    let dying = st
    for (let i = 0; i < 3; i++) dying = project(dying, deathRollEvents(dying, seq(d20(3))), S)
    expect(dying.character.status).toBe('dead')
    let living = st
    for (let i = 0; i < 3; i++) living = project(living, deathRollEvents(living, seq(d20(15))), S)
    expect(living.character.status).toBe('alive')
    expect(living.character.hp).toBe(1)
  })
})

describe('names', () => {
  it('never produces an overused name', () => {
    const rng = seeded(7)
    const banned = new Set(BANNED_NAMES.map((n) => n.toLowerCase()))
    for (let i = 0; i < 500; i++) {
      const n = generateName(rng, 'elf', i % 2 ? 'male' : 'female', false)
      expect(banned.has(n.toLowerCase())).toBe(false)
    }
  })
})

describe('callings by people', () => {
  it('gives every people at least six callings that exist', () => {
    for (const r of RACE_IDS) {
      expect(RACE_BACKGROUNDS[r].length).toBeGreaterThanOrEqual(6)
      for (const b of RACE_BACKGROUNDS[r]) expect(BACKGROUND_IDS).toContain(b)
    }
    // Every calling belongs to someone.
    for (const b of BACKGROUND_IDS) expect(RACE_IDS.some((r) => RACE_BACKGROUNDS[r].includes(b))).toBe(true)
    // Callings must be valid to start with: skills within the starting limit.
    for (const b of BACKGROUND_IDS) for (const lvl of Object.values(BACKGROUNDS[b].skills)) expect(1 + (lvl as number)).toBeLessThanOrEqual(10)
  })

  it("rolls random adventurers from their own people's callings, and refuses others", () => {
    let seed = 7
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 300; i++) {
      const b = randomBuild(rng, 'realistic', 'Test')
      expect(RACE_BACKGROUNDS[b.race]).toContain(b.background)
      expect(validate(b, 'realistic')).toEqual([])
    }
    const elf = randomBuild(rng, 'realistic', 'Test', { race: 'elf' })
    expect(validate({ ...elf, background: 'farmhand', skills: {} }, 'realistic')).toContain("Elves don't have the calling Farmhand. Pick another.")
  })
})
