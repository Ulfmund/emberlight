import {
  actionLabel,
  buildFoes,
  deathRollEvents,
  foeRoster,
  guessCombatAction,
  nameSuggestions,
  NO_FIGHT,
  project,
  resolveCheck,
  resolveRound,
  resolveWork,
  castSpell,
  spellById,
  rollWorldEvent,
  workFromChecks,
  shouldTrack,
  SKILLS,
  startCombat,
  TIER_INFO,
  WORK_SKILLS,
  WORLD_EVENTS,
  type Attr,
  type CampaignSettings,
  type CheckRequest,
  type CheckResult,
  type CombatAction,
  type GameEvent,
  type GameState,
  type TurnPlan,
  type Work
} from '@shared/rules'
import type { ChatMessage, Connection } from '@shared/types'
import type { MessageView, TurnEvent } from '@shared/view'
import { normalizeEntry, selectLore } from '@shared/lore'
import { DEFAULT_PERSONA, findPersona, personaCardId } from '@shared/personas'
import { fillMacros, storyName } from '@shared/cards'
import { estimateTokens, promptBlocks, type PromptReport } from '@shared/inspect'
import { entityLine, projectMemory, relevantEntities, storySoFar, type Summary } from '@shared/memory'
import { summarizeChapter, summarizeScene, updateArc } from '../ai/jobs/summarizer'
import { createProvider, type Provider } from '../ai/providers'
import { runCombatReferee, runReferee } from '../ai/jobs/referee'
import { runScribe } from '../ai/jobs/scribe'
import { writeEpitaph } from '../ai/jobs/epitaph'
import { ghostText, suggestActions, type Suggestion } from '../ai/jobs/suggest'
import { engineNotes, extractFight, extractRollRequest, fitHistory, NameFilter, narratorSystem, pastRollNote, type PersonaText } from '../ai/narrator'
import { newId, type CampaignRow, type EventRow, type MessageRow } from '../store/db'
import type { Campaigns } from './campaigns'

type Ctx = { provider: Provider; model: string; contextChars: number }

/** What the engine worked out for a turn (see engineTurn). */
type EngineOut = {
  events: GameEvent[]
  /** Rolls the narrator is told about one by one. */
  checks: CheckResult[]
  /** Rolls a fight made (the fight log already describes them). */
  fightRolls: CheckResult[]
  /** The fight blow by blow, and random events, for the narrator. */
  log: string[]
  fought: boolean
  after: GameState
  eventId: string | null
}

/** Heads the fight log in the narrator's notes. */
const FIGHT_HEADER =
  "THE FIGHT (the engine decides every blow: narrate exactly what follows, in order. Add no attacks, wounds, deaths or enemies of your own, and don't quote the numbers):"

/** How much the prompt can hold, by the model's context size (docs/spec/07-memory-and-lore.md#prompt-assembly). */
function memoryTier(contextChars: number) {
  if (contextChars < 40_000) return { people: 6, facts: 2, storyShare: 0.18, lore: 2500 } // lean: ≤ ~12k tokens
  if (contextChars < 120_000) return { people: 10, facts: 4, storyShare: 0.15, lore: 6000 }
  return { people: 14, facts: 6, storyShare: 0.12, lore: 10_000 }
}

/** Summaries: a scene covers 10–16 story messages; a chapter covers 6 scenes. */
export const SCENE_MIN = 10
export const SCENE_MAX = 16
export const SCENES_PER_CHAPTER = 6
/** Messages at the end that are never summarized yet: the live moment. */
const KEEP_LIVE = 2
/** Start summarizing once the story fills this share of the model's context. */
const SUMMARIZE_AT = 0.4

/**
 * Plays out turns (docs/spec/06-ai-dm.md#the-turn-loop). Each public method is an async
 * generator of TurnEvents that the server streams straight to the interface.
 */
export class TurnEngine {
  constructor(
    private campaigns: Campaigns,
    private connection: () => Connection | null,
    private keyFor: (presetId: string) => Promise<string | undefined>,
    /** Swappable for tests. */
    private makeProvider: typeof createProvider = createProvider,
    private rng: () => number = Math.random
  ) {}

  /** Background memory work per campaign (summaries), so turns never wait for it. */
  private jobs = new Map<string, Promise<void>>()

  /** Resolves when background memory work for a campaign is done (for tests and shutdown). */
  settled(id: string): Promise<void> {
    return this.jobs.get(id) ?? Promise.resolve()
  }

