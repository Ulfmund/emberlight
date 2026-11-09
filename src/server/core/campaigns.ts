import {
  allyId,
  guessRole,
  partyFromCast,
  PARTY_MAX,
  type CompanionRole,
  charXpForLevel,
  derived,
  initialState,
  project,
  RACES,
  RENOWN_TIERS,
  SEXES,
  BACKGROUNDS,
  SKILL_IDS,
  SKILLS,
  CONDITIONS,
  skillCaps,
  skillLevelFromXp,
  TIER_INFO,
  capacityKg,
  carriedKg,
  defenseValue,
  encumbrance,
  mainWeapon,
  needs,
  templateOf,
  foeRoster,
  spellById,
  validateBuild,
  type Fallen,
  type Slot,
  type CampaignSettings,
  type CombatOutcome,
  type CharacterBuild,
  type CheckResult,
  type GameEvent,
  type GameState
} from '@shared/rules'
import type { CampaignSummary, CampaignView, ChangeLine, MessageView } from '@shared/view'
import type { CastMember } from '@shared/cards'
import { projectMemory, sameName, type MemoryEvent } from '@shared/memory'
import { normalizeEntry, type LoreEntry } from '@shared/lore'
import type { World } from '@shared/worlds'
import { GameDb, newId, type CampaignRow, type EventRow, type LorebookRow, type MessageRow } from '../store/db'

export const OPENING_TEXT = '((Begin the adventure: set an opening scene for my character.))'

/** A child takes up the tale this many years after their parent's death. */
export const HEIR_YEARS = 10

/** The hidden nudge that opens a successor's story. */
export function successorOpening(f: Fallen, build: CharacterBuild, child: boolean): string {
  const who = `${build.name.trim()}, ${RACES[build.race].label.toLowerCase()} ${BACKGROUNDS[build.background].label.toLowerCase()}`
  return `((A new chapter. ${f.name} is dead: ${f.cause}. ${
    child ? `${HEIR_YEARS} years later, their child ${who}, takes up the road.` : `A few days later, a new adventurer comes to the same lands: ${who}.`
  } Set an opening scene for them, somewhere that fits who they are. The world goes on: its people and places are still there and remember what happened, and ${f.name} may turn up in the story again, in a grave, a rumour or a belonging found.))`
}

export function openingText(cast: CastMember[], world?: World): string {
  const names = cast.filter((m) => m.role === 'companion').map((m) => m.name)
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const company = names.length ? ` ${list} ${names.length === 1 ? 'is' : 'are'} there too.` : ''
  if (world) return `((Begin the adventure in ${world.name}. ${world.opening}${company}))`
  if (!names.length) return OPENING_TEXT
  return `((Begin the adventure: set an opening scene for my character, with ${list} there too.))`
}

export type CreateExtras = {
  cast?: CastMember[]
  /** Open the story with these instead of asking the DM (a card's greetings; extra ones become swipes). */
  greetings?: string[]
  /** Lorebooks from the library to attach. */
  lorebooks?: string[]
  /** A starter world: its lorebook, opening scene and starting place. */
  world?: World
}

/**
 * Campaigns, their story trees and their event logs. The story is a tree: every reroll or
 * rewind starts a new branch, and the campaign's "head" says which branch is being played.
 * Game state is always rebuilt from the events on the active branch (event sourcing).
 */
export class Campaigns {
  constructor(readonly db: GameDb) {}

  list(): CampaignSummary[] {
    return this.db.listCampaigns().map((c) => {
      const st = this.state(c)
      return {
        id: c.id,
        name: c.name,
        characterName: st.character.build.name,
        race: RACES[st.character.build.race].label,
        sex: SEXES[c.settings.sexModifiers][st.character.build.sex].label,
        background: BACKGROUNDS[st.character.build.background].label,
        level: st.character.level,
        status: st.character.status,
        location: st.location,
        day: st.time.day,
        updatedAt: c.updated_at,
        portraitId: c.cast.find((m) => m.role === 'player' && m.hasImage)?.cardId
      }
    })
  }

