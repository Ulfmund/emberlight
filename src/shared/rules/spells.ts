import { mod, skillLevelFromXp, type Rng } from './character'
import { d, resolveCheck, type CheckRequest, type CheckResult } from './checks'
import { applyEvent, type CampaignSettings, type GameEvent, type GameState } from './state'
import { TIER_INFO, type ConditionId, type Difficulty } from './tables'

/**
 * Spells, v1 (docs/spec/04-rules-system.md#spells-v1-simple): learned from a calling, a tome or
 * a teacher; each costs mana and is cast with a Spellcasting check. A natural 1 backfires.
 * In a fight the combat engine casts them (combat.ts); outside one, castSpell() does.
 */

export type SpellEffect = 'damage' | 'heal' | 'buff' | 'debuff' | 'utility'
export type School = 'storm' | 'flame' | 'frost' | 'shadow' | 'bone' | 'life' | 'grove' | 'earth' | 'moon' | 'mind' | 'rune'

export type Spell = {
  id: string
  name: string
  aliases: string[]
  school: School
  effect: SpellEffect
  cost: number
  /** Spellcasting level to cast it reliably (below it: disadvantage). */
  minLevel: number
  /** For spells that don't target a foe's Defense. */
  difficulty: Difficulty
  /** Damage or healing: [dice, sides, flat]; plus the caster's Arcane modifier. */
  dice?: [number, number, number]
  /** Hits every foe in the fight (one roll each). */
  area?: boolean
  /** Damage dealt heals the caster by half. */
  drain?: boolean
  /** Buffs: a condition on the caster, or a ward (+Defense for the rest of the fight). */
  condition?: ConditionId
  ward?: number
  /** Debuffs on a foe. */
  weaken?: number
  sleep?: boolean
  fear?: boolean
  /** Healing also stops these. */
  cures?: ConditionId[]
  /** Can be cast in a fight. */
  combat: boolean
  /** One line for the player. */
  blurb: string
  /** What it looks like, for the narrator. */
  looks: string
}

const s = (x: Omit<Spell, 'aliases' | 'difficulty'> & { aliases?: string[]; difficulty?: Difficulty }): Spell => ({ aliases: [], difficulty: 'moderate', ...x })

