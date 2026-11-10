import { maxHp, mod, type Rng } from './character'
import { d, defeatEvents, resolveCheck, type CheckRequest, type CheckResult } from './checks'
import { ENEMY_TIERS, enemyTemplate, findEnemy, HARM_FROM, TIER_MODS, TIER_WORDS, type Behavior, type EnemyFamily, type EnemyTier, type Loot } from './enemies'
import { ammoFor, defenseValue, mainWeapon } from './gear'
import { itemTemplate } from './items'
import { backfire, knownSpells, spellAmount, spellCheck, type Spell } from './spells'
import { applyEvent, type CampaignSettings, type CombatMode, type GameEvent, type GameState } from './state'
import { allyHealth, companionHp, companionStats, ROLE_INFO, standing, type Companion } from './party'
import type { Work } from './crafting'
import { TIER_INFO } from './tables'

/**
 * Turn-based combat (docs/spec/04-rules-system.md#combat). The engine owns every number: enemy
 * stat blocks come from templates, every attack is rolled, and the narrator describes what the
 * engine decided. One player message is one round: the player's action, their companions', and
 * every enemy's.
 */

export type FoeStatus = 'fighting' | 'fled' | 'down' | 'surrendered' | 'asleep'

/**
 * How far a foe is from the character (docs/spec/04-rules-system.md#range): close (within a
 * blade's reach), near (a few strides: a rush away) or far (a bowshot). Blades only reach the
 * close; bows and spells reach anyone, though shooting someone at your elbow is awkward.
 */
export const RANGES = ['close', 'near', 'far'] as const
export type Range = (typeof RANGES)[number]
export const RANGE_LABEL: Record<Range, string> = { close: 'Close', near: 'Near', far: 'Far' }
/** One step nearer. */
const nearer = (r: Range): Range => (r === 'far' ? 'near' : 'close')
/** Older fights had no range: everyone was within reach. */
export const rangeOf = (f: Pick<Foe, 'range'>): Range => f.range ?? 'close'

export type Foe = {
  id: string
  name: string
  template: string
  family: EnemyFamily
  tier: EnemyTier
  level: number
  hp: number
  maxHp: number
  defense: number
  attack: number
  damage: [number, number, number]
  initiative: number
  status: FoeStatus
  behavior: Behavior
  verb: string
  ranged?: boolean
  /** How far they are from the character (missing: close). */
  range?: Range
  xp: number
  loot: Loot[]
}

export type Combat = {
  id: string
  round: number
  foes: Foe[]
  playerInitiative: number
  /** Who was caught off guard in the first round. */
  surprise: 'player' | 'foes' | null
  /** The player is fighting defensively this round (+2 Defense). */
  dodging: boolean
  /** Defense from magic (a ward or stoneskin) for the rest of the fight. */
  ward?: number
}

/** What the Referee or the DM asks for. `kind` is free text ("cave bear"); the engine picks the template. */
export type FoeSpec = { kind: string; count?: number; tier?: EnemyTier; name?: string; strength?: 'weaker' | 'even' | 'stronger'; range?: Range }

export type CombatAction =
  | { kind: 'attack' | 'power' | 'cast'; target?: string; spell?: string }
  | { kind: 'defend' }
  /** Closing the gap to a foe at range; foes already in reach get a free swing. */
  | { kind: 'close_in'; target?: string }
  | { kind: 'flee' }
  | { kind: 'use_item'; item: string }
  | { kind: 'talk'; checks: CheckRequest[] }
  | { kind: 'surrender' }
  | { kind: 'other'; checks: CheckRequest[] }
  /** The player doesn't act this round (the first round of a fight someone else started). */
  | { kind: 'none' }

export type CombatOutcome = 'victory' | 'fled' | 'defeat' | 'truce' | 'ended'

/** What kind of thing the player is doing (the Referee's read of it). */
export type Intent = 'combat' | 'social' | 'explore' | 'travel' | 'rest' | 'gather' | 'craft' | 'other'

/** The Referee's call on an action outside a fight. */
export type RefereeCall = {
  checks: CheckRequest[]
  intent: Intent
  fight: { starts: boolean; foes: FoeSpec[]; playerAttacks: boolean; sneakAttack: boolean }
  /** Gathering or crafting: the engine rolls it and moves the items. */
  work?: Work
  /** A spell cast (its id): the engine rolls Spellcasting and applies it. */
  spell?: string
}

export const NO_FIGHT: RefereeCall['fight'] = { starts: false, foes: [], playerAttacks: false, sneakAttack: false }

/**
 * Everything decided about a turn before the dice are rolled, kept with the player's message
 * so a free reroll can roll the same turn again without asking the AI twice.
 */
export type TurnPlan = {
  /** In a fight: the player's move this round. */
  combat?: CombatAction
  /** Outside a fight: the Referee's call (null when it couldn't be asked). */
  ref?: RefereeCall | null
  /** The random event this turn brought, by id; null when none did. */
  event?: string | null
}

/** Mana for one attack spell. */
export const SPELL_COST = 2

/** Fights get a tracker in turn mode always; in mixed mode once they're more than one ordinary foe. */
export function shouldTrack(mode: CombatMode, foes: { tier: EnemyTier }[]): boolean {
  if (mode === 'narrative' || !foes.length) return false
  if (mode === 'turn') return true
  return foes.length >= 2 || foes.some((f) => f.tier === 'elite' || f.tier === 'boss')
}