  /** The DM's voice: a built-in persona, or a character card from the library. */
  private personaFor(id: string): PersonaText {
    const cardId = personaCardId(id)
    if (cardId) {
      const card = this.campaigns.db.getCard(cardId)
      if (card) {
        const text = [card.data.description, card.data.personality].map((x) => x.trim()).filter(Boolean).join('\n')
        const name = storyName(card.data)
        return { name, voice: fillMacros(text, name, 'the player').slice(0, 2500), ooc: 'argue', fromCard: true }
      }
    }
    const p = findPersona(id) ?? DEFAULT_PERSONA
    return { name: p.name, voice: p.voice, ooc: p.ooc }
  }

  /** What the DM was sent for each campaign's latest reply (kept in memory only). */
  private prompts = new Map<string, PromptReport>()
  lastPrompt(id: string): PromptReport | undefined {
    return this.prompts.get(id)
  }

  private async ctx(): Promise<Ctx> {
    const conn = this.connection()
    if (!conn?.model) throw new Error('No model is connected yet. Open Connect a Model first.')
    const provider = this.makeProvider(conn, await this.keyFor(conn.presetId))
    // A context size set on the Connect screen wins (for Claude it caps cost); otherwise a safe default.
    const tokens = conn.contextSize || (conn.kind === 'anthropic' ? 60_000 : conn.kind === 'ollama' ? 16384 : 8192)
    return { provider, model: conn.model, contextChars: tokens * 3 }
  }

  // ---- public actions ------------------------------------------------------------------

  /** The player acts (free text; or a move picked on the tracker, or "Make" in the Bag). */
  async *act(id: string, text: string, signal: AbortSignal, picked: { combat?: CombatAction; work?: Work; spell?: string } = {}): AsyncGenerator<TurnEvent> {
    yield* this.playTurn(id, { text, kind: 'action', ...picked }, signal)
  }

  /** The player answers a roll the DM asked for. */
  async *answer(id: string, dmMessageId: string, signal: AbortSignal): AsyncGenerator<TurnEvent> {
    const dm = this.campaigns.db.getMessage(dmMessageId)
    const req = dm?.meta.requestCheck
    if (!dm || !req) return yield { type: 'error', message: 'That roll is no longer waiting.' }
    const check: CheckRequest = {
      skill: req.skill as CheckRequest['skill'],
      difficulty: req.difficulty as CheckRequest['difficulty'],
      modifier: 0,
      advantage: 'none',
      reason: req.reason,
      dramatic: true,
      withStrangers: false,
      risk: { severity: 'none', source: 'environment' },
      hidden: req.hidden
    }
    yield* this.playTurn(
      id,
      { text: `((I roll ${SKILLS[check.skill].label} as you asked: ${req.reason}.))`, kind: 'roll_response', hidden: true, forced: check, answers: dmMessageId },
      signal
    )
  }

  /** Narrate the newest player message (the opening scene, or after rewinding to a player turn). */
  async *narrateHead(id: string, signal: AbortSignal): AsyncGenerator<TurnEvent> {
    const c = this.campaigns.get(id)
    const path = this.campaigns.path(c)
    const last = path[path.length - 1]
    if (!last || last.role !== 'user') return yield { type: 'view', view: this.campaigns.view(id) }
    yield* this.narrate(id, last, signal)
  }

  /** Write the DM's last response again (a new "swipe"; the old one is kept). */
  async *regenerate(id: string, signal: AbortSignal): AsyncGenerator<TurnEvent> {
    const c = this.campaigns.get(id)
    const path = this.campaigns.path(c)
    const last = path[path.length - 1]
    if (!last) return
    const player = last.role === 'user' ? last : path[path.length - 2]
    if (!player) return
    yield* this.narrate(id, player, signal)
  }