  create(build: CharacterBuild, settings: CampaignSettings, name?: string, extras: CreateExtras = {}): string {
    const id = newId('cmp')
    const opening = newId('msg')
    const cast = extras.cast ?? []
    const greetings = extras.greetings ?? []
    const world = extras.world
    const lorebooks = [...new Set([...(world ? [world.lorebook.id] : []), ...(extras.lorebooks ?? [])])]
    this.db.transaction(() => {
      this.db.createCampaign({ id, name: name?.trim() || `The tale of ${build.name}`, head_id: opening, settings, build, cast, lorebooks })
      const now = Date.now()
      this.db.addMessage({
        id: opening,
        campaign_id: id,
        parent_id: null,
        role: 'user',
        content: openingText(cast, world),
        thinking: '',
        meta: { hidden: true, kind: 'opening' },
        created_at: now
      })
      if (world) this.db.addEvents(id, opening, newId('grp'), 'engine', [{ type: 'location', name: world.start }])
      let first: string | null = null
      greetings.forEach((g, i) => {
        const m = this.db.addMessage({ id: newId('msg'), campaign_id: id, parent_id: opening, role: 'assistant', content: g, thinking: '', meta: { kind: 'narration' }, created_at: now + 1 + i })
        first ??= m.id
      })
      if (first) this.db.setHead(id, first)
    })
    return id
  }

  get(id: string): CampaignRow {
    const c = this.db.getCampaign(id)
    if (!c) throw new Error('That adventure no longer exists.')
    return c
  }