let counter = 0
const cid = (p: string) => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Stat blocks for the foes asked for, scaled to the player's level and the foes' tier. */
export function buildFoes(specs: FoeSpec[], playerLevel: number, rng: Rng): Foe[] {
  const foes: Foe[] = []
  const bases: string[] = []
  for (const spec of specs.slice(0, 6)) {
    const tpl = findEnemy(spec.kind) ?? findEnemy(spec.name ?? '') ?? enemyTemplate('bandit')!
    const words = `${spec.kind} ${spec.name ?? ''}`
    const tier: EnemyTier = spec.tier && ENEMY_TIERS.includes(spec.tier) ? spec.tier : TIER_WORDS.boss.test(words) ? 'boss' : TIER_WORDS.elite.test(words) ? 'elite' : TIER_WORDS.minion.test(words) ? 'minion' : 'standard'
    const level = Math.max(1, playerLevel + (spec.strength === 'weaker' ? -2 : spec.strength === 'stronger' ? 2 : 0))
    const m = TIER_MODS[tier]
    const count = Math.max(1, Math.min(6, Math.round(spec.count ?? 1)))
    // A described kind ("cave bear") reads better than the template's name ("Bear"), but a plain
    // plural of the kind itself ("wolves") is just the kind ("Wolf").
    const raw = spec.kind
      .trim()
      .replace(/^(a|an|the|some|several|a few|a pair of|two|three|four|five|six|\d+)\s+/i, '')
      .replace(/\s+/g, ' ')
    const plain = !raw || [tpl.name, ...tpl.aliases].some((a) => a.toLowerCase() === raw.toLowerCase())
    const kindName = plain || raw.split(' ').length > 3 ? tpl.name : cap(count > 1 && /[^s]s$/i.test(raw) ? raw.slice(0, -1) : raw)
    const base = spec.name?.trim() || kindName || tpl.name
    for (let i = 0; i < count && foes.length < 8; i++) {
      const maxHp = Math.max(1, Math.round(tpl.hp * m.hp * (1 + 0.2 * (level - 1))))
      bases.push(base)
      foes.push({
        id: `f${foes.length + 1}`,
        name: base,
        template: tpl.id,
        family: tpl.family,
        tier,
        level,
        hp: maxHp,
        maxHp,
        defense: tpl.defense + m.defense + Math.floor((level - 1) / 3),
        attack: tpl.attack + m.attack + Math.floor((level - 1) / 2),
        damage: [tpl.damage[0], tpl.damage[1], Math.max(0, tpl.damage[2] + m.damage + Math.floor((level - 1) / 3))],
        initiative: d(rng, 20) + tpl.initiative,
        status: 'fighting',
        behavior: tpl.behavior,
        verb: tpl.verb,
        ranged: tpl.ranged,
        // Where the story put them; else archers keep their distance and the rest are at hand.
        range: spec.range && RANGES.includes(spec.range) ? spec.range : tpl.ranged ? 'near' : 'close',
        xp: Math.round(tpl.xp * m.xp * level),
        loot: tpl.loot
      })
    }
  }
  // Foes who share a name are numbered across the whole fight: Bandit 1, Bandit 2, Bandit 3.
  const total = new Map<string, number>()
  for (const b of bases) total.set(b, (total.get(b) ?? 0) + 1)
  const seen = new Map<string, number>()
  foes.forEach((f, i) => {
    const b = bases[i]
    if ((total.get(b) ?? 0) < 2) return
    seen.set(b, (seen.get(b) ?? 0) + 1)
    f.name = `${b} ${seen.get(b)}`
  })
  return foes
}

/** How a foe looks, in words (exact numbers are for the tracker). */
export function foeHealth(f: Foe): string {
  if (f.status === 'fled') return 'fled'
  if (f.status === 'surrendered') return 'surrendered'
  if (f.status === 'asleep') return 'asleep'
  if (f.status === 'down' || f.hp <= 0) return 'down'
  const r = f.hp / f.maxHp
  return r >= 1 ? 'unhurt' : r > 0.7 ? 'scratched' : r > 0.4 ? 'hurt' : 'badly hurt'
}

const fighting = (st: GameState) => (st.combat?.foes ?? []).filter((f) => f.status === 'fighting')

/**
 * Starts a fight. If the player strikes first unseen, their Stealth against the foes' best
 * Perception decides whether the foes are caught off guard; if the foes ambush, the player's
 * Perception against their Stealth does.
 */
export function startCombat(
  state: GameState,
  settings: CampaignSettings,
  foes: Foe[],
  rng: Rng,
  opts: { playerAmbushes?: boolean; foesAmbush?: boolean } = {}
): { events: GameEvent[]; results: CheckResult[]; state: GameState; log: string[] } {
  const c = state.character
  const events: GameEvent[] = []
  const results: CheckResult[] = []
  const log: string[] = []
  let working = state
  const push = (ev: GameEvent) => {
    events.push(ev)
    working = applyEvent(working, ev, settings)
  }
  let surprise: Combat['surprise'] = null
  const best = (k: 'stealth' | 'perception') => Math.max(...foes.map((f) => enemyTemplate(f.template)?.[k] ?? 0))
  if (opts.playerAmbushes) {
    const req: CheckRequest = { skill: 'stealth', difficulty: 'moderate', dcOverride: 10 + best('perception'), against: "the foes' watchfulness", modifier: 0, advantage: 'none', reason: 'striking unseen', dramatic: true, withStrangers: false, risk: { severity: 'none', source: 'environment' } }
    const r = resolveCheck(working, settings, req, rng)
    results.push(r.result)
    r.events.forEach(push)
    if (TIER_INFO[r.result.tier].success) surprise = 'foes'
    log.push(surprise ? 'The character strikes unseen: the foes are caught off guard and lose the first round.' : 'The foes notice the character in time: no surprise.')
  } else if (opts.foesAmbush) {
    const req: CheckRequest = { skill: 'perception', difficulty: 'moderate', dcOverride: 10 + best('stealth'), against: 'an ambush', modifier: 0, advantage: 'none', reason: 'something is wrong', dramatic: false, withStrangers: false, risk: { severity: 'none', source: 'environment' }, hidden: true }
    const r = resolveCheck(working, settings, req, rng)
    results.push(r.result)
    r.events.forEach(push)
    if (!TIER_INFO[r.result.tier].success) surprise = 'player'
    log.push(surprise ? 'AMBUSH: the character is caught off guard; the foes will strike first.' : 'AMBUSH: the character senses it just in time and is ready.')
  }
  const playerInitiative = d(rng, 20) + mod(c.attributes.AGI) + mod(c.attributes.WIT)
  const combat: Combat = { id: cid('cmb'), round: 1, foes, playerInitiative, surprise, dodging: false }
  push({ type: 'combat_start', combat })
  return { events, results, state: working, log }
}

