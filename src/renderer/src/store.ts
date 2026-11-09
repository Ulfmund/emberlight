import { create } from 'zustand'
import type { SettingsView } from '@shared/types'
import type { Attr, CampaignSettings, CharacterBuild, CheckResult, CombatAction, RaceId, Work } from '@shared/rules'
import type { CampaignSummary, CampaignView, MessageView, TurnEvent } from '@shared/view'
import { api, type CreateOptions } from './api'
import type { MemoryEvent } from '@shared/memory'
import { play } from './sound'
import { useFx } from './fx'

export type Screen = 'title' | 'connect' | 'creator' | 'play' | 'load'

/** After a death: whoever takes up the tale is made in the creator (a stranger, or a child). */
export type Heir = { campaignId: string; settings: CampaignSettings; dead: string; child?: { id: string; name: string }; race?: RaceId }

/** Something worth celebrating or warning about, shown as a toast. */
export type Toast = { id: number; title: string; text?: string; tone: 'good' | 'bad' | 'level' | 'info'; icon: string }

type Live = {
  /** The DM message currently being written. */
  messageId: string | null
  text: string
  thinking: string
  /** Rolls waiting to be shown in the dice tray, in order. */
  dice: CheckResult[]
  /** While the dice tray is up, narration is held back so the result isn't spoiled. */
  hold: boolean
  error: string | null
  notice: string | null
}

const idleLive: Live = { messageId: null, text: '', thinking: '', dice: [], hold: false, error: null, notice: null }

type State = {
  screen: Screen
  settings: SettingsView | null
  campaigns: CampaignSummary[]
  view: CampaignView | null
  busy: boolean
  live: Live
  abort: AbortController | null
  toasts: Toast[]
  /** A finished turn's results, held back until the player has thrown the dice. */
  pendingView: CampaignView | null
  /** The creator is making a successor for a story whose character died. */
  heir: Heir | null

  go(screen: Screen): void
  loadSettings(): Promise<void>
  setSettings(s: SettingsView): void
  loadCampaigns(): Promise<void>
  open(id: string): Promise<void>
  create(build: CharacterBuild, settings: CampaignSettings, opts?: CreateOptions): Promise<void>
  remove(id: string): Promise<void>
  /** After a death: open the creator for whoever takes up the tale. */
  startHeir(h: Heir): void
  /** Back to the story without a successor. */
  cancelHeir(): Promise<void>
  /** The successor joins the story, and their opening scene is narrated. */
  takeUp(build: CharacterBuild): Promise<void>

  /** Free text, or a move picked on the combat tracker, or a recipe from the Bag. */
  act(text: string, picked?: { combat?: CombatAction; work?: Work }): Promise<void>
  answer(messageId: string): Promise<void>
  regenerate(): Promise<void>
  reroll(checkId: string): Promise<void>
  narrateHead(): Promise<void>
  stop(): void
  swipe(messageId: string): Promise<void>
  rewind(messageId: string): Promise<void>
  spend(attr: Attr): Promise<void>
  /** A correction or note from the Journal. */
  journal(edit: MemoryEvent): Promise<void>
  /** Handle gear from the Bag tab. */
  inventory(action: 'equip' | 'unequip' | 'use' | 'drop', name: string, slot?: string): Promise<void>
  /** Which library lorebooks the open story uses. */
  setLorebooks(ids: string[]): Promise<void>
  saveSlot(name: string): Promise<void>
  loadSlot(saveId: string): Promise<void>
  deleteSlot(saveId: string): Promise<void>
  updateCampaignSettings(s: CampaignSettings): Promise<void>

  diceDone(): void
  toast(t: Omit<Toast, 'id'>): void
  dismissToast(id: number): void
}

let toastId = 0