  /** Messages from the start of the story to the head, in order. */
  path(c: CampaignRow, messages = this.db.messagesFor(c.id)): MessageRow[] {
    const byId = new Map(messages.map((m) => [m.id, m]))
    const out: MessageRow[] = []
    let cur = c.head_id ? byId.get(c.head_id) : undefined
    while (cur) {
      out.push(cur)
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    return out.reverse()
  }

  /** Events that count: on the active branch and not replaced by a reroll. */
  activeEvents(c: CampaignRow, path: MessageRow[], all = this.db.eventsFor(c.id)): EventRow[] {
    const onPath = new Set(path.map((m) => m.id))
    return all.filter((e) => onPath.has(e.message_id) && !e.superseded)
  }

  /** Where every story starts: the character, with the cast's companions beside them. */
  private start(c: CampaignRow): GameState {
    return { ...initialState(c.build, c.settings), party: partyFromCast(c.cast) }
  }

  state(c: CampaignRow, upTo?: { path: MessageRow[]; excludeGroup?: string }): GameState {
    const path = upTo?.path ?? this.path(c)
    const events = this.activeEvents(c, path).filter((e) => e.group_id !== upTo?.excludeGroup)
    return project(this.start(c), events.map((e) => e.event), c.settings)
  }

  view(id: string): CampaignView {
    const c = this.get(id)
    const all = this.db.messagesFor(id)
    const path = this.path(c, all)
    const events = this.activeEvents(c, path)
    const state = project(this.start(c), events.map((e) => e.event), c.settings)

    const children = new Map<string, MessageRow[]>()
    for (const m of all) {
      const key = m.parent_id ?? '__root'
      if (!children.has(key)) children.set(key, [])
      children.get(key)!.push(m)
    }
    const eventsByMsg = new Map<string, EventRow[]>()
    for (const e of events) {
      if (!eventsByMsg.has(e.message_id)) eventsByMsg.set(e.message_id, [])
      eventsByMsg.get(e.message_id)!.push(e)
    }

    const messages: MessageView[] = path.map((m) => {
      const sibs = children.get(m.parent_id ?? '__root') ?? [m]
      const mine = eventsByMsg.get(m.id) ?? []
      // A DM reply also shows what a fight or a random event did on the player's turn before it.
      const before = m.role === 'assistant' && m.parent_id ? (eventsByMsg.get(m.parent_id) ?? []) : []
      const shown = before.some((e) => SHOWN_WITH_REPLY.has(e.event.type)) ? [...before.filter((e) => e.event.type !== 'roll'), ...mine] : mine
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        hidden: Boolean(m.meta.hidden),
        kind: m.meta.kind,
        // An empty DM message with no error was cut off (app closed mid-response, crash…).
        error: m.meta.error ?? (m.role === 'assistant' && !m.content.trim() ? 'This response was interrupted. Use Rewrite to try again.' : undefined),
        notice: m.meta.notice,
        requestCheck: m.meta.requestCheck as MessageView['requestCheck'],
        swipe: m.role === 'assistant' && sibs.length > 1 ? { index: sibs.findIndex((s) => s.id === m.id), count: sibs.length, ids: sibs.map((s) => s.id) } : undefined,
        checks: mine.filter((e) => e.event.type === 'roll').map((e) => (e.event as { check: CheckResult }).check),
        changes: describeEvents(shown.map((e) => e.event)),
        createdAt: m.created_at,
        image: m.meta.image
      }
    })

    const d = derived(state, c.settings)
    // The character now playing: the one the story began with, or whoever took up the tale.
    const build = state.character.build
    const sCaps = skillCaps(build, c.settings.sexModifiers)
    const level = state.character.level
    const last = path[path.length - 1]
    return {
      id: c.id,
      name: c.name,
      settings: c.settings,
      build,
      state,
      derived: {
        ...d,
        skillCaps: sCaps,
        skillLevels: Object.fromEntries(SKILL_IDS.map((s) => [s, skillLevelFromXp(state.character.skillXp[s] ?? 0)])),
        renownTier: RENOWN_TIERS.find((t) => state.character.renown >= t.min)!.label,
        xpIntoLevel: state.character.xp - charXpForLevel(level),
        xpForNext: charXpForLevel(level + 1) - charXpForLevel(level),
        defense: defenseValue(state.character).total,
        weapon: mainWeapon(state.character),
        carried: carriedKg(state.character),
        capacity: capacityKg(state.character),
        load: encumbrance(state.character),
        needs: needs(state, c.settings.survival)
      },
      cast: c.cast.map((m) => ({ cardId: m.cardId, role: m.role, name: m.name, hasImage: m.hasImage })),
      memory: projectMemory(events.map((e) => e.event)),
      lorebooks: c.lorebooks.map((lid) => this.db.getLorebook(lid)).filter((b) => b !== null).map((b) => ({ id: b.id, name: b.name, entries: b.entries.length })),
      messages,
      awaitingNarration: last?.role === 'user',
      saves: this.db.savesFor(id).map((s) => ({ id: s.id, name: s.name, messageId: s.message_id, createdAt: s.created_at }))
    }
  }

  delete(id: string) {
    this.db.deleteCampaign(id)
  }