function rollLoot(loot: Loot[], rng: Rng): { coins: number; items: { name: string; qty: number }[] } {
  let coins = 0
  const items: { name: string; qty: number }[] = []
  for (const l of loot) {
    if (rng() >= l.chance) continue
    if (l.coins) coins += l.coins[0] + Math.floor(rng() * (l.coins[1] - l.coins[0] + 1))
    if (l.item) {
      const qty = l.qty ? l.qty[0] + Math.floor(rng() * (l.qty[1] - l.qty[0] + 1)) : 1
      const known = items.find((x) => x.name === l.item)
      if (known) known.qty += qty
      else items.push({ name: l.item, qty })
    }
  }
  return { coins, items }
}

const rollDice = (n: number, sides: number, rng: Rng) => {
  let t = 0
  for (let i = 0; i < n; i++) t += d(rng, sides)
  return t
}

/**
 * One round of a fight: foes faster than the player act first, then the player, then the rest.
 * Returns the events, the player's rolls (for the dice tray), and a log for the narrator.
 */
export function resolveRound(
  state: GameState,
  settings: CampaignSettings,
  action: CombatAction,
  rng: Rng
): { events: GameEvent[]; results: CheckResult[]; state: GameState; log: string[]; outcome?: CombatOutcome } {
  const events: GameEvent[] = []
  const results: CheckResult[] = []
  const log: string[] = []
  let working = state
  let outcome: CombatOutcome | undefined
  const push = (ev: GameEvent) => {
    events.push(ev)
    working = applyEvent(working, ev, settings)
  }
  const combat = state.combat
  if (!combat) return { events, results, state, log }
  const round = combat.round
  const end = (o: CombatOutcome) => {
    if (!outcome) {
      outcome = o
      push({ type: 'combat_end', outcome: o })
    }
  }
  const over = () => Boolean(outcome) || working.character.status !== 'alive'

  // ---- a foe's turn -------------------------------------------------------------------
  const foeTurn = (id: string) => {
    if (over()) return
    const f = working.combat?.foes.find((x) => x.id === id)
    if (!f || f.status !== 'fighting') return
    const ratio = f.hp / f.maxHp
    const group = working.combat?.foes.length ?? 0
    const alone = fighting(working).length === 1 && group > 1
    // A group that has lost half its number may break, the weak and the timid first.
    const broken = group >= 2 && fighting(working).length <= group / 2
    const nerve = { cowardly: 0.5, cautious: 0.3, aggressive: 0.1, fearless: 0 }[f.behavior] * (f.tier === 'elite' || f.tier === 'boss' ? 0.5 : 1)
    const giveUp = (): 'fled' | 'surrendered' => (f.family === 'humanoid' && rng() < 0.5 ? 'surrendered' : 'fled')
    // Courage: the cowardly run when hurt, the cautious give up, the lone survivors break.
    let leave: 'fled' | 'surrendered' | null = null
    if (f.behavior === 'cowardly' && ratio < 0.5 && rng() < 0.6) leave = 'fled'
    else if (f.behavior === 'cautious' && ratio < 0.3) leave = f.family === 'humanoid' && rng() < 0.5 ? 'surrendered' : rng() < 0.5 ? 'fled' : null
    else if (f.behavior === 'aggressive' && ratio < 0.2 && rng() < 0.4) leave = 'fled'
    else if (f.behavior !== 'fearless' && alone && ratio < 0.5 && (f.tier === 'minion' || f.tier === 'standard') && rng() < 0.5) leave = giveUp()
    else if (broken && nerve > 0 && rng() < nerve) leave = giveUp()
    if (leave) {
      push({ type: 'foe_status', id: f.id, status: leave, name: f.name })
      log.push(`${f.name} ${leave === 'fled' ? 'breaks and flees' : 'throws down their weapon and yields'}.`)
      return
    }
    // A foe who fights hand to hand spends the turn closing in when they're not yet in reach.
    if (!f.ranged && rangeOf(f) !== 'close') {
      const to = nearer(rangeOf(f))
      push({ type: 'foe_move', id: f.id, range: to, name: f.name })
      log.push(`${f.name} closes in (now ${to}).`)
      return
    }
    // Who it goes for: mostly the character; fighters draw blows, archers and mages hang back.
    const lvl = working.character.level
    const allies = standing(working.party)
    if (allies.length) {
      const draws = allies.map((a) => companionStats(a.role, lvl).draw)
      let r = rng() * (2 + draws.reduce((n, w) => n + w, 0)) - 2
      for (let i = 0; i < allies.length && r >= 0; i++) {
        if (r < draws[i]) return void foeOnAlly(f, allies[i])
        r -= draws[i]
      }
    }
    strikeCharacter(f)
  }

  /** A foe's blow at the character (`why`: a free swing as they move past). */
  const strikeCharacter = (f: Foe, why = '') => {
    const c = working.character
    const def = defenseValue(c, (working.combat?.dodging ? 2 : 0) + (working.combat?.ward ?? 0)).total
    const roll = d(rng, 20)
    const total = roll + f.attack
    const crit = roll === 20
    const hit = roll !== 1 && (crit || total >= def)
    let damage = 0
    if (hit) damage = Math.max(1, rollDice(f.damage[0] * (crit ? 2 : 1), f.damage[1], rng) + f.damage[2])
    push({ type: 'foe_attack', id: f.id, roll, total, defense: def, hit, crit, damage, name: f.name })
    if (!hit) {
      log.push(`${f.name} ${f.verb} the character${why}: rolled ${roll} + ${f.attack} = ${total} vs Defense ${def}: MISS${roll === 1 ? ' (a natural 1)' : ''}.`)
      return
    }
    push({ type: 'damage', amount: damage, source: HARM_FROM[f.family], reason: `${f.name} ${f.verb.replace(/ (at|for)$/, '')} you` })
    const max = derivedMax(working, settings)
    log.push(`${f.name} ${f.verb} the character${why}: rolled ${roll} + ${f.attack} = ${total} vs Defense ${def}: ${crit ? 'CRITICAL HIT' : 'HIT'}, ${damage} damage (the character now has ${Math.max(0, working.character.hp)}/${max} health).`)
    for (const ev of defeatEvents(working, settings, HARM_FROM[f.family], rng)) push(ev)
    const after = working.character
    if (after.status !== 'alive' || after.conditions.includes('captured')) {
      log.push(after.status === 'dead' ? 'The character is killed.' : after.status === 'downed' ? 'The character falls, unconscious and dying.' : 'The character is overpowered and taken prisoner.')
      const up = standing(working.party)
      if (up.length) log.push(`Still on their feet: ${up.map((a) => a.name).join(', ')}. What they do now is for the story to tell.`)
      end('defeat')
    }
  }

  /** A foe's blow at one of the character's companions. */
  const foeOnAlly = (f: Foe, a: Companion) => {
    const lvl = working.character.level
    const def = companionStats(a.role, lvl).defense
    const roll = d(rng, 20)
    const total = roll + f.attack
    const crit = roll === 20
    const hit = roll !== 1 && (crit || total >= def)
    const damage = hit ? Math.max(1, rollDice(f.damage[0] * (crit ? 2 : 1), f.damage[1], rng) + f.damage[2]) : 0
    push({ type: 'foe_attack', id: f.id, roll, total, defense: def, hit, crit, damage, name: f.name, target: a.id })
    if (!hit) return void log.push(`${f.name} ${f.verb} ${a.name}: rolled ${roll} + ${f.attack} = ${total} vs Defense ${def}: MISS${roll === 1 ? ' (a natural 1)' : ''}.`)
    push({ type: 'ally_hit', id: a.id, amount: damage, name: a.name })
    const now = working.party.find((x) => x.id === a.id)
    log.push(`${f.name} ${f.verb} ${a.name}: rolled ${roll} + ${f.attack} = ${total} vs Defense ${def}: ${crit ? 'CRITICAL HIT' : 'HIT'}, ${damage} damage. ${a.name} is now ${now ? allyHealth(now, lvl) : 'down'}${now?.down ? ', knocked out of the fight' : ''}.`)
  }

  // ---- a companion's turn (the engine plays them, by their role) ------------------------------
  const playerTarget = action.kind === 'attack' || action.kind === 'power' || action.kind === 'cast' ? action.target : undefined
  const allyTurn = (id: string) => {
    if (over()) return
    const a = working.party?.find((x) => x.id === id)
    if (!a || a.down) return
    const foes = fighting(working)
    if (!foes.length) return
    const lvl = working.character.level
    const st = companionStats(a.role, lvl)
    // A healer first tends whoever is worst hurt, if anyone is below half.
    if (st.heal) {
      const pcMax = derivedMax(working, settings)
      const hurt = [
        ...(working.character.status === 'alive' ? [{ id: '', name: 'the character', share: working.character.hp / pcMax }] : []),
        ...working.party.filter((x) => x.id !== a.id && !x.down).map((x) => ({ id: x.id, name: x.name, share: companionHp(x, lvl) / companionStats(x.role, lvl).maxHp }))
      ]
        .filter((h) => h.share < 0.5)
        .sort((x, y) => x.share - y.share)[0]
      if (hurt) {
        const amount = Math.max(1, rollDice(st.heal[0], st.heal[1], rng) + st.heal[2])
        if (hurt.id) push({ type: 'ally_heal', id: hurt.id, amount, name: hurt.name })
        else push({ type: 'heal', amount, reason: `${a.name} tends you` })
        return void log.push(`${a.name} (companion, ${ROLE_INFO[a.role].label.toLowerCase()}) tends ${hurt.id ? hurt.name : 'the character'}: ${amount} health back.`)
      }
    }
    // The rest go for the character's target, or else the foe nearest to falling.
    const target = foes.find((f) => f.id === playerTarget) ?? [...foes].sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0]
    const roll = d(rng, 20)
    const total = roll + st.attack
    const crit = roll === 20
    const hit = roll !== 1 && (crit || total >= target.defense)
    const who = `${a.name} (companion, ${ROLE_INFO[a.role].label.toLowerCase()})`
    if (!hit) return void log.push(`${who} ${st.verb} ${target.name}: rolled ${roll} + ${st.attack} = ${total} vs Defense ${target.defense}: MISS.`)
    const damage = Math.max(1, rollDice(st.damage[0] * (crit ? 2 : 1), st.damage[1], rng) + st.damage[2])
    push({ type: 'foe_hit', id: target.id, amount: damage, name: target.name, by: a.name })
    const now = working.combat?.foes.find((f) => f.id === target.id)
    log.push(`${who} ${st.verb} ${target.name}: rolled ${roll} + ${st.attack} = ${total} vs Defense ${target.defense}: ${crit ? 'CRITICAL HIT' : 'HIT'}, ${damage} damage. ${target.name} is now ${now ? foeHealth(now) : 'down'}.`)
    if (now?.status === 'down') push({ type: 'xp', amount: now.xp, reason: `${a.name} felled ${now.name}` })
  }

  // ---- a known spell, cast in the fight ---------------------------------------------------
  const castKnown = (sp: Spell, targetId?: string) => {
    const foes = fighting(working)
    const target = foes.find((f) => f.id === targetId) ?? foes.find((f) => f.name.toLowerCase() === (targetId ?? '').toLowerCase()) ?? foes[0]
    if (!sp.combat) return void log.push(`${sp.name} is no use in a fight; the character hesitates.`)
    if (working.character.mana < sp.cost) return void log.push(`The character reaches for ${sp.name}, but hasn't the mana (needs ${sp.cost}, has ${working.character.mana}). Nothing happens.`)
    push({ type: 'mana', delta: -sp.cost })
    const unseen = combat.surprise === 'foes' && round === 1
    const roll = (against?: Foe) => {
      const req = spellCheck(working, sp, against ? `${sp.name} at ${against.name}` : `casting ${sp.name}`, against ? { dc: against.defense, what: `${against.name}'s Defense` } : undefined)
      if (unseen && against && req.advantage === 'none') req.advantage = 'advantage'
      const r = resolveCheck(working, settings, req, rng)
      results.push(r.result)
      r.events.forEach(push)
      return r.result
    }
    const said = (res: CheckResult) => `rolled ${res.kept} + ${res.bonus} = ${res.total} vs ${res.dc}: ${TIER_INFO[res.tier].label.toUpperCase()}`
    /** A natural 1 backfires (and a backfire can drop the caster). */
    const fumbled = (res: CheckResult, what: string) => {
      if (res.kept !== 1) return false
      const b = backfire(rng)
      log.push(`The character casts ${what}: ${said(res)}.`, b.line)
      b.events.forEach(push)
      for (const ev of defeatEvents(working, settings, 'magic', rng)) push(ev)
      if (working.character.status !== 'alive') end('defeat')
      return true
    }
    switch (sp.effect) {
      case 'damage': {
        for (const t of sp.area ? foes : target ? [target] : []) {
          if (over()) return
          const res = roll(t)
          if (fumbled(res, `${sp.name} at ${t.name}`)) return
          if (!TIER_INFO[res.tier].success) {
            log.push(`The character casts ${sp.name} at ${t.name}: ${said(res)}, a miss.`)
            continue
          }
          const dmg = spellAmount(working, sp, res.tier === 'crit_success', rng)
          push({ type: 'foe_hit', id: t.id, amount: dmg, name: t.name })
          const now = working.combat?.foes.find((f) => f.id === t.id)
          log.push(`The character casts ${sp.name} at ${t.name} (${sp.looks}): ${said(res)}, ${dmg} damage. ${t.name} is now ${now ? foeHealth(now) : 'down'}.`)
          if (now?.status === 'down') push({ type: 'xp', amount: now.xp, reason: `Defeated ${now.name}` })
          if (sp.drain) {
            const back = Math.max(1, Math.floor(dmg / 2))
            push({ type: 'heal', amount: back, reason: sp.name })
            log.push(`The stolen warmth flows into the caster: ${back} health back.`)
          }
        }
        return
      }
      case 'heal':
      case 'buff': {
        const res = roll()
        if (fumbled(res, sp.name)) return
        if (!TIER_INFO[res.tier].success) return void log.push(`The character tries ${sp.name}: ${said(res)}; the magic slips away.`)
        for (const cond of sp.cures ?? []) if (working.character.conditions.includes(cond)) push({ type: 'condition', id: cond, on: false })
        if (sp.effect === 'heal') {
          const amount = spellAmount(working, sp, res.tier === 'crit_success', rng)
          push({ type: 'heal', amount, reason: sp.name })
          return void log.push(`The character casts ${sp.name} (${sp.looks}): ${said(res)}, ${amount} health back.`)
        }
        if (sp.ward) push({ type: 'combat_ward', amount: sp.ward })
        if (sp.condition && sp.condition !== 'hidden') push({ type: 'condition', id: sp.condition, on: true })
        return void log.push(`The character casts ${sp.name} (${sp.looks}): ${said(res)}${sp.ward ? `, +${sp.ward} Defense for the rest of the fight` : ''}.`)
      }
      case 'debuff': {
        if (!target) return
        if (sp.sleep && (target.tier === 'elite' || target.tier === 'boss' || target.family === 'undead')) return void log.push(`The character casts ${sp.name} at ${target.name}, but ${target.family === 'undead' ? 'the dead do not sleep' : 'their will is too strong'}: it shrugs the spell off.`)
        if (sp.fear && target.behavior === 'fearless') return void log.push(`The character casts ${sp.name} at ${target.name}, who doesn't know fear: nothing happens.`)
        const res = roll(target)
        if (fumbled(res, `${sp.name} at ${target.name}`)) return
        if (!TIER_INFO[res.tier].success) return void log.push(`The character casts ${sp.name} at ${target.name}: ${said(res)}; it doesn't take hold.`)
        if (sp.weaken) {
          push({ type: 'foe_weaken', id: target.id, attack: -sp.weaken, name: target.name })
          log.push(`The character casts ${sp.name} at ${target.name} (${sp.looks}): ${said(res)}. ${target.name} fights at −${sp.weaken} for the rest of the fight.`)
        } else if (sp.sleep) {
          push({ type: 'foe_status', id: target.id, status: 'asleep', name: target.name })
          push({ type: 'xp', amount: target.xp, reason: `Put ${target.name} to sleep` })
          log.push(`The character casts ${sp.name} at ${target.name} (${sp.looks}): ${said(res)}. ${target.name} slumps down, fast asleep.`)
        } else if (sp.fear) {
          push({ type: 'foe_status', id: target.id, status: 'fled', name: target.name })
          log.push(`The character casts ${sp.name} at ${target.name} (${sp.looks}): ${said(res)}. ${target.name} breaks and runs in terror.`)
        }
        return
      }
      default:
        log.push(`${sp.name} is no use in a fight; the character hesitates.`)
    }
  }

  // ---- closing the gap ------------------------------------------------------------------
  /** The character moves toward a foe at range; anyone already in reach swings as they go. */
  const closeIn = (target: Foe, why: string) => {
    for (const f of fighting(working)) {
      if (over()) return
      if (f.id === target.id || f.ranged || rangeOf(f) !== 'close') continue
      strikeCharacter(f, ' as they break away (a free swing)')
    }
    if (over()) return
    const to = nearer(rangeOf(target))
    push({ type: 'foe_move', id: target.id, range: to, name: target.name })
    log.push(`${why}The character closes in on ${target.name} (now ${to}${to === 'close' ? ', within reach' : ''}).`)
  }

  // ---- the player's turn --------------------------------------------------------------
  const playerTurn = () => {
    if (over()) return
    const c = working.character
    const foes = fighting(working)
    // A character who knows spells casts one of them (the chosen one, else their best attack).
    if (action.kind === 'cast') {
      const known = knownSpells(working)
      const sp = known.find((k) => k.id === action.spell) ?? known.find((k) => k.combat && k.effect === 'damage') ?? known.find((k) => k.combat)
      if (sp) return castKnown(sp, action.target)
    }
    switch (action.kind) {
      case 'attack':
      case 'power':
      case 'cast': {
        const target = foes.find((f) => f.id === action.target) ?? foes.find((f) => f.name.toLowerCase() === (action.target ?? '').toLowerCase()) ?? foes[0]
        if (!target) return
        let weapon: { name: string; dice: [number, number]; skill: 'melee' | 'ranged' | 'spellcasting'; attr: 'STR' | 'AGI' | 'ARC'; ammo?: 'arrow' | 'bolt' | 'stone'; unarmed?: boolean } = mainWeapon(c)
        if (action.kind === 'cast') {
          // A plain attack spell: 2 mana for 1d8 + Arcane.
          if (c.mana < SPELL_COST) {
            log.push(`The character reaches for magic, but has no mana left (${c.mana}). Nothing happens.`)
            return
          }
          push({ type: 'mana', delta: -SPELL_COST })
          weapon = { name: 'a spell', dice: [1, 8], skill: 'spellcasting', attr: 'ARC' }
        } else if (weapon.ammo) {
          const ammo = ammoFor(c, weapon.ammo)
          if (ammo) push({ type: 'item', name: ammo.name, delta: -1, spent: true })
          else {
            log.push(`The character has no ${weapon.ammo === 'stone' ? 'stones' : `${weapon.ammo}s`} left and has to make do in close.`)
            weapon = { name: `the ${weapon.name.toLowerCase()} as a club`, dice: [1, 3], skill: 'melee', attr: 'STR', unarmed: true }
          }
        }
        // A blade only reaches someone close: swinging at a foe further off means closing in first.
        if (weapon.skill === 'melee' && rangeOf(target) !== 'close') {
          return closeIn(target, `${target.name} is too far off to reach (${rangeOf(target)}). `)
        }
        const power = action.kind === 'power' && working.character.stamina >= 2
        // Shooting someone at your elbow is awkward.
        const pointBlank = weapon.skill === 'ranged' && rangeOf(target) === 'close'
        const req: CheckRequest = {
          skill: weapon.skill,
          difficulty: 'moderate',
          dcOverride: target.defense,
          against: `${target.name}'s Defense`,
          modifier: 0,
          advantage: combat.surprise === 'foes' && round === 1 ? 'advantage' : pointBlank ? 'disadvantage' : 'none',
          reason: `${power ? 'a powerful blow' : 'attacking'} ${target.name}${pointBlank ? ' (shooting at close quarters)' : ''}`,
          dramatic: target.tier === 'elite' || target.tier === 'boss',
          withStrangers: false,
          risk: { severity: 'none', source: 'environment' }
        }
        const r = resolveCheck(working, settings, req, rng)
        results.push(r.result)
        r.events.forEach(push)
        if (power) push({ type: 'stamina', delta: -2 })
        const tier = r.result.tier
        const verb = action.kind === 'cast' ? `hurls a spell at ${target.name}` : weapon.unarmed ? `strikes at ${target.name} with ${weapon.name}` : `attacks ${target.name} with ${weapon.name}`
        if (!TIER_INFO[tier].success) {
          log.push(`The character ${verb}${power ? ' (a power attack)' : ''}: rolled ${r.result.kept} + ${r.result.bonus} = ${r.result.total} vs Defense ${target.defense}: ${TIER_INFO[tier].label.toUpperCase()}, a miss.`)
          return
        }
        const crit = tier === 'crit_success'
        const attrMod = mod(working.character.attributes[weapon.attr])
        const dice = weapon.dice[0] * (crit ? 2 : 1) + (power ? 1 : 0)
        const damage = Math.max(1, rollDice(dice, weapon.dice[1], rng) + attrMod + (tier === 'overwhelming' ? 2 : 0))
        push({ type: 'foe_hit', id: target.id, amount: damage, name: target.name })
        const now = working.combat?.foes.find((f) => f.id === target.id)
        log.push(`The character ${verb}${power ? ' (a power attack)' : ''}: rolled ${r.result.kept} + ${r.result.bonus} = ${r.result.total} vs Defense ${target.defense}: ${TIER_INFO[tier].label.toUpperCase()}, ${damage} damage. ${target.name} is now ${now ? foeHealth(now) : 'down'}.`)
        if (now && now.status === 'down') push({ type: 'xp', amount: now.xp, reason: `Defeated ${now.name}` })
        return
      }
      case 'close_in': {
        const target = foes.find((f) => f.id === action.target) ?? [...foes].sort((x, y) => RANGES.indexOf(rangeOf(x)) - RANGES.indexOf(rangeOf(y))).find((f) => rangeOf(f) !== 'close')
        if (!target || rangeOf(target) === 'close') return void log.push(`The character is already within reach${target ? ` of ${target.name}` : ''}.`)
        return closeIn(target, '')
      }
      case 'defend': {
        push({ type: 'combat_dodge' })
        if (c.stamina > 0) push({ type: 'stamina', delta: -1 })
        log.push('The character fights defensively, guarding and dodging (+2 Defense this round).')
        return
      }
      case 'flee': {
        const beasts = foes.some((f) => f.family === 'beast')
        // Easier with nobody in reach.
        const clear = !foes.some((f) => rangeOf(f) === 'close')
        const req: CheckRequest = { skill: 'athletics', difficulty: beasts ? 'hard' : 'moderate', modifier: 0, advantage: clear ? 'advantage' : 'none', reason: clear ? 'breaking away to flee, with nobody in reach' : 'breaking away to flee', dramatic: true, withStrangers: false, risk: { severity: 'none', source: 'environment' } }
        const r = resolveCheck(working, settings, req, rng)
        results.push(r.result)
        r.events.forEach(push)
        if (TIER_INFO[r.result.tier].success) {
          log.push(`The character tries to flee: ${TIER_INFO[r.result.tier].label.toUpperCase()}. They get away${standing(working.party).length ? ', and their companions with them' : ''}.`)
          end('fled')
        } else log.push(`The character tries to flee: ${TIER_INFO[r.result.tier].label.toUpperCase()}. They can't break away.`)
        return
      }
      case 'use_item': {
        const item = c.inventory.find((i) => i.name.toLowerCase() === action.item.toLowerCase())
        const tpl = item ? itemTemplate(item.template) : undefined
        if (!item || !tpl || !(tpl.heal || tpl.cures?.length || tpl.food)) {
          log.push(`The character fumbles for ${action.item}, but it's no use here.`)
          return
        }
        const heal = tpl.heal ? tpl.heal[2] + rollDice(tpl.heal[0], tpl.heal[1], rng) : undefined
        push({ type: 'use_item', name: item.name, heal })
        log.push(`The character uses ${item.name}${heal ? `, recovering ${heal} health` : ''}.`)
        return
      }
      case 'talk':
      case 'other': {
        let success = false
        for (const req of action.checks.slice(0, 1)) {
          const r = resolveCheck(working, settings, { ...req, risk: { severity: 'none', source: 'environment' } }, rng)
          results.push(r.result)
          r.events.forEach(push)
          success = TIER_INFO[r.result.tier].success
          log.push(`The character tries ${req.reason}: ${TIER_INFO[r.result.tier].label.toUpperCase()}.`)
        }
        if (action.kind === 'talk' && success && foes.length && foes.every((f) => f.family === 'humanoid')) {
          const beaten = foes.reduce((n, f) => n + f.hp, 0) / foes.reduce((n, f) => n + f.maxHp, 0) < 0.6
          const timid = foes.every((f) => f.behavior !== 'fearless')
          if (beaten || timid) {
            for (const f of foes) push({ type: 'foe_status', id: f.id, status: 'surrendered', name: f.name })
            log.push('The foes lower their weapons: the fight is over.')
            end('truce')
          } else log.push("The words land, but the foes won't stand down yet.")
        }
        if (!action.checks.length) log.push('The character acts; it changes nothing the dice need to decide.')
        return
      }
      case 'none':
        return
      case 'surrender': {
        if (foes.some((f) => f.family === 'humanoid')) {
          push({ type: 'condition', id: 'captured', on: true })
          log.push('The character yields and is taken prisoner.')
          end('defeat')
        } else log.push("The character tries to yield, but these foes don't take prisoners.")
        return
      }
    }
  }

  // ---- the round, in order ---------------------------------------------------------------
  log.push(`Round ${round}.`)
  const order = fighting(working).map((f) => f.id)
  const foesFirst = combat.surprise === 'player' && round === 1 ? order : order.filter((id) => (combat.foes.find((f) => f.id === id)?.initiative ?? 0) > combat.playerInitiative)
  const foesAfter = combat.surprise === 'foes' && round === 1 ? [] : order.filter((id) => !foesFirst.includes(id))
  for (const id of foesFirst) foeTurn(id)
  playerTurn()
  // Companions act after the character: not when caught off guard, nor while the character
  // talks, yields or simply waits.
  const allies = standing(working.party).map((a) => a.id)
  const holdBack = (combat.surprise === 'player' && round === 1) || action.kind === 'talk' || action.kind === 'surrender' || action.kind === 'none'
  if (allies.length && holdBack && !over() && action.kind === 'talk') log.push('The companions hold back while the character talks.')
  if (!holdBack) for (const id of allies) allyTurn(id)
  for (const id of foesAfter) foeTurn(id)

  if (!over() && working.combat && !fighting(working).length) {
    // Victory: what the fallen carried.
    const fallen = working.combat.foes.filter((f) => f.status === 'down' || f.status === 'asleep')
    let coins = 0
    const items: { name: string; qty: number }[] = []
    for (const f of fallen) {
      const l = rollLoot(f.loot, rng)
      coins += l.coins
      for (const it of l.items) {
        const known = items.find((x) => x.name === it.name)
        if (known) known.qty += it.qty
        else items.push(it)
      }
    }
    if (coins) push({ type: 'coins', delta: coins })
    for (const it of items) push({ type: 'item', name: it.name, delta: it.qty })
    const spoils = coins || items.length ? ` On the fallen: ${[coins ? `${coins} copper` : '', ...items.map((i) => `${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}`)].filter(Boolean).join(', ')}.` : ''
    log.push(fallen.length ? `THE FIGHT IS WON.${spoils}` : 'THE FIGHT IS OVER: the foes have fled or yielded.')
    end('victory')
  } else if (!over()) {
    push({ type: 'combat_round', round: round + 1 })
  }
  if (working.combat || outcome) {
    const st = (outcome ? state.combat : working.combat)?.foes.map((f) => {
      const cur = working.combat?.foes.find((x) => x.id === f.id) ?? f
      return `${cur.name}: ${foeHealth(cur)}`
    })
    const lvl = working.character.level
    const friends = (working.party ?? []).map((a) => `${a.name} (companion): ${allyHealth(a, lvl)}`)
    if (st && !outcome) log.push(`Where things stand: ${[...st, ...friends].join('; ')}.`)
  }
  return { events, results, state: working, log, outcome }
}