  /** Free reroll of the latest turn's dice. The old result is kept in the log, marked replaced. */
  async *reroll(id: string, checkId: string, signal: AbortSignal): AsyncGenerator<TurnEvent> {
    const c = this.campaigns.get(id)
    if (c.settings.ironman) return yield { type: 'error', message: 'Rerolls are off in Ironman mode.' }
    const path = this.campaigns.path(c)
    const all = this.campaigns.db.eventsFor(id)
    const rollEv = all.find((e) => e.event.type === 'roll' && (e.event as { check: CheckResult }).check.id === checkId && !e.superseded)
    if (!rollEv) return yield { type: 'error', message: 'That roll can no longer be rerolled.' }
    const lastUser = [...path].reverse().find((m) => m.role === 'user')
    if (!lastUser || lastUser.id !== rollEv.message_id) return yield { type: 'error', message: 'Only the latest roll can be rerolled.' }

    const playerPath = path.slice(0, path.findIndex((m) => m.id === lastUser.id) + 1)
    const before = this.campaigns.state(c, { path: playerPath, excludeGroup: rollEv.group_id })
    const plan = lastUser.meta.plan
    // Older saves have no plan: just the same checks again.
    const legacy = all
      .filter((e) => e.group_id === rollEv.group_id && e.event.type === 'roll')
      .map((e) => requestOf((e.event as { check: CheckResult }).check))
    this.campaigns.db.supersedeGroup(rollEv.group_id)
    const out = this.engineTurn(before, c.settings, plan ? { ...plan, event: plan.event ?? null } : { ref: { checks: legacy, intent: 'other', fight: NO_FIGHT }, event: null }, {
      action: lastUser.meta.kind === 'action',
      sinceEvent: 0
    })
    if (out.events.length) this.campaigns.db.addEvents(id, lastUser.id, newId('grp'), 'engine', out.events)
    this.campaigns.db.setHead(id, lastUser.id)
    const dr = all.find((e) => e.message_id === lastUser.id && e.event.type === 'death_roll' && !e.superseded)?.event as { roll: number; success: boolean } | undefined
    const deathRoll = dr ? { roll: dr.roll, success: dr.success } : undefined
    const notes = this.notesFor(before, out, c.settings, deathRoll)
    const meta = { ...lastUser.meta, notes }
    this.campaigns.db.updateMessage(lastUser.id, { meta })
    yield { type: 'checks', checks: [...out.checks, ...out.fightRolls], deathRoll }
    yield* this.narrate(id, { ...lastUser, meta }, signal, notes)
  }

  /** Three things the character could do now (the Ideas button). */
  async suggest(id: string, signal?: AbortSignal): Promise<Suggestion[]> {
    const ctx = await this.ctx()
    const c = this.campaigns.get(id)
    const path = this.campaigns.path(c)
    const state = this.campaigns.state(c, { path })
    const recent = path.filter((m) => !m.meta.hidden).slice(-4).map((m) => ({ role: m.role, content: m.content }))
    return suggestActions(ctx.provider, ctx.model, state, recent, signal)
  }

  /** The rest of the sentence the player is typing (ghost text). */
  async ghost(id: string, typed: string, signal?: AbortSignal): Promise<string> {
    const ctx = await this.ctx()
    const c = this.campaigns.get(id)
    const path = this.campaigns.path(c)
    const state = this.campaigns.state(c, { path })
    const recent = path.filter((m) => !m.meta.hidden).slice(-2).map((m) => ({ role: m.role, content: m.content }))
    return ghostText(ctx.provider, ctx.model, state, recent, typed, signal)
  }

  /** Spend an unspent attribute point from a level-up. */
  spend(id: string, attr: Attr) {
    const c = this.campaigns.get(id)
    if (!c.head_id) return
    this.campaigns.db.addEvents(id, c.head_id, newId('grp'), 'player', [{ type: 'attr_spend', attr }])
  }

  // ---- internals -----------------------------------------------------------------------

  private resolve(state: GameState, settings: Parameters<typeof resolveCheck>[1], requests: CheckRequest[]) {
    const events: GameEvent[] = []
    const results: CheckResult[] = []
    let working = state
    for (const req of requests) {
      if (working.character.status !== 'alive') break
      const r = resolveCheck(working, settings, req, this.rng)
      events.push(...r.events)
      results.push(r.result)
      working = r.state
    }
    return { events, results, after: working }
  }

  /** Player turns since the last random event or fight, so they don't pile up. */
  private turnsSinceEvent(c: CampaignRow, path: MessageRow[]): number {
    const rows = this.campaigns.activeEvents(c, path)
    const last = [...rows].reverse().find((e) => e.event.type === 'world_event' || e.event.type === 'combat_start' || e.event.type === 'combat_end')
    const from = last ? path.findIndex((m) => m.id === last.message_id) : -1
    return path.slice(from + 1).filter((m) => m.role === 'user' && !m.meta.hidden).length
  }