  /**
   * After a death, a new character takes up the tale in the same world (docs/spec/03-characters-
   * and-cards.md#when-a-character-dies). A child of the dead inherits half their renown, their
   * savings and their weapon, years later; anyone else arrives a few days on with what their
   * calling gives them. The people of the world remember the dead, and the new character's
   * opening scene waits to be narrated.
   */
  successor(id: string, build: CharacterBuild, childId?: string) {
    const c = this.get(id)
    const path = this.path(c)
    const state = this.state(c, { path })
    const dead = state.character
    if (dead.status !== 'dead') throw new Error('Only a fallen character can be succeeded.')
    const head = path[path.length - 1]
    if (!head) throw new Error('This story has no messages yet.')
    const errors = validateBuild(build, c.settings.sexModifiers)
    if (errors.length) throw new Error(errors[0])
    const rows = this.activeEvents(c, path)
    const memory = projectMemory(rows.map((e) => e.event))
    const child = childId ? memory.entities.find((e) => e.id === childId && e.kind === 'person' && e.relation === 'child' && e.status !== 'dead') : undefined
    if (childId && !child) throw new Error('That child is no longer in the story.')

    const death = [...rows].reverse().find((e) => e.event.type === 'status' && e.event.status === 'dead')?.event as { reason?: string } | undefined
    const cause = death?.reason?.trim() || 'fell'
    const b = dead.build
    const fallen: Fallen = {
      name: b.name,
      race: b.race,
      sex: b.sex,
      background: b.background,
      level: dead.level,
      renown: dead.renown,
      deeds: dead.deeds.map((x) => x.text),
      day: state.time.day,
      cause,
      epitaph: dead.epitaph,
      heir: build.name.trim(),
      heirIsChild: Boolean(child)
    }
    const weapon = mainWeapon(dead)
    const first = b.name.trim().split(/\s+/)[0]
    const inherit = child
      ? { coins: dead.coins, renown: Math.floor(dead.renown / 2), items: weapon.unarmed ? [] : [{ name: `${first}'s ${weapon.name.toLowerCase()}`, qty: 1 }] }
      : undefined
    const days = child ? HEIR_YEARS * 365 : 3

    const events: (GameEvent | MemoryEvent)[] = [{ type: 'new_character', build, days, fallen, inherit }]
    // The world remembers the dead…
    events.push({
      type: 'entity',
      kind: 'person',
      name: b.name,
      summary: `${RACES[b.race].label} ${BACKGROUNDS[b.background].label.toLowerCase()}, an adventurer who died on day ${state.time.day}`,
      facts: [`Died: ${cause}`, ...fallen.deeds.slice(-3)],
      status: 'dead',
      relation: child ? 'parent' : undefined,
      day: state.time.day
    })
    // …but ties to the dead aren't ties to the newcomer. A child keeps the family, re-labelled.
    for (const e of memory.entities) {
      if (e.kind !== 'person' || e.id === child?.id) continue
      if (child) {
        const r = e.relation
        const next = r === 'child' ? 'sibling' : r === 'spouse' ? 'parent' : r === 'lover' || r === 'parent' || r === 'sibling' ? null : undefined
        if (next !== undefined) events.push({ type: 'entity_edit', id: e.id, relation: next, ...(r === 'parent' ? { facts: [...e.facts, `Grandparent of ${build.name.trim()}`] } : {}) })
      } else if (e.relation || e.attitude) events.push({ type: 'entity_edit', id: e.id, relation: null, attitude: null })
    }
    // The child is the player character now, not someone in the Journal.
    if (child) events.push({ type: 'entity_forget', id: child.id })

    // The new chapter starts with its own (hidden) opening message, so rewinding to the death
    // shows the death, and the heir's story is a branch from there.
    const opening = this.db.addMessage({
      id: newId('msg'),
      campaign_id: id,
      parent_id: head.id,
      role: 'user',
      content: successorOpening(fallen, build, Boolean(child)),
      thinking: '',
      meta: { hidden: true, kind: 'opening' }
    })
    this.db.addEvents(id, opening.id, newId('grp'), 'player', events as GameEvent[])
    this.db.setHead(id, opening.id)
  }

  /** The character's picture: kept with the newest message, so a successor starts without one. */
  setPortrait(id: string, media: string | null) {
    const c = this.get(id)
    if (!c.head_id) throw new Error('This story has no messages yet.')
    this.db.addEvents(id, c.head_id, newId('grp'), 'player', [{ type: 'portrait', media }])
  }