/** The character's maximum health (as derived() works it out). */
function derivedMax(st: GameState, settings: CampaignSettings) {
  const c = st.character
  return maxHp(c.build.sex, settings.sexModifiers, c.attributes.END, c.level)
}

/** "Bandit 1, Bandit 2 and an elite Bear": who a fight is against, for the DM. */
export function foeRoster(foes: Foe[]): string {
  const names = foes.map((f) => `${f.tier === 'elite' || f.tier === 'boss' ? `${f.name} (${f.tier})` : f.name}${f.ranged ? ', at range' : ''}`)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? 'nobody')
}

/**
 * When the Referee can't be asked (an error, or no model), a rough guess at the player's move
 * from their words. Anything unclear is an attack: in a fight, that's what people mostly mean.
 */
export function guessCombatAction(text: string): CombatAction {
  const t = text.toLowerCase()
  if (/(surrender|yield|give up|i give in)/.test(t)) return { kind: 'surrender' }
  if (/(flee|run|escape|retreat|bolt|get away)/.test(t)) return { kind: 'flee' }
  if (/(block|parry|dodge|defend|guard|duck|cover)/.test(t)) return { kind: 'defend' }
  if (/(spell|cast|magic|incant)/.test(t)) return { kind: 'cast' }
  return { kind: 'attack' }
}

