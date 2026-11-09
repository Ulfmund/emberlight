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
import { CardLibrary } from '../cards/library'
import { LoreLibrary } from '../lore/library'
import { findWorld } from '@shared/worlds'
import { applyRename } from './rename'
import { normalizeEntry } from '@shared/lore'
import { Embedder } from '../ai/embeddings'

/** A scripted stand-in for a model: the test decides what the Referee, Narrator and Scribe say. */
class FakeProvider implements Provider {
  referee: unknown = { checks: [] }
  combatReferee: unknown = { action: 'attack', target: '', item: '', checks: [] }
  epitaph = 'She never looked back, and the river never gave her up.'
  /** What the Vision job "sees" (null: a model that can't see pictures). */
  vision: string | null = 'A silver amulet shaped like a coiled serpent.'
  images: unknown[] = []
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
  summaries = 0
  async complete<T>(_m: string, opts: CompleteOptions<T>): Promise<T> {
    this.calls.push(opts.name)
    const n = ++this.summaries
    if (opts.name === 'summarize_scene') return opts.schema.parse({ title: `Scene ${n}`, summary: `Things happened (${n}).` })
    if (opts.name === 'summarize_chapter') return opts.schema.parse({ title: `Chapter ${n}`, summary: `A chapter passed (${n}).` })
    if (opts.name === 'story_so_far') return opts.schema.parse({ storySoFar: `The tale so far (${n}).` })
    if (opts.name === 'combat_referee') return opts.schema.parse(this.combatReferee)
    if (opts.name === 'epitaph') return opts.schema.parse({ epitaph: this.epitaph })
    if (opts.name === 'describe_image') {
      if (this.vision === null) throw new Error('This model cannot see images')
      this.images.push(...(opts.images ?? []))
      return opts.schema.parse({ description: this.vision })
    }
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
    conditionsOff: [],
    people: [] as unknown[],
    places: [] as unknown[],
    placeKind: 'unknown',
    ate: 'none',
    itemsUsed: [] as unknown[],
    itemsEquipped: [] as unknown[]
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
  it('brings an imported companion card into the story', async () => {
    const library = new CardLibrary(db)
    const card = {
      spec: 'chara_card_v2',
      data: {
        name: 'Elara',
        description: '{{char}} is an elf archer who distrusts {{user}}.',
        personality: 'sharp-tongued',
        scenario: '{{char}} owes {{user}} a debt.',
        first_mes: '"Well, {{user}}. You found me."',
        alternate_greetings: ['"Not you again."'],
        mes_example: '',
        character_book: { entries: [{ keys: ['tower'], content: 'The Glass Tower burned ten years ago.', enabled: true }] }
      }
    }
    const { card: summary } = library.import(new TextEncoder().encode(JSON.stringify(card)), 'elara.json')
    // Importing the same file again gives back the same card.
    expect(library.import(new TextEncoder().encode(JSON.stringify(card)), 'elara.json')).toMatchObject({ existing: true, card: { id: summary.id } })

    const cast = [library.castMember(summary.id, 'companion', build.name)]
    expect(cast[0].description).toBe('Elara is an elf archer who distrusts Brenna Rook.')
    const id = campaigns.create(build, DEFAULT_SETTINGS, undefined, { cast, greetings: library.greetings(summary.id, build.name) })

    // The card's greetings open the story, as two versions to flip between.
    const v0 = campaigns.view(id)
    expect(v0.awaitingNarration).toBe(false)
    expect(v0.messages[1]).toMatchObject({ role: 'assistant', content: '"Well, Brenna Rook. You found me."', swipe: { index: 0, count: 2 } })
    expect(v0.cast).toEqual([{ cardId: summary.id, role: 'companion', name: 'Elara', hasImage: false }])
    // She travels with the player from the first page, an archer by her card.
    expect(v0.state.party.map((a) => [a.id, a.name, a.role])).toEqual([[summary.id, 'Elara', 'archer']])

    fake.narration = 'Elara points at the tower.'
    await run(engine.act(id, 'I ask her about the tower.', signal))
    expect(fake.lastSystem).toContain('COMPANIONS (you play them)')
    expect(fake.lastSystem).toContain('Elara is an elf archer')
    expect(fake.lastSystem).toContain('Elara (archer; unhurt):')
    expect(fake.lastSystem).toContain('The Glass Tower burned ten years ago.')
    // Elara is normally a banned name, but not when she's an imported character. Kael still is.
    const dm = campaigns.view(id).messages.at(-1)!.content
    expect(dm).toMatch(/^Elara points/)
    expect(dm).not.toMatch(/Kael/)

    // Deleting the card from the library doesn't break the story.
    library.delete(summary.id)
    expect(campaigns.view(id).cast[0].name).toBe('Elara')
  })
  it('remembers people across turns, and forgets them on a rewind', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    const before = campaigns.view(id).messages.at(-1)!.id
    fake.scribe = {
      ...blankScribe(),
      location: 'Millbrook Crossing',
      people: [{ name: 'Old Tam', otherNames: ['the ferryman'], who: 'ferryman at Millbrook', newFacts: ['lost two fingers to the river'], status: 'alive', attitude: 'unfriendly', relation: 'none' }],
      places: []
    }
    await run(engine.act(id, 'I ask the ferryman about the river.', signal))
    fake.scribe = { ...blankScribe(), people: [{ name: 'Tam', otherNames: [], who: '', newFacts: ['owes Brenna a favour'], status: 'alive', attitude: 'friendly', relation: 'none' }], places: [] }
    await run(engine.act(id, 'I help Tam haul the rope.', signal))
    fake.scribe = blankScribe()
    await run(engine.act(id, 'I wave goodbye to Tam.', signal))
    // The DM is reminded of Tam, with everything learned so far, under one name.
    expect(fake.lastSystem).toContain('PEOPLE AND PLACES FROM EARLIER')
    expect(fake.lastSystem).toContain('- Old Tam (also called the ferryman, friendly toward the player, last seen day 1): ferryman at Millbrook. Known: lost two fingers to the river; owes Brenna a favour.')
    expect(fake.lastSystem).toContain('- Millbrook Crossing (place')

    // The player corrects him in the Journal and pins a note; then rewrites the DM's reply.
    campaigns.journal(id, { type: 'entity_edit', id: 'person:old tam', summary: 'ferryman and smuggler', attitude: 'devoted' })
    campaigns.journal(id, { type: 'note', id: 'n1', text: 'Tam is secretly my uncle.' })
    await run(engine.regenerate(id, signal))
    expect(fake.lastSystem).toContain('- Old Tam (also called the ferryman, devoted toward the player, last seen day 1): ferryman and smuggler.')
    expect(fake.lastSystem).toContain('PINNED NOTES (the player wants you to always keep these true)\n- Tam is secretly my uncle.')
    expect(campaigns.view(id).memory.notes).toHaveLength(1)

    // Rewind to before meeting him: he's gone from memory.
    campaigns.rewind(id, before)
    await run(engine.act(id, 'I sit by the fire.', signal))
    expect(fake.lastSystem).not.toContain('ferryman at Millbrook')
    expect(fake.lastSystem).not.toContain('PEOPLE AND PLACES FROM EARLIER')
    // The player's pinned notes are theirs: they survive the rewind.
    expect(fake.lastSystem).toContain('- Tam is secretly my uncle.')
  })