export const SPELLS: Spell[] = [
  // ---- harm -----------------------------------------------------------------------------
  s({ id: 'spark', name: 'Spark', aliases: ['shock', 'lightning bolt', 'zap'], school: 'storm', effect: 'damage', cost: 2, minLevel: 1, dice: [1, 8, 0], combat: true, blurb: '1d8 + Arcane lightning at one foe.', looks: 'a crack of blue-white lightning leaps from the fingertips' }),
  s({ id: 'firebolt', name: 'Firebolt', aliases: ['fire bolt', 'fireball', 'flame'], school: 'flame', effect: 'damage', cost: 4, minLevel: 3, dice: [2, 6, 0], combat: true, blurb: '2d6 + Arcane fire at one foe.', looks: 'a streak of roaring flame' }),
  s({ id: 'frost_shard', name: 'Frost Shard', aliases: ['ice shard', 'frost', 'ice'], school: 'frost', effect: 'damage', cost: 3, minLevel: 2, dice: [1, 10, 0], combat: true, blurb: '1d10 + Arcane: a spear of ice at one foe.', looks: 'a spear of ice that shatters on impact' }),
  s({ id: 'chain_lightning', name: 'Chain Lightning', aliases: ['chain lightning', 'storm'], school: 'storm', effect: 'damage', cost: 6, minLevel: 6, dice: [1, 8, 0], area: true, combat: true, blurb: '1d8 + Arcane at every foe.', looks: 'lightning that forks from foe to foe' }),
  s({ id: 'chill_touch', name: 'Chill Touch', aliases: ['grave chill', 'death touch', 'drain'], school: 'bone', effect: 'damage', cost: 2, minLevel: 1, dice: [1, 6, 0], drain: true, combat: true, blurb: '1d6 + Arcane at one foe; you heal half of it.', looks: 'a grey, freezing hand of spirit that steals warmth' }),
  s({ id: 'thorn_lash', name: 'Thorn Lash', aliases: ['thorns', 'vine whip', 'briars'], school: 'grove', effect: 'damage', cost: 2, minLevel: 1, dice: [1, 6, 1], combat: true, blurb: '1d6 + 1 + Arcane: a whip of thorns at one foe.', looks: 'a whip of living thorns that bursts from the ground' }),
  // ---- healing ---------------------------------------------------------------------------
  s({ id: 'mend', name: 'Mend', aliases: ['heal', 'healing touch', 'cure wounds', 'healing'], school: 'life', effect: 'heal', cost: 2, minLevel: 1, difficulty: 'easy', dice: [1, 8, 0], cures: ['bleeding'], combat: true, blurb: 'Heal 1d8 + Arcane, and stop bleeding.', looks: 'warm light knitting skin and flesh' }),
  s({ id: 'rejuvenate', name: 'Rejuvenate', aliases: ['greater heal', 'restoration'], school: 'life', effect: 'heal', cost: 5, minLevel: 5, dice: [3, 8, 0], cures: ['bleeding', 'poisoned'], combat: true, blurb: 'Heal 3d8 + Arcane, and cure bleeding and poison.', looks: 'a deep golden glow that drives out pain and poison' }),
  // ---- protection and courage ------------------------------------------------------------------
  s({ id: 'stoneskin', name: 'Stoneskin', aliases: ['stone skin', 'barkskin', 'shield'], school: 'earth', effect: 'buff', cost: 3, minLevel: 2, ward: 2, combat: true, blurb: '+2 Defense for the rest of the fight.', looks: 'skin turning grey and hard as river stone' }),
  s({ id: 'moonveil', name: 'Moonveil', aliases: ['moon veil', 'invisibility', 'veil', 'shadows'], school: 'moon', effect: 'buff', cost: 3, minLevel: 2, condition: 'hidden', ward: 2, combat: true, blurb: 'Out of a fight: hidden. In one: +2 Defense.', looks: 'a shimmer of silver that blurs the caster into the dark' }),
  s({ id: 'courage', name: 'Courage', aliases: ['bless', 'inspire', 'bravery'], school: 'mind', effect: 'buff', cost: 2, minLevel: 1, difficulty: 'easy', condition: 'inspired', cures: ['frightened'], combat: true, blurb: 'Advantage on your next check, and fear gone.', looks: 'a steadying warmth behind the ribs' }),
  // ---- curses ------------------------------------------------------------------------------
  s({ id: 'hex', name: 'Hex', aliases: ['curse', 'evil eye', 'jinx'], school: 'shadow', effect: 'debuff', cost: 2, minLevel: 1, weaken: 2, combat: true, blurb: 'A foe fights at −2 for the rest of the fight.', looks: 'a muttered curse that makes a foe stumble and doubt' }),
  s({ id: 'sleep', name: 'Sleep', aliases: ['slumber', 'lull'], school: 'moon', effect: 'debuff', cost: 4, minLevel: 3, sleep: true, combat: true, blurb: 'A weak or ordinary foe falls asleep (not a leader or a legend).', looks: 'a drift of silver dust and a heavy, sudden drowsiness' }),
  s({ id: 'fear', name: 'Dread', aliases: ['fear', 'terror', 'scare', 'frighten'], school: 'shadow', effect: 'debuff', cost: 3, minLevel: 3, fear: true, combat: true, blurb: 'A foe who knows fear runs from the fight.', looks: 'a wave of cold dread and whispering shadows' }),
  // ---- small magics ----------------------------------------------------------------------------
  s({ id: 'light', name: 'Light', aliases: ['glow', 'witchlight', 'lantern'], school: 'rune', effect: 'utility', cost: 1, minLevel: 1, difficulty: 'easy', combat: false, blurb: 'A steady light, for an hour.', looks: 'a soft, steady glow hanging in the air' }),
  s({ id: 'whisper', name: 'Whisper', aliases: ['message', 'sending'], school: 'mind', effect: 'utility', cost: 1, minLevel: 1, difficulty: 'easy', combat: false, blurb: 'Words only one person you can see will hear.', looks: 'words carried on a breath of air to one listener alone' }),
  s({ id: 'ward_rune', name: 'Ward Rune', aliases: ['alarm', 'ward', 'glyph'], school: 'rune', effect: 'utility', cost: 3, minLevel: 2, combat: false, blurb: 'A rune that wakes you when someone crosses it.', looks: 'a rune burned faintly into the ground, glowing and fading' })
]

export const spellById = (id: string | undefined) => SPELLS.find((x) => x.id === id)

/** A spell from what the story or the player calls it ("a firebolt", "Mend"). */
export function findSpell(name: string): Spell | undefined {
  const n = name.toLowerCase().trim()
  if (!n) return undefined
  const byId = SPELLS.find((x) => x.id === n)
  if (byId) return byId
  let best: { spell: Spell; len: number } | undefined
  for (const sp of SPELLS) {
    for (const a of [sp.name.toLowerCase(), ...sp.aliases]) {
      const re = new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
      if (re.test(n) && (!best || a.length > best.len)) best = { spell: sp, len: a.length }
    }
  }
  return best?.spell
}

export { STARTING_SPELLS, startingSpells } from './spellbook'

export const knownSpells = (st: GameState): Spell[] => (st.character.spells ?? []).map(spellById).filter((x): x is Spell => Boolean(x))

const spellLevel = (st: GameState) => skillLevelFromXp(st.character.skillXp.spellcasting ?? 0)