  /**
   * The engine's half of a turn: fights, checks and random events, from decisions already made
   * (by the Referee, or by the player's button on the tracker). Rolls dice; never asks the AI.
   */
  private engineTurn(state: GameState, settings: CampaignSettings, plan: TurnPlan, opts: { action: boolean; sinceEvent: number }): EngineOut {
    const events: GameEvent[] = []
    const checks: CheckResult[] = []
    const fightRolls: CheckResult[] = []
    const log: string[] = []
    let working = state
    let fought = false
    let eventId: string | null = null
    const take = (evs: GameEvent[], st: GameState) => {
      events.push(...evs)
      working = st
    }
    const alive = () => working.character.status === 'alive'

    if (working.combat && plan.combat && alive()) {
      // A round of a fight on the tracker.
      const r = resolveRound(working, settings, plan.combat, this.rng)
      take(r.events, r.state)
      fightRolls.push(...r.results)
      log.push(...r.log)
      fought = true
    } else if (plan.ref && alive()) {
      const ref = plan.ref
      const foes = ref.fight.starts && !working.combat ? buildFoes(ref.fight.foes, working.character.level, this.rng) : []
      if (foes.length && shouldTrack(settings.combat, foes)) {
        // A fight starts on the tracker: from here on, the engine rolls every blow.
        let starts = true
        if (!ref.fight.playerAttacks && ref.checks.length) {
          // Violence only if the words (or the dodge) fail. The foes are the danger, not the roll.
          const r = this.resolve(working, settings, ref.checks.map((ch) => ({ ...ch, risk: { severity: 'none' as const, source: ch.risk.source } })))
          take(r.events, r.after)
          checks.push(...r.results)
          starts = r.results.some((x) => !TIER_INFO[x.tier].success)
        }
        if (starts && alive()) {
          const st = startCombat(working, settings, foes, this.rng, { playerAmbushes: ref.fight.playerAttacks && ref.fight.sneakAttack })
          take(st.events, st.state)
          fightRolls.push(...st.results)
          log.push(`A FIGHT BEGINS against ${foeRoster(foes)}.`, ...st.log)
          const spell = Boolean(ref.spell) || ref.checks.some((ch) => ch.skill === 'spellcasting')
          const opening: CombatAction = ref.fight.playerAttacks ? (spell ? { kind: 'cast', target: foes[0].id, spell: ref.spell } : { kind: 'attack', target: foes[0].id }) : { kind: 'none' }
          const r = resolveRound(working, settings, opening, this.rng)
          take(r.events, r.state)
          fightRolls.push(...r.results)
          log.push(...r.log)
          fought = true
        }
      } else {
        // Everything else, fights told in prose included: the checks, with their risks. Gathering
        // and crafting roll their own check (and move the items), so it isn't rolled twice.
        const work = ref.work ?? workFromChecks(ref.checks)
        const spell = spellById(ref.spell)
        // Work and spells roll their own check, so the Referee's for the same thing isn't rolled twice.
        const r = this.resolve(working, settings, ref.checks.filter((ch) => !(work && WORK_SKILLS.has(ch.skill)) && !(spell && ch.skill === 'spellcasting')))
        take(r.events, r.after)
        checks.push(...r.results)
        if (work && alive()) {
          const w = resolveWork(working, settings, work, this.rng)
          take(w.events, w.state)
          checks.push(...w.results)
          log.push(...w.log)
        }
        if (spell && alive()) {
          const m = castSpell(working, settings, spell, this.rng)
          take(m.events, m.state)
          checks.push(...m.results)
          log.push(...m.log)
        }
      }
    }

    // Random events: the world doesn't wait for the player.
    if (opts.action && !fought && !working.combat && alive() && plan.event !== null) {
      const ev = plan.event
        ? (WORLD_EVENTS.find((e) => e.id === plan.event) ?? null)
        : rollWorldEvent(working, settings, { intent: plan.ref?.intent, noise: checks.some((x) => x.tier === 'crit_failure'), turnsSinceLast: opts.sinceEvent }, this.rng)
      if (ev) {
        eventId = ev.id
        events.push({ type: 'world_event', id: ev.id, text: ev.text })
        // A band met on the road is rabble for a new adventurer, and real trouble later on.
        const specs = (ev.foes ?? []).map((f) => (working.character.level <= 3 && (f.count ?? 1) >= 2 && !f.tier ? { ...f, tier: 'minion' as const } : f))
        const foes = specs.length ? buildFoes(specs, working.character.level, this.rng) : []
        if (foes.length && shouldTrack(settings.combat, foes)) {
          const st = startCombat(working, settings, foes, this.rng, { foesAmbush: ev.ambush })
          take(st.events, st.state)
          fightRolls.push(...st.results)
          log.push(
            `RANDOM EVENT, right after the character's action: ${ev.text}`,
            `A FIGHT BEGINS against ${foeRoster(foes)}.`,
            ...st.log,
            'Bring the foes in and stop before any blow lands: the fight is played out from the next turn.'
          )
        } else log.push(`RANDOM EVENT (work it into the scene now, right after the character's action): ${ev.text}${foes.length ? ' If it comes to blows, tell the fight in prose.' : ''}`)
      }
    }
    return { events, checks, fightRolls, log, fought, after: working, eventId }
  }