export const useGame = create<State>((set, get) => {
  /** Compare before/after views and celebrate level-ups and new skill levels. */
  const announce = (before: CampaignView | null, after: CampaignView) => {
    if (!before || before.id !== after.id) return
    const b = before.state.character
    const a = after.state.character
    if (a.level > b.level) {
      get().toast({ title: `Level ${a.level}!`, text: '+1 attribute point to spend · +2 Renown', tone: 'level', icon: 'star' })
      useFx.getState().celebrate(a.level)
    }
    // What the turn did, in sound (and a jolt for a big hit).
    if (a.status === 'dead' && b.status !== 'dead') play('death')
    else if (a.level > b.level) play('level')
    else if (a.hp < b.hp) {
      play('hit')
      if (b.hp - a.hp >= Math.max(5, before.derived.maxHp * 0.25)) useFx.getState().bigHit()
    } else if (a.hp > b.hp) play('heal')
    const count = (c: typeof a) => c.inventory.reduce((n, i) => n + i.qty, 0)
    if (a.coins > b.coins) setTimeout(() => play('coin'), 250)
    else if (count(a) > count(b)) setTimeout(() => play('item'), 250)
    for (const [skill, lvl] of Object.entries(after.derived.skillLevels)) {
      const old = before.derived.skillLevels[skill] ?? lvl
      if (lvl > old) get().toast({ title: `${skill[0].toUpperCase()}${skill.slice(1)} ${lvl}`, text: 'Skill level up', tone: 'good', icon: 'star' })
    }
    if (a.renown > b.renown && a.deeds.length > b.deeds.length) {
      const deed = a.deeds[a.deeds.length - 1]
      get().toast({ title: 'Renown grows', text: deed.text, tone: 'good', icon: 'laurel' })
    }
    if (a.status === 'downed' && b.status !== 'downed') get().toast({ title: 'You are down', text: 'Death rolls each turn: three failures and it is over.', tone: 'bad', icon: 'skull' })
    if (a.conditions.includes('captured') && !b.conditions.includes('captured')) get().toast({ title: 'Captured', text: 'Taken prisoner.', tone: 'bad', icon: 'chain' })
  }

  const setView = (view: CampaignView) => {
    // Don't spoil the roll: while the dice tray is up, keep the new results back.
    if (get().live.hold) {
      set({ pendingView: view })
      return
    }
    const before = get().view
    set({ view, pendingView: null })
    announce(before, view)
  }

  /** Runs one streamed turn endpoint and folds its events into the view. */
  const run = async (path: string, body: unknown) => {
    const view = get().view
    if (!view || get().busy) return
    const controller = new AbortController()
    set({ busy: true, abort: controller, live: { ...idleLive } })
    const rollMode = view.settings.rollMode

    await api.stream(
      `/api/campaigns/${view.id}/${path}`,
      body,
      (ev: TurnEvent) => {
        const cur = get().view
        if (!cur) return
        switch (ev.type) {
          case 'player':
            set({ view: { ...cur, messages: [...cur.messages, ev.message], awaitingNarration: true } })
            break
          case 'checks': {
            if (!ev.checks.length) break
            // Attach the rolls to the player's message right away (the roll cards).
            const msgs = [...cur.messages]
            const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
            if (lastUser) msgs[msgs.lastIndexOf(lastUser)] = { ...lastUser, checks: ev.checks }
            const needThrow = ev.checks.filter((c) => rollMode === 'always' || (rollMode === 'dramatic' && c.dramatic))
            set({ view: { ...cur, messages: msgs }, live: { ...get().live, dice: needThrow, hold: needThrow.length > 0 } })
            break
          }
          case 'narration_start': {
            // A new DM message replaces whatever came after the player's turn on screen.
            const msgs = cur.messages.slice(0, lastUserIndex(cur.messages) + 1)
            set({ view: { ...cur, messages: msgs }, live: { ...get().live, messageId: ev.messageId, text: '', thinking: '' } })
            break
          }
          case 'text':
            set({ live: { ...get().live, text: get().live.text + ev.text } })
            break
          case 'thinking':
            set({ live: { ...get().live, thinking: get().live.thinking + ev.text } })
            break
          case 'notice':
            set({ live: { ...get().live, notice: ev.message } })
            break
          case 'error':
            set({ live: { ...get().live, error: ev.message } })
            break
          case 'view':
            setView(ev.view)
            break
        }
      },
      controller.signal
    )
    // Make sure we end on the saved state, even if the stream was cut short.
    try {
      setView(await api.campaign(view.id))
    } catch {
      /* keep what we have */
    }
    const live = get().live
    set({ busy: false, abort: null, live: { ...idleLive, error: live.error, notice: live.notice, dice: live.dice, hold: live.hold } })
  }

  return {
    screen: 'title',
    settings: null,
    campaigns: [],
    view: null,
    busy: false,
    live: idleLive,
    abort: null,
    toasts: [],
    pendingView: null,
    heir: null,

    go: (screen) => set({ screen, heir: null }),

    loadSettings: async () => {
      // The local server may still be starting when the page first loads, so retry briefly.
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          set({ settings: await api.settings() })
          await get().loadCampaigns()
          return
        } catch {
          await new Promise((r) => setTimeout(r, 400))
        }
      }
    },
    setSettings: (settings) => set({ settings }),

    loadCampaigns: async () => {
      set({ campaigns: await api.campaigns() })
    },

    open: async (id) => {
      const view = await api.campaign(id)
      set({ view, screen: 'play', live: idleLive })
      if (view.awaitingNarration) void get().narrateHead()
    },

    create: async (build, settings, opts) => {
      const { id } = await api.createCampaign(build, settings, opts)
      await get().loadCampaigns()
      await get().open(id)
    },

    startHeir: (h) => set({ heir: h, screen: 'creator' }),
    cancelHeir: async () => {
      const h = get().heir
      set({ heir: null })
      if (h) await get().open(h.campaignId)
      else set({ screen: 'title' })
    },
    takeUp: async (build) => {
      const h = get().heir
      if (!h) return
      const view = await api.successor(h.campaignId, build, h.child?.id)
      set({ heir: null, view, screen: 'play', live: idleLive })
      void get().loadCampaigns()
      if (view.awaitingNarration) void get().narrateHead()
    },

    remove: async (id) => {
      await api.deleteCampaign(id)
      if (get().view?.id === id) set({ view: null })
      await get().loadCampaigns()
    },

    act: (text, picked) => run('act', { text, ...picked }),
    answer: (messageId) => run('answer', { messageId }),
    regenerate: () => run('regenerate', {}),
    reroll: (checkId) => run('reroll', { checkId }),
    narrateHead: () => run('narrate', {}),
    stop: () => get().abort?.abort(),

    swipe: async (messageId) => {
      const v = get().view
      if (!v || get().busy) return
      set({ view: await api.swipe(v.id, messageId), live: idleLive })
    },
    rewind: async (messageId) => {
      const v = get().view
      if (!v || get().busy) return
      const view = await api.rewind(v.id, messageId)
      set({ view, live: idleLive })
      if (view.awaitingNarration) void get().narrateHead()
    },
    spend: async (attr) => {
      const v = get().view
      if (!v) return
      set({ view: await api.spend(v.id, attr) })
    },
    inventory: async (action, name, slot) => {
      const v = get().view
      if (!v || get().busy) return
      set({ view: await api.inventory(v.id, action, name, slot) })
    },
    journal: async (edit) => {
      const v = get().view
      if (!v) return
      const view = await api.journal(v.id, edit)
      // A turn may be streaming; its own final view will include this change too.
      if (!get().busy) set({ view })
      else set({ view: { ...get().view!, memory: view.memory } })
    },
    setLorebooks: async (ids) => {
      const v = get().view
      if (!v) return
      const view = await api.setCampaignLorebooks(v.id, ids)
      if (!get().busy) set({ view })
      else set({ view: { ...get().view!, lorebooks: view.lorebooks } })
    },
    saveSlot: async (name) => {
      const v = get().view
      if (!v) return
      set({ view: await api.addSave(v.id, name) })
      get().toast({ title: 'Saved', text: name, tone: 'info', icon: 'check' })
    },
    loadSlot: async (saveId) => {
      const v = get().view
      if (!v || get().busy) return
      set({ view: await api.loadSave(v.id, saveId), live: idleLive })
    },
    deleteSlot: async (saveId) => {
      const v = get().view
      if (!v) return
      set({ view: await api.deleteSave(v.id, saveId) })
    },
    updateCampaignSettings: async (s) => {
      const v = get().view
      if (!v) return
      set({ view: await api.updateCampaignSettings(v.id, s) })
    },

    diceDone: () => {
      const live = get().live
      const rest = live.dice.slice(1)
      set({ live: { ...live, dice: rest, hold: rest.length > 0 } })
      const pending = get().pendingView
      if (!rest.length && pending) setView(pending)
    },

    toast: (t) => {
      const id = ++toastId
      set({ toasts: [...get().toasts, { ...t, id }] })
      setTimeout(() => get().dismissToast(id), t.tone === 'level' ? 6000 : 4200)
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
})

function lastUserIndex(msgs: MessageView[]) {
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user') return i
  return -1
}