/** Damage or healing for a spell: its dice (doubled on a critical), Arcane, and a bonus every 4 levels. */
export function spellAmount(st: GameState, sp: Spell, crit: boolean, rng: Rng): number {
  if (!sp.dice) return 0
  const [n, sides, flat] = sp.dice
  let total = flat + mod(st.character.attributes.ARC) + Math.floor(spellLevel(st) / 4)
  for (let i = 0; i < n * (crit ? 2 : 1); i++) total += d(rng, sides)
  return Math.max(1, total)
}

/** The Spellcasting check for a spell (against a fixed DC, or a foe's Defense). */
export function spellCheck(st: GameState, sp: Spell, reason: string, against?: { dc: number; what: string }): CheckRequest {
  return {
    skill: 'spellcasting',
    difficulty: sp.difficulty,
    ...(against ? { dcOverride: against.dc, against: against.what } : {}),
    modifier: 0,
    advantage: spellLevel(st) < sp.minLevel ? 'disadvantage' : 'none',
    reason,
    dramatic: sp.cost >= 4,
    withStrangers: false,
    risk: { severity: 'none', source: 'magic' }
  }
}

/** A natural 1 with magic: something goes wrong (d4). */
export function backfire(rng: Rng): { events: GameEvent[]; line: string } {
  const r = d(rng, 4)
  if (r === 1) {
    const dmg = d(rng, 6)
    return { events: [{ type: 'damage', amount: dmg, source: 'magic', reason: 'the spell backfires' }], line: `BACKFIRE: the magic turns on the caster: ${dmg} damage.` }
  }
  if (r === 2) {
    const lost = d(rng, 4)
    return { events: [{ type: 'mana', delta: -lost }], line: `BACKFIRE: the spell drains more than it should: ${lost} more mana gone.` }
  }
  if (r === 3) return { events: [{ type: 'condition', id: 'frightened', on: true }], line: 'BACKFIRE: something looks back through the spell; the caster is shaken (frightened).' }
  return { events: [], line: 'BACKFIRE: the spell fizzles with a loud bang and a stink of smoke. Anyone nearby heard it.' }
}

/**
 * Casting outside a fight: healing, courage and veils work on the caster; small magics just work
 * (or don't); a harmful spell cast at nobody in particular is told as what it looks like.
 */
export function castSpell(
  state: GameState,
  settings: CampaignSettings,
  sp: Spell,
  rng: Rng
): { events: GameEvent[]; results: CheckResult[]; state: GameState; log: string[] } {
  const events: GameEvent[] = []
  const results: CheckResult[] = []
  const log: string[] = []
  let working = state
  const push = (ev: GameEvent) => {
    events.push(ev)
    working = applyEvent(working, ev, settings)
  }
  const done = () => ({ events, results, state: working, log })
  if (!(working.character.spells ?? []).includes(sp.id)) {
    log.push(`MAGIC: the character doesn't know ${sp.name}. Narrate them reaching for magic they don't have.`)
    return done()
  }
  if (working.character.mana < sp.cost) {
    log.push(`MAGIC: not enough mana for ${sp.name} (needs ${sp.cost}, has ${working.character.mana}). Nothing happens.`)
    return done()
  }
  push({ type: 'mana', delta: -sp.cost })
  const r = resolveCheck(working, settings, spellCheck(working, sp, `casting ${sp.name}`), rng)
  results.push(r.result)
  r.events.forEach(push)
  const tier = r.result.tier
  if (r.result.kept === 1) {
    const b = backfire(rng)
    b.events.forEach(push)
    log.push(`MAGIC: ${sp.name} (${sp.cost} mana) fails.`, b.line)
    return done()
  }
  if (!TIER_INFO[tier].success) {
    log.push(`MAGIC: ${sp.name} (${sp.cost} mana) fails; the mana is spent all the same.`)
    return done()
  }
  const crit = tier === 'crit_success'
  if (sp.effect === 'heal') {
    const amount = spellAmount(working, sp, crit, rng)
    push({ type: 'heal', amount, reason: sp.name })
    for (const c of sp.cures ?? []) if (working.character.conditions.includes(c)) push({ type: 'condition', id: c, on: false })
    log.push(`MAGIC: ${sp.name} works (${sp.looks}): ${amount} health back.`)
  } else if (sp.effect === 'buff' && sp.condition) {
    for (const c of sp.cures ?? []) if (working.character.conditions.includes(c)) push({ type: 'condition', id: c, on: false })
    push({ type: 'condition', id: sp.condition, on: true })
    log.push(`MAGIC: ${sp.name} works (${sp.looks}).`)
  } else {
    log.push(`MAGIC: ${sp.name} works: ${sp.looks}.${sp.effect === 'damage' || sp.effect === 'debuff' ? ' (Cast at no one in a fight: describe it, harmlessly or at a thing.)' : ''}`)
  }
  return done()
}