  /** The [GAME ENGINE] notes for the narrator. */
  private notesFor(before: GameState, out: EngineOut, settings: CampaignSettings, deathRoll?: { roll: number; success: boolean }) {
    const lines = out.log.length && (out.fought || out.after.combat) ? [FIGHT_HEADER, ...out.log] : out.log
    return engineNotes(before, out.after, settings, out.checks, deathRoll, lines)
  }

  private async *playTurn(
    id: string,
    input: { text: string; kind: 'action' | 'roll_response'; hidden?: boolean; forced?: CheckRequest; answers?: string; combat?: CombatAction; work?: Work; spell?: string },
    signal: AbortSignal
  ): AsyncGenerator<TurnEvent> {
    let ctx: Ctx
    try {
      ctx = await this.ctx()
    } catch (err) {
      return yield { type: 'error', message: (err as Error).message }
    }
    const c = this.campaigns.get(id)
    const settings = c.settings
    const path = this.campaigns.path(c)
    const state = this.campaigns.state(c, { path })
    if (state.character.status === 'dead') return yield { type: 'error', message: `${state.character.build.name} is dead. Rewind, or start a new adventure.` }
    const head = path[path.length - 1]
    if (head?.role === 'user') return yield { type: 'error', message: 'The DM is still answering the last turn.' }

    const msg = this.campaigns.db.addMessage({
      id: newId('msg'),
      campaign_id: id,
      parent_id: head?.id ?? null,
      role: 'user',
      content: input.text,
      thinking: '',
      meta: { kind: input.kind, hidden: input.hidden, answers: input.answers }
    })
    this.campaigns.db.setHead(id, msg.id)
    yield { type: 'player', message: toView(msg) }

    // A downed character fights for their life before anything else. It's kept apart from the
    // turn's other dice, so a free reroll can't undo it.
    let working = state
    let deathRoll: { roll: number; success: boolean } | undefined
    const dr = deathRollEvents(working, this.rng)
    if (dr.length) {
      this.campaigns.db.addEvents(id, msg.id, newId('grp'), 'engine', dr)
      working = project(working, dr, settings)
      const ev = dr[0] as { roll: number; success: boolean }
      deathRoll = { roll: ev.roll, success: ev.success }
    }

    // What is the player doing? In a fight, one move (picked on the tracker, or read from their
    // words); otherwise, the Referee decides on checks and whether a fight starts.
    const recent = path.filter((m) => !m.meta.hidden).slice(-4).map((m) => ({ role: m.role, content: m.content }))
    const plan: TurnPlan = {}
    if (input.forced) plan.ref = { checks: [input.forced], intent: 'other', fight: NO_FIGHT }
    else if (input.work && working.character.status === 'alive' && !working.combat) plan.ref = { checks: [], intent: input.work.kind, fight: NO_FIGHT, work: input.work }
    else if (input.spell && working.character.status === 'alive' && !working.combat) plan.ref = { checks: [], intent: 'other', fight: NO_FIGHT, spell: input.spell }
    else if (working.character.status === 'alive' && working.combat) {
      plan.combat = input.combat
      if (!plan.combat) {
        try {
          plan.combat = await runCombatReferee(ctx.provider, ctx.model, working, recent, input.text)
        } catch (err) {
          plan.combat = guessCombatAction(input.text)
          yield { type: 'notice', message: `The referee couldn't read that move (${(err as Error).message}), so it counts as ${actionLabel(plan.combat, working)}.` }
        }
      }
    } else if (working.character.status === 'alive') {
      try {
        plan.ref = await runReferee(ctx.provider, ctx.model, working, recent, input.text, settings.rolls)
      } catch (err) {
        plan.ref = null
        yield { type: 'notice', message: `The referee couldn't decide on a roll (${(err as Error).message}), so the story continues without one.` }
      }
    }

    const out = this.engineTurn(working, settings, plan, { action: input.kind === 'action', sinceEvent: this.turnsSinceEvent(c, path) })
    plan.event = out.eventId
    if (out.events.length) this.campaigns.db.addEvents(id, msg.id, newId('grp'), 'engine', out.events)
    const notes = this.notesFor(state, out, settings, deathRoll)
    const meta = { ...msg.meta, plan, notes }
    this.campaigns.db.updateMessage(msg.id, { meta })
    yield { type: 'checks', checks: [...out.checks, ...out.fightRolls], deathRoll }

    yield* this.narrate(id, { ...msg, meta }, signal, notes, ctx)
  }

