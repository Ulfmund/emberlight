import {
  deathRollEvents,
  nameSuggestions,
  project,
  resolveCheck,
  SKILLS,
  type Attr,
  type CheckRequest,
  type CheckResult,
  type GameEvent,
  type GameState
} from '@shared/rules'
import type { ChatMessage, Connection } from '@shared/types'
import type { MessageView, TurnEvent } from '@shared/view'
import { createProvider, type Provider } from '../ai/providers'
import { runReferee } from '../ai/jobs/referee'
import { runScribe } from '../ai/jobs/scribe'
import { engineNotes, extractRollRequest, fitHistory, NameFilter, narratorSystem, pastRollNote } from '../ai/narrator'
import { newId, type MessageRow } from '../store/db'
import type { Campaigns } from './campaigns'

type Ctx = { provider: Provider; model: string; contextChars: number }

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

  private async ctx(): Promise<Ctx> {
    const conn = this.connection()
    if (!conn?.model) throw new Error('No model is connected yet. Open Connect a Model first.')
    const provider = this.makeProvider(conn, await this.keyFor(conn.presetId))
    const tokens = conn.kind === 'anthropic' ? 60_000 : conn.contextSize || (conn.kind === 'ollama' ? 16384 : 8192)
    return { provider, model: conn.model, contextChars: tokens * 3 }
  }

  // ---- public actions ------------------------------------------------------------------

  /** The player acts (free text). */
  async *act(id: string, text: string, signal: AbortSignal): AsyncGenerator<TurnEvent> {
    yield* this.playTurn(id, { text, kind: 'action' }, signal)
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

    const requests = all
      .filter((e) => e.group_id === rollEv.group_id && e.event.type === 'roll')
      .map((e) => requestOf((e.event as { check: CheckResult }).check))
    const playerPath = path.slice(0, path.findIndex((m) => m.id === lastUser.id) + 1)
    const before = this.campaigns.state(c, { path: playerPath, excludeGroup: rollEv.group_id })
    this.campaigns.db.supersedeGroup(rollEv.group_id)
    const { events, results, after } = this.resolve(before, c.settings, requests)
    this.campaigns.db.addEvents(id, lastUser.id, newId('grp'), 'engine', events)
    this.campaigns.db.setHead(id, lastUser.id)
    yield { type: 'checks', checks: results }
    yield* this.narrate(id, lastUser, signal, engineNotes(before, after, c.settings, results))
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

  private async *playTurn(
    id: string,
    input: { text: string; kind: 'action' | 'roll_response'; hidden?: boolean; forced?: CheckRequest; answers?: string },
    signal: AbortSignal
  ): AsyncGenerator<TurnEvent> {
    let ctx: Ctx
    try {
      ctx = await this.ctx()
    } catch (err) {
      return yield { type: 'error', message: (err as Error).message }
    }
    const c = this.campaigns.get(id)
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

    // A downed character fights for their life before anything else.
    const events: GameEvent[] = []
    let working = state
    let deathRoll: { roll: number; success: boolean } | undefined
    const dr = deathRollEvents(working, this.rng)
    if (dr.length) {
      events.push(...dr)
      working = project(working, dr, c.settings)
      const ev = dr[0] as { roll: number; success: boolean }
      deathRoll = { roll: ev.roll, success: ev.success }
    }

    let requests: CheckRequest[] = []
    if (input.forced) requests = [input.forced]
    else if (working.character.status === 'alive') {
      try {
        const recent = path.filter((m) => !m.meta.hidden).slice(-4).map((m) => ({ role: m.role, content: m.content }))
        requests = await runReferee(ctx.provider, ctx.model, working, recent, input.text)
      } catch (err) {
        yield { type: 'notice', message: `The referee couldn't decide on a roll (${(err as Error).message}), so the story continues without one.` }
      }
    }

    const r = this.resolve(working, c.settings, requests)
    events.push(...r.events)
    if (events.length) this.campaigns.db.addEvents(id, msg.id, newId('grp'), 'engine', events)
    yield { type: 'checks', checks: r.results, deathRoll }

    yield* this.narrate(id, msg, signal, engineNotes(state, r.after, c.settings, r.results, deathRoll), ctx)
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

    const system = narratorSystem(after, c.settings, nameSuggestions(this.rng))
    const messages = fitHistory(history, Math.max(4000, ctx.contextChars - system.length - 6000))

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

    const filter = new NameFilter(id)
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

    const { text: clean, request } = extractRollRequest(text.trim())
    this.campaigns.db.updateMessage(dm.id, {
      content: clean,
      thinking,
      meta: { kind: 'narration', requestCheck: request, error, notice }
    })

    // The Scribe records what the story changed (time, rest, loot, deeds…).
    if (clean && !error && !signal.aborted) {
      try {
        const scribed = await runScribe(ctx.provider, ctx.model, after, player.meta.hidden ? '(no action)' : player.content, notes ?? '', clean)
        if (scribed.length) this.campaigns.db.addEvents(id, dm.id, newId('grp'), 'ai', scribed)
      } catch {
        // Bookkeeping failing must never break the story; the next turn tries again.
      }
    }
    yield { type: 'view', view: this.campaigns.view(id) }
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