  /**
   * Companions, from the player's side: ask someone to come along, part ways, or say what a
   * companion does in a fight. Kept with the player's latest turn, so rewriting the DM's reply
   * to it doesn't undo them (rewinding past that turn does).
   */
  party(id: string, act: { join: { name: string; role?: CompanionRole } } | { leave: string } | { role: { id: string; role: CompanionRole } }) {
    const c = this.get(id)
    if (!c.head_id) throw new Error('This story has no messages yet.')
    const path = this.path(c)
    const st = this.state(c, { path })
    let ev: GameEvent
    if ('join' in act) {
      const name = act.join.name.trim().slice(0, 60)
      if (!name) throw new Error('Who should come along?')
      if (sameName(name, st.character.build.name)) throw new Error("That's you.")
      if (st.party.some((a) => sameName(a.name, name))) throw new Error(`${name} is already travelling with you.`)
      if (st.party.length >= PARTY_MAX) throw new Error(`At most ${PARTY_MAX} can travel with you. Part ways with someone first.`)
      // A card's character keeps their card; someone from the Journal, their record.
      const card = c.cast.find((m) => m.role === 'companion' && sameName(m.name, name))
      const person = projectMemory(this.activeEvents(c, path).map((e) => e.event)).entities.find((e) => e.kind === 'person' && [e.name, ...e.aliases].some((n) => sameName(n, name)))
      if (person?.status === 'dead') throw new Error(`${person.name} is dead.`)
      const role = act.join.role ?? guessRole(card ? `${card.description}\n${card.personality}` : `${person?.summary ?? ''}\n${(person?.facts ?? []).join('\n')}`)
      ev = { type: 'party_join', companion: card ? { id: card.cardId, name: card.name, role, card: card.cardId } : { id: allyId(person?.name ?? name), name: person?.name ?? name, role } }
    } else if ('leave' in act) {
      const a = st.party.find((x) => x.id === act.leave)
      if (!a) throw new Error('They are no longer travelling with you.')
      ev = { type: 'party_leave', id: a.id, name: a.name, why: 'left' }
    } else {
      const a = st.party.find((x) => x.id === act.role.id)
      if (!a) throw new Error('They are no longer travelling with you.')
      ev = { type: 'party_role', id: a.id, role: act.role.role }
    }
    const anchor = [...path].reverse().find((m) => m.role === 'user') ?? path[path.length - 1]
    this.db.addEvents(id, anchor.id, newId('grp'), 'player', [ev])
  }

  /** New words for the character's appearance (the DM uses them from now on). */
  setAppearance(id: string, appearance: string) {
    const c = this.get(id)
    if (!c.head_id) throw new Error('This story has no messages yet.')
    this.db.addEvents(id, c.head_id, newId('grp'), 'player', [{ type: 'build_edit', appearance }])
  }

  /** Show a different version of a DM message (and whatever came after it on that branch). */
  selectSwipe(id: string, messageId: string) {
    const all = this.db.messagesFor(id)
    let cur = all.find((m) => m.id === messageId)
    if (!cur) throw new Error('That message no longer exists.')
    // Follow the newest child at each step to the end of that branch.
    for (;;) {
      const kids = all.filter((m) => m.parent_id === cur!.id)
      if (!kids.length) break
      cur = kids[kids.length - 1]
    }
    this.db.setHead(id, cur.id)
  }

  /** Go back to a point in the story. Everything after it stays saved as another branch. */
  rewind(id: string, messageId: string) {
    const m = this.db.getMessage(messageId)
    if (!m || m.campaign_id !== id) throw new Error('That message no longer exists.')
    this.db.setHead(id, messageId)
  }

  updateSettings(id: string, settings: CampaignSettings) {
    this.db.updateCampaign(id, { settings })
  }

  rename(id: string, name: string) {
    this.db.updateCampaign(id, { name })
  }

  /**
   * The player handles their gear directly (the Bag tab): equip, take off, use or drop. Tied to
   * the newest player message, so rewriting the DM's reply keeps it.
   */
  inventoryAction(id: string, action: 'equip' | 'unequip' | 'use' | 'drop', name: string, slot?: Slot, rng: () => number = Math.random) {
    const c = this.get(id)
    const path = this.path(c)
    const state = this.state(c, { path })
    if (state.character.status === 'dead') throw new Error('The dead carry nothing.')
    const item = state.character.inventory.find((i) => i.name.toLowerCase() === name.toLowerCase())
    if (!item) throw new Error(`You don't have ${name} any more.`)
    const tpl = templateOf(item)
    let ev: GameEvent
    if (action === 'equip') {
      if (!tpl?.fit) throw new Error(`${item.name} isn't something you wear or hold.`)
      ev = { type: 'equip', name: item.name, slot }
    } else if (action === 'unequip') {
      ev = { type: 'unequip', name: item.name }
    } else if (action === 'use') {
      if (!tpl || !(tpl.food || tpl.heal || tpl.cures?.length)) throw new Error(`${item.name} can't be used like that. Say what you do with it in the story instead.`)
      let heal: number | undefined
      if (tpl.heal) {
        const [n, sides, flat] = tpl.heal
        heal = flat
        for (let i = 0; i < n; i++) heal += 1 + Math.floor(rng() * sides)
      }
      ev = { type: 'use_item', name: item.name, heal }
    } else {
      ev = { type: 'item', name: item.name, delta: -item.qty }
    }
    const anchor = [...path].reverse().find((m) => m.role === 'user') ?? path[0]
    this.db.addEvents(id, anchor.id, newId('inv'), 'player', [ev])
  }