  private async *narrate(id: string, player: MessageRow, signal: AbortSignal, notes?: string, given?: Ctx): AsyncGenerator<TurnEvent> {
    let ctx: Ctx
    try {
      ctx = given ?? (await this.ctx())
    } catch (err) {
      return yield { type: 'error', message: (err as Error).message }
    }
    const c = this.campaigns.get(id)
    const all = this.campaigns.db.messagesFor(id)
    // Story up to and including this player message.
    const path = this.campaigns.path({ ...c, head_id: player.id }, all)
    const events = this.campaigns.activeEvents(c, path)
    const after = this.campaigns.state(c, { path })
    if (notes === undefined) notes = player.meta.notes
    if (notes === undefined) {
      const before = this.campaigns.state(c, { path: path.slice(0, -1) })
      const mine = events.filter((e) => e.message_id === player.id && e.event.type === 'roll').map((e) => (e.event as { check: CheckResult }).check)
      notes = engineNotes(before, after, c.settings, mine)
    }

    const history: ChatMessage[] = path.map((m, i) => {
      const isLast = i === path.length - 1
      if (m.role === 'assistant') return { role: 'assistant', content: m.content || '(…)' }
      const checks = events.filter((e) => e.message_id === m.id && e.event.type === 'roll').map((e) => (e.event as { check: CheckResult }).check)
      const extra = isLast ? (notes ? `\n\n[GAME ENGINE]\n${notes}` : '') : pastRollNote(checks)
      return { role: 'user', content: m.content + extra }
    })

    // Long-term memory: people and places from earlier, and summaries of whatever no longer
    // fits word for word. Summaries are dropped while their messages are still shown in full.
    const memory = projectMemory(events.map((e) => e.event))
    const tier = memoryTier(ctx.contextChars)

    // Lorebook entries (the story's lorebooks and the cast's cards) wake up when the recent story
    // mentions their keywords. The newest message includes the engine's notes for this turn.
    const loreEntries = [...this.campaigns.loreEntries(c), ...c.cast.flatMap((m) => m.book.map(normalizeEntry))]
    const lore = selectLore(loreEntries, history.map((m) => m.content), { budgetChars: tier.lore, rng: this.rng })
    const me = after.character.build.name
    const people = relevantEntities(memory, path.slice(-6).map((m) => m.content).join('\n'), after.location, tier.people, [me])
      .map((e) => entityLine(e, tier.facts))
      .join('\n')
    const index = new Map(path.map((m, i) => [m.id, i]))
    const budget = (sys: string) => Math.max(4000, ctx.contextChars - sys.length - 6000)
    const names = nameSuggestions(this.rng)
    const pinned = memory.notes.map((n) => `- ${n.text}`).join('\n')
    const persona = this.personaFor(c.settings.persona)
    const build = (story: string) => narratorSystem(after, c.settings, names, c.cast, lore, { story, people, notes: pinned }, persona)
    const storyBudget = Math.round(ctx.contextChars * tier.storyShare)
    let system = build(storySoFar(memory, storyBudget, () => false))
    let messages = fitHistory(history, budget(system))
    const shownFrom = path.length - messages.length
    system = build(storySoFar(memory, storyBudget, (s) => (index.get(s.from) ?? -1) >= shownFrom))
    messages = fitHistory(history, budget(system))

    const dm = this.campaigns.db.addMessage({
      id: newId('msg'),
      campaign_id: id,
      parent_id: player.id,
      role: 'assistant',
      content: '',
      thinking: '',
      meta: { kind: 'narration' }
    })
    this.campaigns.db.setHead(id, dm.id)
    yield { type: 'narration_start', messageId: dm.id }
    {
      const blocks = promptBlocks(system)
      const sent = messages.map((m) => ({ role: m.role as 'user' | 'assistant', text: m.content }))
      const historyTokens = sent.reduce((n, m) => n + estimateTokens(m.text), 0)
      this.prompts.set(id, {
        messageId: dm.id,
        at: Date.now(),
        model: ctx.model,
        contextTokens: Math.round(ctx.contextChars / 3),
        blocks,
        history: { sent: messages.length, total: path.length, tokens: historyTokens, messages: sent },
        totalTokens: blocks.reduce((n, b) => n + b.tokens, 0) + historyTokens
      })
    }

    const filter = new NameFilter(id, [me, ...after.fallen.map((f) => f.name), ...c.cast.map((m) => m.name)])
    let text = ''
    let thinking = ''
    let error: string | undefined
    let notice: string | undefined
    try {
      for await (const ev of ctx.provider.chat(ctx.model, { system, messages, signal })) {
        if (ev.type === 'text') {
          const safe = filter.push(ev.text)
          if (safe) {
            text += safe
            yield { type: 'text', text: safe }
          }
        } else if (ev.type === 'thinking') {
          thinking += ev.text
          yield { type: 'thinking', text: ev.text }
        } else if (ev.type === 'error') {
          error = ev.message
        } else if (ev.type === 'notice') {
          notice = ev.message
        }
      }
    } catch (err) {
      error = (err as Error).message
    }
    const tail = filter.flush()
    if (tail) {
      text += tail
      yield { type: 'text', text: tail }
    }
    if (signal.aborted && !error) error = text ? undefined : 'Stopped.'

    const { text: noRoll, request } = extractRollRequest(text.trim())
    const { text: clean, fight } = extractFight(noRoll)
    this.campaigns.db.updateMessage(dm.id, {
      content: clean,
      thinking,
      meta: { kind: 'narration', requestCheck: request, error, notice }
    })

    // The DM set foes on the character: the engine runs the fight from the next turn.
    if (fight && clean && !error && !after.combat && after.character.status === 'alive' && c.settings.combat !== 'narrative') {
      const foes = buildFoes(fight.foes, after.character.level, this.rng)
      if (shouldTrack(c.settings.combat, foes)) {
        const st = startCombat(after, c.settings, foes, this.rng, { foesAmbush: fight.ambush })
        this.campaigns.db.addEvents(id, dm.id, newId('grp'), 'engine', st.events)
      }
    }

    // The Scribe records what the story changed (time, rest, loot, deeds…).
    if (clean && !error && !signal.aborted) {
      try {
        let scribed = await runScribe(ctx.provider, ctx.model, after, player.meta.hidden ? '(no action)' : player.content, notes ?? '', clean, memory)
        // A turn of a fight (still on, or ended this turn): seconds pass, not hours, nobody sleeps or
        // sits down to eat, and the engine decides every wound (the story's blood isn't a new condition).
        const fightTurn = after.combat || events.some((e) => e.message_id === player.id && e.event.type.startsWith('combat_'))
        if (fightTurn) scribed = scribed.filter((e) => e.type !== 'rest' && e.type !== 'eat' && e.type !== 'condition').map((e) => (e.type === 'time' ? { ...e, minutes: Math.min(e.minutes, after.combat ? 1 : 10) } : e))
        if (scribed.length) this.campaigns.db.addEvents(id, dm.id, newId('grp'), 'ai', scribed)
      } catch {
        // Bookkeeping failing must never break the story; the next turn tries again.
      }
      // A death: the DM's last words for them, for the death screen and the Hall of the Fallen.
      if (after.character.status === 'dead' && !after.character.epitaph) {
        try {
          const death = [...events].reverse().find((e) => e.event.type === 'status' && (e.event as { status: string }).status === 'dead')?.event as { reason?: string } | undefined
          const recent = [...path.filter((m) => !m.meta.hidden).slice(-3).map((m) => ({ role: m.role, content: m.content })), { role: 'assistant' as const, content: clean }]
          const words = await writeEpitaph(ctx.provider, ctx.model, after, death?.reason || 'fell', recent)
          if (words) this.campaigns.db.addEvents(id, dm.id, newId('grp'), 'ai', [{ type: 'epitaph', text: words }])
        } catch {
          // The death screen does without.
        }
      }
      this.remember(id, ctx)
    }
    yield { type: 'view', view: this.campaigns.view(id) }
  }

