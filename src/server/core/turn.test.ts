import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type CharacterBuild } from '@shared/rules'
import type { StreamEvent } from '@shared/types'
import type { TurnEvent } from '@shared/view'
import { GameDb } from '../store/db'
import { Campaigns } from './campaigns'
import { TurnEngine } from './turn'
import type { Provider, CompleteOptions } from '../ai/providers/types'

/** A scripted stand-in for a model: the test decides what the Referee, Narrator and Scribe say. */
class FakeProvider implements Provider {
  referee: unknown = { checks: [] }
  scribe: unknown = blankScribe()
  narration = 'The rain keeps falling. [[ROLL: perception | hard | something moves in the reeds]]'
  calls: string[] = []
  lastSystem = ''
  lastMessages: { role: string; content: string }[] = []

  async listModels() {
    return [{ id: 'fake' }]
  }
  async inspectContext() {
    return {}
  }
  async complete<T>(_m: string, opts: CompleteOptions<T>): Promise<T> {
    this.calls.push(opts.name)
    return opts.schema.parse(opts.name === 'referee' ? this.referee : this.scribe)
  }
  async *chat(_m: string, opts: { system: string; messages: { role: string; content: string }[] }): AsyncIterable<StreamEvent> {
    this.calls.push('narrate')
    this.lastSystem = opts.system
    this.lastMessages = opts.messages
    // Stream in small pieces, like a real model, including a banned name split across chunks.
    for (const piece of (this.narration + ' Ka').match(/.{1,4}/g)!) yield { type: 'text', text: piece }
    yield { type: 'text', text: 'el waves.' }
    yield { type: 'done', stopReason: 'stop' }
  }
}

function blankScribe() {
  return {
    minutesPassed: 10,
    rest: 'none',
    location: '',
    deed: '',
    deedRenown: 0,
    itemsGained: [],
    itemsLost: [],
    coinsChange: 0,
    milestoneXp: 0,
    healing: 0,
    conditionsOn: [],
    conditionsOff: []
  }
}

const build: CharacterBuild = {
  name: 'Brenna Rook',
  race: 'human',
  sex: 'female',
  age: 'adult',
  background: 'hunter',
  humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 },
  skills: { perception: 3, stealth: 3 },
  appearance: 'Tall, freckled, a long braid.',
  personality: 'Quiet and stubborn.'
}

async function run(gen: AsyncGenerator<TurnEvent>) {
  const out: TurnEvent[] = []
  for await (const ev of gen) out.push(ev)
  return out
}