  /** Which library lorebooks this story uses. */
  setLorebooks(id: string, ids: string[]) {
    this.get(id)
    this.db.updateCampaign(id, { lorebooks: [...new Set(ids)].filter((x) => this.db.getLorebook(x)) })
  }

  /** The entries of this story's lorebooks, read fresh so edits in the library apply at once. */
  /** The story's lorebooks, and every book marked for all adventures. */
  private loreBooks(c: CampaignRow): LorebookRow[] {
    const ids = new Set(c.lorebooks)
    for (const b of this.db.listLorebooks()) if (b.global) ids.add(b.id)
    return [...ids].map((lid) => this.db.getLorebook(lid)).filter((b): b is LorebookRow => b !== null)
  }

  /** Entries for the DM, each tagged with its book (for that book's own budget). */
  loreEntries(c: CampaignRow): (LoreEntry & { book: string })[] {
    return this.loreBooks(c).flatMap((b) => b.entries.map((e) => ({ ...normalizeEntry(e), book: b.id })))
  }

  /** Books with a character limit of their own. */
  loreBudgets(c: CampaignRow): Record<string, number> {
    return Object.fromEntries(this.loreBooks(c).filter((b) => (b.budget ?? 0) > 0).map((b) => [b.id, b.budget!]))
  }

  /**
   * A correction or note from the Journal. It's tied to the very start of the story, so it
   * survives rerolls, rewrites and rewinds: the Journal is the player's. A correction to
   * someone who doesn't exist on the branch being played simply does nothing there.
   */
  journal(id: string, edit: MemoryEvent) {
    const c = this.get(id)
    const anchor = this.path(c)[0]
    if (!anchor) throw new Error('This adventure has no story yet.')
    this.db.addEvents(id, anchor.id, newId('jrnl'), 'player', [edit])
  }
}

// ---- Change log text ------------------------------------------------------------------