  // ---- long-term memory ------------------------------------------------------------------

  /** Starts summarizing in the background, unless it's already running for this campaign. */
  private remember(id: string, ctx: Ctx) {
    if (this.jobs.has(id)) return
    const job = (async () => {
      // Catch up a few steps at a time; the rest waits for the next turn.
      for (let i = 0; i < 3; i++) if (!(await this.summarizeStep(id, ctx))) break
    })()
      .catch(() => {
        /* memory failing must never break the game; the next turn tries again */
      })
      .finally(() => this.jobs.delete(id))
    this.jobs.set(id, job)
  }

  /** Writes one chapter or scene summary if one is due. Returns whether it wrote anything. */
  private async summarizeStep(id: string, ctx: Ctx): Promise<boolean> {
    const c = this.campaigns.get(id)
    const path = this.campaigns.path(c)
    const all = this.campaigns.activeEvents(c, path)
    const memory = projectMemory(all.map((e) => e.event))
    const index = new Map(path.map((m, i) => [m.id, i]))
    const at = (msgId: string) => index.get(msgId) ?? -1
    const player = this.campaigns.state(c, { path }).character.build.name

    // A chapter, once enough scenes have piled up since the last one.
    const lastChapterTo = memory.chapters.length ? Math.max(...memory.chapters.map((s) => at(s.to))) : -1
    const loose = memory.scenes.filter((s) => at(s.to) > lastChapterTo).sort((a, b) => at(a.to) - at(b.to))
    if (loose.length >= SCENES_PER_CHAPTER) {
      const group = loose.slice(0, SCENES_PER_CHAPTER)
      const out = await summarizeChapter(ctx.provider, ctx.model, player, group)
      const chapter: Summary = {
        level: 'chapter',
        title: out.title.trim().slice(0, 80) || 'A chapter',
        text: out.summary.trim(),
        from: group[0].from,
        to: group[group.length - 1].to,
        fromDay: group[0].fromDay,
        toDay: group[group.length - 1].toDay
      }
      const arc = await updateArc(ctx.provider, ctx.model, player, memory.arc, chapter).catch(() => null)
      const evs: EventRow['event'][] = [{ type: 'summary', summary: chapter }]
      if (arc?.storySoFar.trim()) evs.push({ type: 'arc', text: arc.storySoFar.trim() })
      this.campaigns.db.addEvents(id, chapter.to, newId('mem'), 'ai', evs)
      return true
    }

    // A scene, once the story is long enough that it will soon stop fitting word for word.
    const total = path.reduce((n, m) => n + m.content.length, 0)
    if (total < ctx.contextChars * SUMMARIZE_AT) return false
    const lastSceneTo = memory.scenes.length ? Math.max(...memory.scenes.map((s) => at(s.to))) : -1
    const visible = path.slice(lastSceneTo + 1).filter((m) => !m.meta.hidden && m.content.trim() && !m.meta.error)
    if (visible.length < SCENE_MIN + KEEP_LIVE) return false
    let chunk = visible.slice(0, Math.min(visible.length - KEEP_LIVE, SCENE_MAX))
    // End the scene before the character arrives somewhere new, if that happens partway through.
    const arrivals = new Set(all.filter((e) => e.event.type === 'location').map((e) => e.message_id))
    const cut = chunk.findIndex((m, i) => i >= 6 && arrivals.has(m.id))
    if (cut > 0) chunk = chunk.slice(0, chunk[cut - 1].role === 'user' ? cut - 1 : cut)
    if (chunk.length < 4) return false

    const out = await summarizeScene(ctx.provider, ctx.model, player, chunk.map((m) => ({ role: m.role, content: m.content })))
    const first = chunk[0]
    const last = chunk[chunk.length - 1]
    const dayAt = (m: MessageRow) => this.campaigns.state(c, { path: path.slice(0, at(m.id) + 1) }).time.day
    const scene: Summary = {
      level: 'scene',
      title: out.title.trim().slice(0, 80) || 'A scene',
      text: out.summary.trim(),
      from: first.id,
      to: last.id,
      fromDay: dayAt(first),
      toDay: dayAt(last)
    }
    if (!scene.text) return false
    this.campaigns.db.addEvents(id, last.id, newId('mem'), 'ai', [{ type: 'summary', summary: scene }])
    return true
  }
}

/** The original request behind a rolled check (for rerolling it). */
function requestOf(c: CheckResult): CheckRequest {
  return {
    skill: c.skill,
    difficulty: c.difficulty,
    modifier: c.modifier,
    advantage: c.advantage,
    reason: c.reason,
    dramatic: c.dramatic,
    withStrangers: c.withStrangers,
    risk: c.risk,
    hidden: c.hidden
  }
}

function toView(m: MessageRow): MessageView {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    thinking: m.thinking,
    hidden: Boolean(m.meta.hidden),
    kind: m.meta.kind,
    checks: [],
    changes: [],
    createdAt: m.created_at
  }
}