  it('summarizes a long campaign so a small model keeps the thread', async () => {
    // An 8k-token local model: about 24,000 characters for everything.
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    const long = (n: number) => `Turn ${n}: ` + 'The road winds on through the wet hills and the rain keeps falling on the hood of your cloak. '.repeat(12)
    for (let n = 1; n <= 70; n++) {
      fake.narration = long(n)
      await run(engine.act(id, `I keep walking (${n}).`, signal))
      await engine.settled(id)
    }
    const all = db.eventsFor(id).map((e) => e.event)
    const scenes = all.filter((e) => e.type === 'summary' && e.summary.level === 'scene')
    const chapters = all.filter((e) => e.type === 'summary' && e.summary.level === 'chapter')
    expect(scenes.length).toBeGreaterThanOrEqual(6)
    expect(chapters.length).toBeGreaterThanOrEqual(1)
    expect(all.some((e) => e.type === 'arc')).toBe(true)

    // The prompt fits the model: early turns are gone word for word but present in summary.
    const sent = fake.lastSystem.length + fake.lastMessages.reduce((n, m) => n + m.content.length, 0)
    expect(sent).toBeLessThan(24_576)
    expect(fake.lastMessages.some((m) => m.content.includes('Turn 1:'))).toBe(false)
    expect(fake.lastSystem).toContain('THE STORY SO FAR')
    expect(fake.lastSystem).toContain('Overall: The tale so far')
    expect(fake.lastSystem).toMatch(/Chapter, day 1: Chapter \d+\. A chapter passed/)
    // Summaries never repeat what's still shown in full: the latest scene isn't summarized yet.
    expect(fake.lastMessages.at(-1)!.content).toContain('(70)')
  }, 60_000) // 70 turns: slow CI machines need more than the default 5 seconds
  it('starts in the example world and gives the DM its lore when it comes up', async () => {
    const lore = new LoreLibrary(db)
    const world = findWorld('cinder_marches')!
    expect(lore.list().map((b) => b.id)).toContain(world.lorebook.id)

    const id = campaigns.create(build, DEFAULT_SETTINGS, undefined, { world })
    const v0 = campaigns.view(id)
    expect(v0.state.location).toBe('Wending')
    expect(v0.lorebooks).toEqual([{ id: world.lorebook.id, name: world.lorebook.name, entries: world.lorebook.entries.length }])

    await run(engine.narrateHead(id, signal))
    expect(fake.lastMessages[0].content).toContain('Begin the adventure in The Cinder Marches')
    // The overview is always there; the toll bridge entry woke up because the opening mentions it.
    expect(fake.lastSystem).toContain('THE CINDER MARCHES: a border province')
    expect(fake.lastSystem).toContain('WENDING: a walled market town')
    expect(fake.lastSystem).not.toContain('GREYCOATS:')

    // Mentioning the Grey Brothers brings them in, and recursion follows them to Emberhall.
    fake.narration = 'A monk in grey watches you.'
    await run(engine.act(id, 'I ask the monk if he is one of the Grey Brothers.', signal))
    expect(fake.lastSystem).toContain('THE GREY BROTHERS:')
    expect(fake.lastSystem).toContain('EMBERHALL:')

    // Edits in the library apply at once; detaching the book removes it.
    const book = lore.get(world.lorebook.id)!
    lore.save({ ...book, entries: book.entries.map((e) => (e.name === 'The Cinder Marches' ? { ...e, content: 'THE CINDER MARCHES (edited).' } : e)) })
    await run(engine.regenerate(id, signal))
    expect(fake.lastSystem).toContain('THE CINDER MARCHES (edited).')
    campaigns.setLorebooks(id, [])
    await run(engine.regenerate(id, signal))
    expect(fake.lastSystem).not.toContain('THE CINDER MARCHES')
  })
  it('reports what the DM was sent, block by block', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    expect(engine.lastPrompt(id)).toBeUndefined()
    await run(engine.narrateHead(id, signal))
    campaigns.journal(id, { type: 'note', id: 'n', text: 'The moon is red.' })
    await run(engine.act(id, 'I look up.', signal))
    const r = engine.lastPrompt(id)!
    expect(r.messageId).toBe(campaigns.view(id).messages.at(-1)!.id)
    expect(r.blocks.map((b) => b.title)).toEqual(expect.arrayContaining(['The DM’s role', 'How to run the game', 'Asking for a roll', 'The player character', 'Where and when', 'Pinned notes']))
    expect(r.blocks.find((b) => b.title === 'Pinned notes')!.text).toBe('- The moon is red.')
    // Everything the model got is accounted for: the instructions and every message sent.
    expect(r.history.messages).toEqual(fake.lastMessages.map((m) => ({ role: m.role, text: m.content })))
    expect(r.blocks.map((b) => b.text).join('\n').length).toBeGreaterThan(fake.lastSystem.length * 0.9)
    expect(r.totalTokens).toBeLessThan(r.contextTokens)
  })
  it('tells the DM its persona, the style settings, and what the character carries and needs', async () => {
    const id = campaigns.create(build, { ...DEFAULT_SETTINGS, persona: 'old_soldier', perspective: 'third', pacing: 'guided', acting: 'light', limits: 'no spiders' })
    await run(engine.narrateHead(id, signal))
    const sys = fake.lastSystem
    expect(sys).toContain('YOUR VOICE AS DM\nYou narrate like an old soldier')
    expect(sys).toContain('Write in third person about Brenna Rook')
    expect(sys).toContain('Keep a story moving')
    expect(sys).toContain('small involuntary reactions')
    expect(sys).toContain('Content to avoid, or to fade to black instead of describing: no spiders.')
    expect(sys).toContain('Wielding: Shortbow. Wearing: ordinary clothes. Defense 12.')
    expect(sys).toContain('Hunger: fed (last proper meal 2 hours ago). Tiredness: rested.')

    // A character card as the DM: its own voice, and it may argue with out-of-character requests.
    const lib = new CardLibrary(db)
    const { card } = lib.import(new TextEncoder().encode(JSON.stringify({ name: 'Grandmother Wolf', description: '{{char}} is an ancient, sardonic wolf who tells stories to {{user}}.', personality: 'dry' })), 'wolf.json')
    campaigns.updateSettings(id, { ...campaigns.get(id).settings, persona: `card:${card.id}` })
    await run(engine.regenerate(id, signal))
    expect(fake.lastSystem).toContain('You are Grandmother Wolf, telling this story as its Dungeon Master. Grandmother Wolf is an ancient, sardonic wolf who tells stories to the player.')
    expect(fake.lastSystem).toContain('You may push back, bargain, or grant it with a twist')
  })

  // ---- fights and random events (docs/spec/04-rules-system.md#combat) ------------------------

  const attackCheck = { skill: 'ranged', difficulty: 'moderate', modifier: 0, advantage: 'none', reason: 'shooting the bandit', dramatic: true, withStrangers: false, risk: 'serious', riskSource: 'sentient' }
  const banditFight = (count: number, playerAttacks = true) => ({
    intent: 'combat',
    checks: [attackCheck],
    fight: { starts: true, foes: [{ kind: 'bandits', count, tier: 'standard', name: '' }], playerAttacks, sneakAttack: false }
  })
  const lastNotes = () => fake.lastMessages.at(-1)!.content

  it('puts a real fight on the tracker: the engine rolls every blow and tells the DM exactly what happened', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    fake.referee = banditFight(2)
    setRolls(0.5)
    const out = await run(engine.act(id, 'I nock an arrow and shoot the nearer bandit.', signal))
    let v = campaigns.view(id)
    const cb = v.state.combat!
    expect(cb.foes.map((f) => f.name)).toEqual(['Bandit 1', 'Bandit 2'])
    expect(cb.round).toBe(2)
    // The Referee's own attack check isn't rolled twice: only the engine's attack on Bandit 1 is.
    const checks = (out.find((e) => e.type === 'checks') as { checks: { reason: string; dc: number }[] }).checks
    expect(checks.map((c) => c.reason)).toEqual(['attacking Bandit 1'])
    expect(checks[0].dc).toBe(cb.foes[0].defense)
    expect(cb.foes[0].hp).toBeLessThan(cb.foes[0].maxHp)
    expect(lastNotes()).toContain('THE FIGHT (the engine decides every blow')
    expect(lastNotes()).toContain('A FIGHT BEGINS against Bandit 1 and Bandit 2.')
    expect(lastNotes()).toMatch(/Bandit 2 slashes at the character: rolled 11/)
    expect(fake.lastSystem).toContain('THE FIGHT (the game engine runs it)\nRound 2.')
    expect(fake.lastSystem).not.toContain('ASKING FOR A ROLL')
    expect(v.messages.at(-1)!.changes.some((c) => c.text.startsWith('Hit Bandit 1 for'))).toBe(true)
    expect(v.messages.at(-1)!.changes[0]).toMatchObject({ text: 'A fight: Bandit 1 and Bandit 2' })

    // A move picked on the tracker needs no Referee at all.
    fake.calls = []
    await run(engine.act(id, 'I attack Bandit 2.', signal, { combat: { kind: 'attack', target: 'f2' } }))
    expect(fake.calls).not.toContain('referee')
    expect(fake.calls).not.toContain('combat_referee')
    v = campaigns.view(id)
    expect(v.state.combat!.round).toBe(3)
    expect(v.state.combat!.foes[1].hp).toBeLessThan(v.state.combat!.foes[1].maxHp)

    // Typed words in a fight become one move, read by the combat Referee.
    fake.combatReferee = { action: 'defend', target: '', item: '', checks: [] }
    fake.calls = []
    await run(engine.act(id, 'I duck behind the cart and keep my head down.', signal))
    expect(fake.calls).toContain('combat_referee')
    expect(lastNotes()).toContain('The character fights defensively')

    // Rewriting the DM's reply keeps the fight's notes.
    await run(engine.regenerate(id, signal))
    expect(lastNotes()).toContain('The character fights defensively')
  })

  it('rerolls the same round of a fight, and only that', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    fake.referee = banditFight(2)
    setRolls(0.5)
    await run(engine.act(id, 'I shoot the nearer bandit.', signal))
    setRolls(0.05) // a miss
    fake.calls = []
    await run(engine.act(id, 'I shoot Bandit 1 again.', signal, { combat: { kind: 'attack', target: 'f1' } }))
    let v = campaigns.view(id)
    expect(v.state.combat!.round).toBe(3)
    const miss = v.messages.at(-2)!.checks[0]
    expect(miss.tier).toMatch(/failure/)
    const hpBefore = v.state.combat!.foes[0].hp

    setRolls(0.95)
    await run(engine.reroll(id, miss.id, signal))
    v = campaigns.view(id)
    expect(fake.calls).not.toContain('combat_referee')
    expect(v.messages.at(-2)!.checks).toHaveLength(1)
    expect(v.messages.at(-2)!.checks[0].tier).toBe('crit_success')
    // Still round 3: the round was played again, not a new one.
    const cb = v.state.combat
    if (cb) expect(cb.round).toBe(3)
    expect(cb ? cb.foes[0].hp < hpBefore || cb.foes[0].status !== 'fighting' : true).toBe(true)
    expect(lastNotes()).toContain('CRITICAL SUCCESS')
  })

  it('wins a fight: the foe goes down, the tracker closes, and the deed is rewarded', async () => {
    const id = campaigns.create(build, { ...DEFAULT_SETTINGS, combat: 'turn' })
    await run(engine.narrateHead(id, signal))
    fake.referee = { intent: 'combat', checks: [attackCheck], fight: { starts: true, foes: [{ kind: 'giant rat', count: 1, tier: 'minion', name: '' }], playerAttacks: true, sneakAttack: false } }
    setRolls(0.5)
    await run(engine.act(id, 'I shoot the rat.', signal))
    const v = campaigns.view(id)
    expect(v.state.combat).toBeNull()
    expect(lastNotes()).toContain('THE FIGHT IS WON.')
    expect(v.state.character.xp).toBeGreaterThan(0)
    expect(v.messages.at(-1)!.changes.map((c) => c.text)).toContain('Won the fight')
  })

  it('tells small fights in the story in mixed mode, and every fight in story mode', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    // One ordinary bandit: told in prose, the attack check carries its risk as before.
    fake.referee = banditFight(1)
    setRolls(0.5)
    await run(engine.act(id, 'I shoot the bandit.', signal))
    expect(campaigns.view(id).state.combat).toBeNull()
    expect(lastNotes()).toContain('Ranged check (shooting the bandit')

    const story = campaigns.create(build, { ...DEFAULT_SETTINGS, combat: 'narrative' })
    await run(engine.narrateHead(story, signal))
    fake.referee = banditFight(3)
    await run(engine.act(story, 'I shoot the bandits.', signal))
    expect(campaigns.view(story).state.combat).toBeNull()
    expect(fake.lastSystem).not.toContain('STARTING A FIGHT')
  })

  it('only fights if the words fail, when talking is what might start it', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    const persuade = { skill: 'persuasion', difficulty: 'moderate', modifier: 0, advantage: 'none', reason: 'talking the bandits down', dramatic: true, withStrangers: true, risk: 'serious', riskSource: 'sentient' }
    fake.referee = { intent: 'social', checks: [persuade], fight: { starts: true, foes: [{ kind: 'bandit', count: 2, tier: 'standard', name: '' }], playerAttacks: false, sneakAttack: false } }
    setRolls(0.95)
    await run(engine.act(id, '"Nobody needs to bleed today," I say.', signal))
    let v = campaigns.view(id)
    expect(v.state.combat).toBeNull()
    expect(v.state.character.hp).toBe(v.derived.maxHp)

    setRolls(0.05, 0.5)
    await run(engine.act(id, '"Last chance," I say.', signal))
    v = campaigns.view(id)
    expect(v.state.combat?.foes).toHaveLength(2)
    // The words failed, so the bandits attack; the failed roll itself did no harm.
    expect(lastNotes()).toMatch(/Persuasion check \(talking the bandits down.*FAILURE/)
    expect(lastNotes()).not.toContain('The character takes')
    expect(lastNotes()).toContain('Bandit 1 slashes at the character')
  })

  it('lets the DM set foes on the character with a FIGHT tag', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    fake.narration = 'Eyes glint between the trees, and then they come. [[FIGHT: 3 wolves | ambush]]'
    await run(engine.narrateHead(id, signal))
    expect(fake.lastSystem).toContain('[[FIGHT: 2 bandit, 1 bandit captain (elite) | ambush]]')
    const v = campaigns.view(id)
    expect(v.messages.at(-1)!.content).toMatch(/^Eyes glint between the trees, and then they come\. \w+ waves\.$/)
    expect(v.messages.at(-1)!.content).not.toContain('[[')
    expect(v.state.combat?.foes.map((f) => f.name)).toEqual(['Wolf 1', 'Wolf 2', 'Wolf 3'])
    // Rewriting that reply takes its fight with it.
    fake.narration = 'The night stays quiet.'
    await run(engine.regenerate(id, signal))
    expect(campaigns.view(id).state.combat).toBeNull()
  })

  it('gathers and crafts through the engine; the Make button needs no Referee', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    fake.scribe = { ...blankScribe(), placeKind: 'forest' }
    await run(engine.act(id, 'I walk into the woods.', signal))
    fake.scribe = blankScribe()

    // Hunting: the Referee names the work; its own Hunting check isn't rolled on top.
    fake.referee = {
      intent: 'gather',
      checks: [{ skill: 'hunting', difficulty: 'moderate', modifier: 0, advantage: 'none', reason: 'hunting', dramatic: false, withStrangers: false, risk: 'light', riskSource: 'beast' }],
      work: { kind: 'gather', what: 'game' }
    }
    setRolls(0.99)
    const out = await run(engine.act(id, 'I go hunting for something to eat.', signal))
    expect((out.find((e) => e.type === 'checks') as { checks: unknown[] }).checks).toHaveLength(1)
    let v = campaigns.view(id)
    expect(v.state.character.inventory.find((i) => i.name === 'Raw meat')?.qty).toBe(4)
    expect(v.state.character.inventory.find((i) => i.name === 'Animal hide')?.qty).toBe(1)
    expect(lastNotes()).toContain('GATHERING: the character gets 4 × Raw meat, 1 × Animal hide.')

    // Make (from the Bag): tanning the hide, straight to the engine.
    fake.calls = []
    await run(engine.act(id, 'I tan an animal hide.', signal, { work: { kind: 'craft', what: 'leather' } }))
    expect(fake.calls).not.toContain('referee')
    v = campaigns.view(id)
    expect(v.state.character.inventory.find((i) => i.name === 'Leather')?.qty).toBeGreaterThanOrEqual(1)
    expect(v.state.character.inventory.some((i) => i.name === 'Animal hide')).toBe(false)
    expect(lastNotes()).toMatch(/CRAFTING: used 1 × Animal hide; made \d × Leather/)
  })

  // ---- death and what comes after (docs/spec/03-characters-and-cards.md#when-a-character-dies) ----

  /** Plays to a death: a daughter and a friend in the story, then a fatal fall. */
  async function toDeath() {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    const person = (name: string, who: string, relation: string) => ({ name, otherNames: [], who, newFacts: [], status: 'alive', attitude: 'devoted', relation })
    fake.scribe = { ...blankScribe(), people: [person('Wenna', "Brenna's daughter, waiting at home", 'child'), person('Old Tam', 'The ferryman', 'friend')] }
    await run(engine.act(id, 'I think of home, and of Wenna.', signal))
    fake.scribe = blankScribe()
    await run(engine.act(id, 'I climb the Gallows Cliff path.', signal))
    const player = campaigns.view(id).messages.at(-2)!
    db.addEvents(id, player.id, 'grp_fall', 'engine', [{ type: 'status', status: 'dead', reason: 'Fell from the Gallows Cliff' }])
    await run(engine.regenerate(id, signal))
    return id
  }

  it('writes an epitaph when a character dies; their child can take up the tale', async () => {
    const id = await toDeath()
    let v = campaigns.view(id)
    expect(v.state.character.status).toBe('dead')
    expect(v.state.character.epitaph).toBe(fake.epitaph)
    const deathMsg = v.messages.at(-1)!.id
    const coins = v.state.character.coins
    const wenna = v.memory.entities.find((e) => e.name === 'Wenna')!
    expect(wenna.relation).toBe('child')

    campaigns.successor(id, { ...build, name: 'Wenna Rook' }, wenna.id)
    v = campaigns.view(id)
    expect(v.build.name).toBe('Wenna Rook')
    expect(v.state.character.status).toBe('alive')
    expect(v.state.fallen).toEqual([expect.objectContaining({ name: 'Brenna Rook', cause: 'Fell from the Gallows Cliff', epitaph: fake.epitaph, heir: 'Wenna Rook', heirIsChild: true })])
    // Her savings and her bow came down to her daughter; ten years have passed.
    expect(v.state.character.coins).toBe(50 + coins)
    expect(v.state.character.inventory.some((i) => i.name === "Brenna's shortbow")).toBe(true)
    expect(v.state.time.day).toBe(1 + 3650)
    // The world remembers the dead; the daughter is the player now, not a Journal entry.
    expect(v.memory.entities.find((e) => e.name === 'Wenna')).toBeUndefined()
    expect(v.memory.entities.find((e) => e.name === 'Brenna Rook')).toMatchObject({ status: 'dead', relation: 'parent' })
    expect(v.memory.entities.find((e) => e.name === 'Old Tam')?.relation).toBe('friend')
    expect(v.awaitingNarration).toBe(true)

    await run(engine.narrateHead(id, signal))
    expect(fake.lastSystem).toContain('THE FALLEN (earlier adventurers of this story')
    expect(fake.lastSystem).toContain("Fell from the Gallows Cliff. The player character's mother.")
    expect(fake.lastSystem).toContain('Wenna Rook: human')
    expect(fake.lastMessages.at(-1)!.content).toContain('10 years later, their child Wenna Rook, human hunter, takes up the road.')
    expect(campaigns.list().find((x) => x.id === id)?.characterName).toBe('Wenna Rook')

    // Rewind to the death, and Brenna is back (dead): the other branch is kept.
    campaigns.rewind(id, deathMsg)
    expect(campaigns.view(id).build.name).toBe('Brenna Rook')
    expect(campaigns.view(id).state.fallen).toHaveLength(0)
  })

  it('a stranger takes up the tale with no ties to the dead; renaming them changes the story, not the save', async () => {
    const id = await toDeath()
    expect(() => campaigns.successor(id, { ...build, name: '' })).toThrow()
    campaigns.successor(id, { ...build, name: 'Tobin Marsh', sex: 'male' })
    let v = campaigns.view(id)
    expect(v.build.name).toBe('Tobin Marsh')
    expect(v.state.time.day).toBe(1 + 3)
    expect(v.state.character.coins).toBe(50)
    const tam = v.memory.entities.find((e) => e.name === 'Old Tam')!
    expect(tam.relation).toBeUndefined()
    expect(tam.attitude).toBeUndefined()
    // Only after a death.
    expect(() => campaigns.successor(id, { ...build, name: 'Someone Else' })).toThrow(/fallen/)

    applyRename(campaigns, id, { from: 'Tobin Marsh', to: 'Tobin Reed', mode: 'story', target: { kind: 'player' } })
    v = campaigns.view(id)
    expect(v.build.name).toBe('Tobin Reed')
    expect(campaigns.get(id).build.name).toBe('Brenna Rook')
  })

  it('casts spells from the Sheet without the Referee, and from words through it', async () => {
    const id = campaigns.create({ ...build, background: 'hedgewitch' }, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    const mana = campaigns.view(id).state.character.mana
    fake.calls = []
    setRolls(0.75)
    await run(engine.act(id, 'I cast Mend.', signal, { spell: 'mend' }))
    expect(fake.calls).not.toContain('referee')
    expect(lastNotes()).toMatch(/MAGIC: Mend works/)
    expect(campaigns.view(id).state.character.mana).toBe(mana - 2)
    expect(fake.lastSystem).toContain('Spells known: Mend (2 mana: Heal 1d8 + Arcane, and stop bleeding); Hex')

    // In words: the Referee names the spell, and its own Spellcasting check isn't rolled on top.
    fake.referee = {
      intent: 'other',
      checks: [{ skill: 'spellcasting', difficulty: 'moderate', modifier: 0, advantage: 'none', reason: 'a hex', dramatic: false, withStrangers: false, risk: 'none', riskSource: 'magic' }],
      spell: 'a hex'
    }
    const out = await run(engine.act(id, 'I mutter a hex at the crow on the fence.', signal))
    expect((out.find((e) => e.type === 'checks') as { checks: { reason: string }[] }).checks.map((c) => c.reason)).toEqual(['casting Hex'])
    expect(lastNotes()).toMatch(/MAGIC: Hex works/)
  })

  it('shows the DM a picture: put into words first, for the Referee and the story', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    const pic = db.addMedia({ campaignId: id, kind: 'story', mime: 'image/png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) })
    await run(engine.act(id, 'I show the merchant this amulet.', signal, { image: pic }))
    const v = campaigns.view(id)
    expect(v.messages.at(-2)!.image).toBe(pic)
    expect(fake.images).toEqual([{ mime: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') }])
    expect(fake.lastMessages.at(-1)!.content).toContain('I show the merchant this amulet.\n\n(The player shows a picture: A silver amulet shaped like a coiled serpent.)')
    // A model that can't see: the story goes on with the words alone.
    fake.vision = null
    const out = await run(engine.act(id, 'And this one.', signal, { image: pic }))
    expect(out.some((e) => e.type === 'notice' && /couldn't look at the picture/.test(e.message))).toBe(true)
    expect(fake.lastMessages.at(-1)!.content).not.toContain('(The player shows a picture')
    // Someone else's picture can't be used.
    const other = campaigns.create(build, DEFAULT_SETTINGS)
    const theirs = db.addMedia({ campaignId: other, kind: 'story', mime: 'image/png', data: new Uint8Array([1]) })
    const bad = await run(engine.act(id, 'Look.', signal, { image: theirs }))
    expect(bad.find((e) => e.type === 'error')).toMatchObject({ message: expect.stringMatching(/no longer there/) })
  })

  it('places lore where it asks to go, keeps sticky entries in, and uses books meant for every adventure', async () => {
    db.saveLorebook({
      id: 'lb_all',
      name: 'Everywhere',
      description: '',
      global: true,
      entries: [
        normalizeEntry({ id: 'deep', name: 'Deep', keys: ['raven'], content: 'Ravens here carry messages for the Duke.', position: 'depth', depth: 0, sticky: 1 }),
        normalizeEntry({ id: 'first', name: 'First', constant: true, content: 'Magic is rare and feared.', position: 'before_char' })
      ]
    })
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    // The global book applies, and a constant entry sits before the character.
    expect(fake.lastSystem).toMatch(/THE WORLD \(keep these true\)\n- Magic is rare and feared\.\n\nTHE PLAYER CHARACTER/)
    await run(engine.act(id, 'A raven lands on the fence.', signal))
    // A depth-0 entry goes into the newest message, not the instructions.
    expect(fake.lastMessages.at(-1)!.content).toContain('[World note: Ravens here carry messages for the Duke.]')
    expect(fake.lastSystem).not.toContain('Ravens here carry')
    expect(db.getMessage(campaigns.view(id).messages.at(-1)!.id)?.meta.lore).toContain('deep')
    // Sticky for one reply: in again next turn without the word, then gone.
    await run(engine.act(id, 'I walk on.', signal))
    expect(fake.lastMessages.at(-1)!.content).toContain('[World note: Ravens')
    await run(engine.act(id, 'I keep walking.', signal))
    expect(fake.lastMessages.at(-1)!.content).not.toContain('[World note: Ravens')
  })

  it('brings random events now and then, and not one after another', async () => {
    const id = campaigns.create(build, { ...DEFAULT_SETTINGS, events: 'chaos' })
    await run(engine.narrateHead(id, signal))
    fake.referee = { intent: 'other', checks: [] }
    setRolls(0.5)
    for (let t = 0; t < 3; t++) {
      await run(engine.act(id, 'I look around.', signal))
      expect(lastNotes()).not.toContain('RANDOM EVENT')
    }
    fake.referee = { intent: 'travel', checks: [] }
    setRolls(0.3)
    await run(engine.act(id, 'I set off down the road.', signal))
    expect(lastNotes()).toContain('RANDOM EVENT (work it into the scene now')
    expect(campaigns.view(id).messages.at(-1)!.changes.map((c) => c.text)).toContain('Something happens')
    await run(engine.act(id, 'I keep walking.', signal))
    expect(lastNotes()).not.toContain('RANDOM EVENT')
  })

  it('keeps the story to the weather until it blows over', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    fake.referee = { intent: 'other', checks: [] }
    fake.scribe = { ...blankScribe(), weather: 'rain', placeKind: 'road' }
    await run(engine.act(id, 'I walk on.', signal))
    fake.scribe = blankScribe()
    await run(engine.act(id, 'I keep walking.', signal))
    expect(fake.lastSystem).toContain('It is raining.')
    expect(campaigns.view(id).state.weather).toBe('rain')
    fake.scribe = { ...blankScribe(), minutesPassed: 9 * 60 }
    await run(engine.act(id, 'I walk on through the day.', signal))
    fake.scribe = blankScribe()
    await run(engine.act(id, 'And on.', signal))
    expect(fake.lastSystem).toContain('The rain has stopped.')
    expect(fake.lastSystem).not.toContain('It is raining')
  })

  it('companions join from the story, the DM is told who they are, and a healer brings a fallen character round', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    fake.referee = { intent: 'other', checks: [] }
    const mira = { name: 'Mira', otherNames: [], who: 'a priestess of the dawn', newFacts: [], status: 'alive', attitude: 'friendly', relation: 'companion' }
    fake.scribe = { ...blankScribe(), companionsJoined: ['Mira'], people: [mira] }
    await run(engine.act(id, 'Will you come with me, Mira?', signal))
    expect(campaigns.view(id).state.party.map((a) => [a.name, a.role])).toEqual([['Mira', 'healer']])
    fake.scribe = blankScribe()
    await run(engine.act(id, 'We set off together.', signal))
    expect(fake.lastSystem).toContain('COMPANIONS (you play them)')
    expect(fake.lastSystem).toMatch(/Mira \(healer; unhurt\): .*priestess of the dawn/)

    // The character falls; Mira tends them instead of a death roll.
    db.addEvents(id, campaigns.get(id).head_id!, 'grp_fall', 'engine', [
      { type: 'set_hp', hp: 0, reason: 'a fall' },
      { type: 'status', status: 'downed', reason: 'a fall' }
    ])
    await run(engine.act(id, 'I try to stay awake.', signal))
    expect(campaigns.view(id).state.character.status).toBe('alive')
    expect(lastNotes()).toContain('Mira (a companion, a healer) tends the fallen character and brings them round')
    expect(db.eventsFor(id).some((e) => e.event.type === 'death_roll')).toBe(false)
    expect(campaigns.view(id).messages.at(-1)!.changes.map((c) => c.text)).toContain('Mira brought you round')

    // The story says she goes her own way.
    fake.scribe = { ...blankScribe(), companionsLeft: ['Mira'] }
    await run(engine.act(id, 'Farewell, Mira.', signal))
    expect(campaigns.view(id).state.party).toEqual([])
  })

  it('what a group thinks of the character goes on social checks with its people, and the DM is told', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    fake.referee = { intent: 'other', checks: [] }
    const pell = { name: 'Sergeant Pell', otherNames: [], who: 'a gruff watchman', newFacts: [], status: 'alive', attitude: 'neutral', relation: 'none', faction: 'the Town Watch' }
    fake.scribe = { ...blankScribe(), factions: [{ name: 'the Town Watch', what: 'keepers of the peace', standingChange: 2, why: 'caught the cutpurse for them' }], people: [pell] }
    await run(engine.act(id, 'I hand the cutpurse over to the watch.', signal))
    expect(campaigns.view(id).memory.entities.find((e) => e.kind === 'faction')).toMatchObject({ name: 'the Town Watch', standing: 2 })

    fake.scribe = blankScribe()
    fake.referee = {
      intent: 'social',
      checks: [{ skill: 'persuasion', difficulty: 'moderate', modifier: 0, advantage: 'none', reason: 'asking Pell for the gate key', dramatic: false, withStrangers: true, risk: 'none', riskSource: 'sentient', faction: '' }]
    }
    await run(engine.act(id, 'Sergeant, could you let me through the gate tonight?', signal))
    const roll = [...campaigns.view(id).messages].reverse().find((m) => m.role === 'user')!.checks[0]
    expect(roll.reputation).toEqual({ faction: 'the Town Watch', value: 2 })
    expect(roll.breakdown).toContainEqual({ label: 'Standing with the Town Watch', value: 2 })
    expect(fake.lastSystem).toContain('WHAT GROUPS THINK OF THE CHARACTER')
    expect(fake.lastSystem).toContain('- the Town Watch: trusted (+2). Why: caught the cutpurse for them (+2).')
  })

  it('with an embedding model, the DM is reminded of lore by meaning, and a broken one stops nothing', async () => {
    db.saveLorebook({
      id: 'lb_north',
      name: 'The North',
      description: '',
      global: true,
      entries: [
        normalizeEntry({ id: 'grey', keys: ['greycoats'], content: 'The greycoats are the wolf packs of the north; they hunt in silence.' }),
        normalizeEntry({ id: 'ember', keys: ['ember festival'], content: 'The ember festival lights every hearth at midwinter.' }),
        normalizeEntry({ id: 'salt', keys: ['salt tax'], content: 'Salt is taxed at the river ford.' }),
        normalizeEntry({ id: 'glass', keys: ['glass tower'], content: 'The tower library burned twice.' }),
        normalizeEntry({ id: 'gods', keys: ['old gods'], content: 'The old gods sleep.' }),
        normalizeEntry({ id: 'bridge', keys: ['kings bridge'], content: 'The kings bridge is closed at dusk.' })
      ]
    })
    // A pretend embedding model: a text's vector counts its words about a few topics.
    const topics = [/wol(f|ves)|howl|pack/gi, /\binn\b|hearth|ale/gi, /river|ford|salt/gi, /tower|library/gi]
    const fetcher = (async (_url: string, init: RequestInit) => {
      const input = (JSON.parse(String(init.body)) as { input: string[] }).input
      return Response.json({ data: input.map((t, index) => ({ index, embedding: topics.map((re) => (t.match(re)?.length ?? 0) + 0.01) })) })
    }) as unknown as typeof fetch
    const config = () => ({ embeddings: { enabled: true, baseUrl: '', model: 'fake-embed' }, connection: { presetId: 'lmstudio', kind: 'openai' as const, baseUrl: 'x', model: 'fake', contextSize: 0 } })
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    fake.referee = { intent: 'other', checks: [] }
    await run(engine.act(id, 'A howl rises from the pines; wolves are hunting.', signal))
    // No keyword, no lore.
    expect(fake.lastSystem).not.toContain('The greycoats are')
    engine.embedder = new Embedder(db, config, async () => undefined, fetcher)
    await run(engine.act(id, 'Another howl, closer now. The wolves are near.', signal))
    expect(fake.lastSystem).toContain('The greycoats are the wolf packs of the north')
    expect(fake.lastSystem).not.toContain('The ember festival')
    // An embedding server that's down: the story goes on, on names and keywords.
    engine.embedder = new Embedder(db, config, async () => undefined, (async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch)
    await run(engine.act(id, 'I wait for the dawn by the fire.', signal))
    const last = campaigns.view(id).messages.at(-1)!
    expect(last.error).toBeUndefined()
    expect(last.content).toMatch(/rain keeps falling/)
  })

  it('the player can ask someone along, say what they do in a fight, and part ways', async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    campaigns.party(id, { join: { name: 'Old Tam' } })
    expect(() => campaigns.party(id, { join: { name: 'old tam' } })).toThrow(/already travelling/)
    expect(() => campaigns.party(id, { join: { name: build.name } })).toThrow(/That's you/)
    const tam = campaigns.view(id).state.party[0]
    expect(tam).toMatchObject({ id: 'ally_old_tam', name: 'Old Tam', role: 'fighter' })
    campaigns.party(id, { role: { id: tam.id, role: 'scout' } })
    expect(campaigns.view(id).state.party[0].role).toBe('scout')
    campaigns.party(id, { leave: tam.id })
    expect(campaigns.view(id).state.party).toEqual([])
    expect(() => campaigns.party(id, { leave: tam.id })).toThrow(/no longer travelling/)
    for (const n of ['A', 'B', 'C', 'D']) campaigns.party(id, { join: { name: n } })
    expect(() => campaigns.party(id, { join: { name: 'E' } })).toThrow(/At most 4/)
  })

  it("rewriting the DM's reply keeps someone the player asked along; rewinding past the turn doesn't", async () => {
    const id = campaigns.create(build, DEFAULT_SETTINGS)
    await run(engine.narrateHead(id, signal))
    fake.referee = { intent: 'other', checks: [] }
    await run(engine.act(id, 'I wave to Wenna.', signal))
    campaigns.party(id, { join: { name: 'Wenna' } })
    expect(campaigns.view(id).messages.at(-1)!.changes.map((c) => c.text)).toContain('Wenna travels with you')
    await run(engine.regenerate(id, signal))
    const v = campaigns.view(id)
    expect(v.messages.at(-1)!.swipe?.count).toBe(2)
    expect(v.state.party.map((a) => a.name)).toEqual(['Wenna'])
    campaigns.rewind(id, v.messages.at(-3)!.id)
    expect(campaigns.view(id).state.party).toEqual([])
  })
})
