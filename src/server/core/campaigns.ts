import {
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
  type CampaignSettings,
  type CharacterBuild,
  type CheckResult,
  type GameEvent,
  type GameState
} from '@shared/rules'
import type { CampaignSummary, CampaignView, ChangeLine, MessageView } from '@shared/view'
import { GameDb, newId, type CampaignRow, type EventRow, type MessageRow } from '../store/db'

export const OPENING_TEXT = '((Begin the adventure: set an opening scene for my character.))'

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
        characterName: c.build.name,
        race: RACES[c.build.race].label,
        sex: SEXES[c.settings.sexModifiers][c.build.sex].label,
        background: BACKGROUNDS[c.build.background].label,
        level: st.character.level,
        status: st.character.status,
        location: st.location,
        day: st.time.day,
        updatedAt: c.updated_at
      }
    })
  }

  create(build: CharacterBuild, settings: CampaignSettings, name?: string): string {
    const id = newId('cmp')
    const opening = newId('msg')
    this.db.transaction(() => {
      this.db.createCampaign({ id, name: name?.trim() || `The tale of ${build.name}`, head_id: opening, settings, build })
      this.db.addMessage({
        id: opening,
        campaign_id: id,
        parent_id: null,
        role: 'user',
        content: OPENING_TEXT,
        thinking: '',
        meta: { hidden: true, kind: 'opening' }
      })
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

  state(c: CampaignRow, upTo?: { path: MessageRow[]; excludeGroup?: string }): GameState {
    const path = upTo?.path ?? this.path(c)
    const events = this.activeEvents(c, path).filter((e) => e.group_id !== upTo?.excludeGroup)
    return project(initialState(c.build, c.settings), events.map((e) => e.event), c.settings)
  }

  view(id: string): CampaignView {
    const c = this.get(id)
    const all = this.db.messagesFor(id)
    const path = this.path(c, all)
    const events = this.activeEvents(c, path)
    const state = project(initialState(c.build, c.settings), events.map((e) => e.event), c.settings)

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
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        hidden: Boolean(m.meta.hidden),
        kind: m.meta.kind,
        error: m.meta.error,
        notice: m.meta.notice,
        requestCheck: m.meta.requestCheck as MessageView['requestCheck'],
        swipe: m.role === 'assistant' && sibs.length > 1 ? { index: sibs.findIndex((s) => s.id === m.id), count: sibs.length, ids: sibs.map((s) => s.id) } : undefined,
        checks: mine.filter((e) => e.event.type === 'roll').map((e) => (e.event as { check: CheckResult }).check),
        changes: describeEvents(mine.map((e) => e.event)),
        createdAt: m.created_at
      }
    })

    const d = derived(state, c.settings)
    const sCaps = skillCaps(c.build, c.settings.sexModifiers)
    const level = state.character.level
    const last = path[path.length - 1]
    return {
      id: c.id,
      name: c.name,
      settings: c.settings,
      build: c.build,
      state,
      derived: {
        ...d,
        skillCaps: sCaps,
        skillLevels: Object.fromEntries(SKILL_IDS.map((s) => [s, skillLevelFromXp(state.character.skillXp[s] ?? 0)])),
        renownTier: RENOWN_TIERS.find((t) => state.character.renown >= t.min)!.label,
        xpIntoLevel: state.character.xp - charXpForLevel(level),
        xpForNext: charXpForLevel(level + 1) - charXpForLevel(level)
      },
      messages,
      awaitingNarration: last?.role === 'user',
      saves: this.db.savesFor(id).map((s) => ({ id: s.id, name: s.name, messageId: s.message_id, createdAt: s.created_at }))
    }
  }

  delete(id: string) {
    this.db.deleteCampaign(id)
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
}

// ---- Change log text ------------------------------------------------------------------

export function describeEvents(events: GameEvent[]): ChangeLine[] {
  const out: ChangeLine[] = []
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
      case 'item':
        out.push({ text: `${ev.delta > 0 ? 'Gained' : 'Lost'} ${Math.abs(ev.delta) > 1 ? `${Math.abs(ev.delta)}× ` : ''}${ev.name}`, tone: ev.delta > 0 ? 'good' : 'neutral', icon: ev.icon ?? 'bag' })
        break
      case 'status':
        out.push({ text: ev.status === 'dead' ? `Died: ${ev.reason}` : ev.status === 'downed' ? 'Downed: making death rolls' : ev.reason, tone: ev.status === 'alive' ? 'good' : 'bad', icon: 'skull' })
        break
      case 'death_roll':
        out.push({ text: `Death roll ${ev.roll}: ${ev.success ? 'holding on' : ev.double ? 'two failures' : 'slipping'}`, tone: ev.success ? 'neutral' : 'bad', icon: 'skull' })
        break
      case 'attr_spend':
        out.push({ text: `+1 ${ev.attr}`, tone: 'good', icon: 'star' })
        break
      case 'location':
        out.push({ text: `Now at ${ev.name}`, tone: 'neutral', icon: 'map' })
        break
      case 'roll':
        out.push({ text: `${SKILLS[ev.check.skill].label}: ${TIER_INFO[ev.check.tier].label}`, tone: TIER_INFO[ev.check.tier].success ? 'good' : 'bad', icon: 'd20' })
        break
      case 'trait_used':
        break
    }
  }
  return out
}

export function formatCoins(copper: number): string {
  const g = Math.floor(copper / 100)
  const s = Math.floor((copper % 100) / 10)
  const c = copper % 10
  const parts = [g && `${g} gold`, s && `${s} silver`, c && `${c} copper`].filter(Boolean)
  return parts.length ? parts.join(', ') : '0 copper'
}