export function describeEvents(events: GameEvent[]): ChangeLine[] {
  const out: (ChangeLine & { spent?: string })[] = []
  for (const ev of events) {
    switch (ev.type) {
      case 'skill_xp':
        out.push({ text: `+${ev.amount} ${SKILLS[ev.skill].label} XP`, tone: 'good', icon: 'star' })
        break
      case 'xp':
        out.push({ text: `+${ev.amount} XP: ${ev.reason}`, tone: 'good', icon: 'star' })
        break
      case 'damage':
        out.push({ text: `−${ev.amount} HP${ev.reason ? `: ${ev.reason}` : ''}`, tone: 'bad', icon: 'heart' })
        break
      case 'heal':
        out.push({ text: `+${ev.amount} HP${ev.reason ? `: ${ev.reason}` : ''}`, tone: 'good', icon: 'heart' })
        break
      case 'set_hp':
        out.push({ text: `HP set to ${ev.hp}: ${ev.reason}`, tone: 'neutral', icon: 'heart' })
        break
      case 'stamina':
        if (ev.delta) out.push({ text: `${ev.delta > 0 ? '+' : '−'}${Math.abs(ev.delta)} stamina`, tone: ev.delta > 0 ? 'good' : 'neutral', icon: 'bolt' })
        break
      case 'mana':
        out.push({ text: `${ev.delta > 0 ? '+' : '−'}${Math.abs(ev.delta)} mana`, tone: ev.delta > 0 ? 'good' : 'neutral', icon: 'sparkle' })
        break
      case 'condition':
        out.push({ text: `${ev.on ? 'Now' : 'No longer'} ${CONDITIONS[ev.id].label.toLowerCase()}`, tone: ev.on === ['well_fed', 'inspired', 'hidden'].includes(ev.id) ? 'good' : 'bad', icon: CONDITIONS[ev.id].icon })
        break
      case 'rest':
        out.push({ text: ev.kind === 'long' ? 'Slept: health, stamina and mana restored' : 'Rested: stamina restored', tone: 'good', icon: 'moon' })
        break
      case 'time':
        if (ev.minutes >= 60) out.push({ text: `${Math.round(ev.minutes / 60)} hour${ev.minutes >= 120 ? 's' : ''} passed`, tone: 'neutral', icon: 'hourglass' })
        break
      case 'renown':
        out.push({ text: `+${ev.amount} Renown${ev.deed ? `: ${ev.deed}` : ''}`, tone: 'good', icon: 'laurel' })
        break
      case 'coins':
        out.push({ text: `${ev.delta > 0 ? '+' : '−'}${formatCoins(Math.abs(ev.delta))}`, tone: ev.delta > 0 ? 'good' : 'neutral', icon: 'coin' })
        break
      case 'item': {
        if (ev.spent) {
          // Arrows shot in a fight: one line for the turn, however many.
          const prev = out.find((l) => l.spent === ev.name)
          if (prev) prev.text = `−${Number(/\d+/.exec(prev.text)?.[0] ?? 1) - ev.delta} ${ev.name}`
          else out.push({ text: `−${-ev.delta} ${ev.name}`, tone: 'neutral', icon: ev.icon ?? 'arrow', spent: ev.name })
          break
        }
        out.push({ text: `${ev.delta > 0 ? 'Gained' : 'Lost'} ${Math.abs(ev.delta) > 1 ? `${Math.abs(ev.delta)}× ` : ''}${ev.name}`, tone: ev.delta > 0 ? 'good' : 'neutral', icon: ev.icon ?? 'bag' })
        break
      }
      case 'status':
        out.push({ text: ev.status === 'dead' ? `Died: ${ev.reason}` : ev.status === 'downed' ? 'Downed: making death rolls' : ev.reason, tone: ev.status === 'alive' ? 'good' : 'bad', icon: 'skull' })
        break
      case 'death_roll':
        out.push({ text: `Death roll ${ev.roll}: ${ev.success ? 'holding on' : ev.double ? 'two failures' : 'slipping'}`, tone: ev.success ? 'neutral' : 'bad', icon: 'skull' })
        break
      case 'attr_spend':
        out.push({ text: `+1 ${ev.attr}`, tone: 'good', icon: 'star' })
        break
      case 'equip':
        out.push({ text: `Equipped ${ev.name}`, tone: 'neutral', icon: 'sword' })
        break
      case 'unequip':
        out.push({ text: `Took off ${ev.name}`, tone: 'neutral', icon: 'bag' })
        break
      case 'use_item':
        out.push({ text: `Used ${ev.name}${ev.heal ? `: +${ev.heal} HP` : ''}`, tone: 'good', icon: ev.heal ? 'heart' : 'bag' })
        break
      case 'eat':
        out.push({ text: ev.wellFed ? 'Ate well' : ev.hours >= 8 ? 'Had a meal' : 'Had a bite', tone: 'good', icon: 'bread' })
        break
      case 'place_kind':
        break
      case 'combat_start':
        out.push({ text: `A fight: ${foeRoster(ev.combat.foes)}`, tone: 'bad', icon: 'sword' })
        break
      case 'foe_hit':
        out.push({ text: `${ev.by ? `${ev.by} hit` : 'Hit'} ${ev.name ?? 'a foe'} for ${ev.amount}`, tone: 'good', icon: 'sword' })
        break
      case 'party_join':
        out.push({ text: `${ev.companion.name} travels with you`, tone: 'good', icon: 'party' })
        break
      case 'party_leave':
        out.push({ text: ev.why === 'dead' ? `${ev.name ?? 'A companion'} is dead` : `${ev.name ?? 'A companion'} parted ways with you`, tone: ev.why === 'dead' ? 'bad' : 'neutral', icon: ev.why === 'dead' ? 'skull' : 'party' })
        break
      case 'ally_hit':
        out.push({ text: `${ev.name ?? 'A companion'} took ${ev.amount} damage`, tone: 'bad', icon: 'heart' })
        break
      case 'ally_heal':
        out.push({ text: `${ev.name ?? 'A companion'}: +${ev.amount} HP`, tone: 'good', icon: 'heart' })
        break
      case 'ally_care':
        out.push({ text: `${ev.name ?? 'A companion'} brought you round`, tone: 'good', icon: 'heart' })
        break
      case 'party_role':
        break
      case 'foe_status':
        out.push({ text: `${ev.name ?? 'A foe'} ${ev.status === 'fled' ? 'fled' : ev.status === 'surrendered' ? 'yielded' : ev.status === 'down' ? 'is down' : ev.status === 'asleep' ? 'fell asleep' : 'fights on'}`, tone: 'good', icon: ev.status === 'fled' ? 'boot' : ev.status === 'asleep' ? 'moon' : 'sword' })
        break
      case 'combat_end':
        out.push({ text: COMBAT_END_LINE[ev.outcome], tone: ev.outcome === 'defeat' ? 'bad' : 'good', icon: ev.outcome === 'defeat' ? 'skull' : ev.outcome === 'fled' ? 'boot' : 'laurel' })
        break
      case 'world_event':
        out.push({ text: 'Something happens', tone: 'neutral', icon: 'signpost' })
        break
      case 'learn_spell':
        out.push({ text: `Learned ${spellById(ev.id)?.name ?? ev.name ?? 'a spell'}`, tone: 'good', icon: 'sparkle' })
        break
      case 'foe_weaken':
        out.push({ text: `Cursed ${ev.name ?? 'a foe'}`, tone: 'good', icon: 'sparkle' })
        break
      case 'combat_ward':
        out.push({ text: `Warded: +${ev.amount} Defense`, tone: 'good', icon: 'armor' })
        break
      case 'combat_round':
      case 'combat_dodge':
      case 'foe_attack':
        break
      case 'location':
        out.push({ text: `Now at ${ev.name}`, tone: 'neutral', icon: 'map' })
        break
      case 'roll':
        out.push({ text: `${SKILLS[ev.check.skill].label}: ${TIER_INFO[ev.check.tier].label}`, tone: TIER_INFO[ev.check.tier].success ? 'good' : 'bad', icon: 'd20' })
        break
      case 'trait_used':
      case 'entity':
      case 'summary':
      case 'arc':
        break
    }
  }
  return out.map(({ spent: _spent, ...line }) => line)
}

/** Events from a fight or a random event (their change lines show under the DM's reply). */
const FIGHT_EVENTS = new Set<GameEvent['type']>(['combat_start', 'combat_round', 'combat_end', 'foe_hit', 'foe_status', 'foe_attack', 'ally_hit', 'ally_heal', 'world_event'])
/** On the player's turn, these (and whatever came with them) show under the DM's reply: player messages show no changes of their own. */
const SHOWN_WITH_REPLY = new Set<GameEvent['type']>([...FIGHT_EVENTS, 'ally_care', 'party_join', 'party_leave'])

const COMBAT_END_LINE: Record<CombatOutcome, string> = {
  victory: 'Won the fight',
  fled: 'Got away',
  defeat: 'Lost the fight',
  truce: 'The foes stood down',
  ended: 'The fight is over'
}

export function formatCoins(copper: number): string {
  const g = Math.floor(copper / 100)
  const s = Math.floor((copper % 100) / 10)
  const c = copper % 10
  const parts = [g && `${g} gold`, s && `${s} silver`, c && `${c} copper`].filter(Boolean)
  return parts.length ? parts.join(', ') : '0 copper'
}