describe('turn engine', () => {
  let dir: string
  let db: GameDb
  let campaigns: Campaigns
  let fake: FakeProvider
  let engine: TurnEngine
  let rolls: number[]
  let i = 0
  const setRolls = (...r: number[]) => {
    rolls = r
    i = 0
  }
  const signal = new AbortController().signal

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'emberlight-test-'))
    db = new GameDb(dir)
    campaigns = new Campaigns(db)
    fake = new FakeProvider()
    setRolls()

    engine = new TurnEngine(
      campaigns,
      () => ({ presetId: 'lmstudio', kind: 'openai', baseUrl: 'x', model: 'fake', contextSize: 0 }),
      async () => undefined,
      () => fake,
      () => (rolls.length ? rolls[i++ % rolls.length] : 0.5)
    )
  })
  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('plays an opening, a turn with a roll, and saves everything', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    const opening = await run(engine.narrateHead(id, signal))
    const v0 = (opening.at(-1) as { view: ReturnType<Campaigns['view']> }).view
    expect(v0.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    // Banned name swapped, and the ROLL tag became a request instead of text.
    const dmText = v0.messages[1].content
    expect(dmText).not.toMatch(/Kael|\[\[ROLL/)
    expect(v0.messages[1].requestCheck).toMatchObject({ skill: 'perception', difficulty: 'hard', hidden: true })
    expect(fake.lastSystem).toContain('Brenna Rook')

    // The player answers the DM's roll request.
    setRolls(0.95) // natural 20
    const ans = await run(engine.answer(id, v0.messages[1].id, signal))
    const checks = ans.find((e) => e.type === 'checks') as { checks: { tier: string; hidden?: boolean }[] }
    expect(checks.checks[0]).toMatchObject({ tier: 'crit_success', hidden: true })
    expect(fake.lastMessages.at(-1)!.content).toContain('[GAME ENGINE]')
    expect(fake.lastMessages.at(-1)!.content).toContain('CRITICAL SUCCESS')

    // A risky free action that fails and hurts.
    fake.referee = {
      checks: [
        {
          skill: 'athletics',
          difficulty: 'hard',
          modifier: 0,
          advantage: 'none',
          reason: 'leaping the flooded ditch',
          dramatic: true,
          withStrangers: false,
          risk: 'serious',
          riskSource: 'environment'
        }
      ]
    }
    fake.scribe = { ...blankScribe(), itemsGained: [{ name: 'River stone', qty: 1 }], coinsChange: 25, deed: 'crossed the flood', deedRenown: 1 }
    setRolls(0.05, 0.99) // d20 = 2 → failure, max damage die
    const turn = await run(engine.act(id, 'I take a run at the ditch and jump. "Hold on!"', signal))
    const view = (turn.at(-1) as { view: ReturnType<Campaigns['view']> }).view
    const me = view.state.character
    expect(me.hp).toBeLessThan(view.derived.maxHp)
    expect(me.inventory.some((i) => i.name === 'River stone')).toBe(true)
    expect(me.coins).toBe(50 + 25)
    expect(me.renown).toBe(1)
    expect(view.messages.at(-2)!.checks[0].tier).toMatch(/failure/)

    // Reopening the save gives the same state.
    db.close()
    db = new GameDb(dir)
    campaigns = new Campaigns(db)
    expect(campaigns.view(id).state.character.hp).toBe(me.hp)
  })

  it('reroll replaces the old result; regenerate keeps both versions', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    fake.referee = {
      checks: [
        { skill: 'stealth', difficulty: 'moderate', modifier: 0, advantage: 'none', reason: 'sneak past', dramatic: false, withStrangers: false, risk: 'light', riskSource: 'sentient' }
      ]
    }
    setRolls(0.05, 0.5)
    await run(engine.act(id, 'I sneak past the guard.', signal))
    let v = campaigns.view(id)
    const hurt = v.state.character.hp
    const checkId = v.messages.at(-2)!.checks[0].id

    setRolls(0.95)
    await run(engine.reroll(id, checkId, signal))
    v = campaigns.view(id)
    expect(v.messages.at(-2)!.checks).toHaveLength(1)
    expect(v.messages.at(-2)!.checks[0].tier).toBe('crit_success')
    expect(v.state.character.hp).toBeGreaterThan(hurt)
    expect(v.messages.at(-1)!.swipe?.count).toBe(2)

    // Regenerate: a third version of the narration, same dice.
    await run(engine.regenerate(id, signal))
    v = campaigns.view(id)
    expect(v.messages.at(-1)!.swipe).toMatchObject({ index: 2, count: 3 })
    expect(v.messages.at(-2)!.checks[0].tier).toBe('crit_success')

    // Rewind to before the turn: its effects are gone, but the branch is kept.
    campaigns.rewind(id, v.messages[1].id)
    v = campaigns.view(id)
    expect(v.messages).toHaveLength(2)
    expect(v.state.character.hp).toBe(v.derived.maxHp)
    campaigns.selectSwipe(id, v.messages[1].id)
    expect(campaigns.view(id).messages.length).toBe(4)
  })

  it('women are usually captured by human enemies rather than killed', async () => {
    const id = campaigns.create({ ...build, attributes: { ...build.attributes, END: 8 } }, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    fake.referee = {
      checks: [
        { skill: 'melee', difficulty: 'heroic', modifier: -4, advantage: 'disadvantage', reason: 'fight three bandits', dramatic: true, withStrangers: false, risk: 'deadly', riskSource: 'sentient' }
      ]
    }
    setRolls(0.01, 0.01, 0.99, 0.99, 0.3) // nat 1 twice, max damage, capture roll 0.3 < 0.65
    const turn = await run(engine.act(id, 'I draw my knife and charge the bandits.', signal))
    const view = (turn.at(-1) as { view: ReturnType<Campaigns['view']> }).view
    expect(view.state.character.status).toBe('alive')
    expect(view.state.character.conditions).toContain('captured')
    expect(fake.lastMessages.at(-1)!.content).toContain('CAPTURED')
  })
})