/** A combat action in a few words ("attack Wolf 2"), for the player's message and notices. */
export function actionLabel(action: CombatAction, st?: GameState): string {
  const foe = (id?: string) => st?.combat?.foes.find((f) => f.id === id)?.name ?? id ?? 'the nearest foe'
  switch (action.kind) {
    case 'attack':
      return `attack ${foe(action.target)}`
    case 'power':
      return `a power attack on ${foe(action.target)}`
    case 'cast':
      return `a spell at ${foe(action.target)}`
    case 'defend':
      return 'fighting defensively'
    case 'close_in':
      return `closing in on ${foe(action.target)}`
    case 'flee':
      return 'trying to flee'
    case 'use_item':
      return `using ${action.item}`
    case 'talk':
      return 'talking'
    case 'surrender':
      return 'surrendering'
    case 'other':
      return 'something else'
    case 'none':
      return 'waiting'
  }
}

/** One line per foe for the DM: who's still in it. */
export function combatSummary(st: GameState): string {
  const cb = st.combat
  if (!cb) return ''
  return cb.foes.map((f) => `${f.name} (${f.id}, ${f.tier !== 'standard' ? `${f.tier} ` : ''}${enemyTemplate(f.template)?.name.toLowerCase() ?? f.template}, ${rangeOf(f)}${f.ranged ? ', shoots' : ''}): ${foeHealth(f)}`).join('; ')
}

/** The character's companions and how they're faring ("Mira (healer): hurt"); empty if none. */
export function partySummary(st: GameState): string {
  return (st.party ?? []).map((a) => `${a.name} (${ROLE_INFO[a.role].label.toLowerCase()}): ${allyHealth(a, st.character.level)}`).join('; ')
}
