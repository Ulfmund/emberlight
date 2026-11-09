import { create } from 'zustand'
import type { SettingsView } from '@shared/types'
import type { Attr, CampaignSettings, CharacterBuild, CheckResult, CombatAction, RaceId, SkipPlan, Work } from '@shared/rules'
import type { CampaignSummary, CampaignView, Comparison, MessageView, TurnEvent } from '@shared/view'
import { api, showingHead, type CreateOptions } from './api'
import type { MemoryEvent } from '@shared/memory'
import { play } from './sound'
import { stinger } from './audio/mixer'
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
  /** The DM is answering a turn sent from another screen (sync.ts). */
  elsewhere: boolean
  /** The story split between screens: this one's version and the latest (ReconcileDialog). */
  conflict: Conflict | null
  /** Text held back from a move that waited for this screen to catch up, for the input box. */
  restoreDraft: string | null
  resolveConflict(choice: 'latest' | 'mine'): Promise<void>
  /** The story changed elsewhere: follow it if it only carried on from here, else ask (sync.ts). */
  reconcile(): Promise<void>
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
  /** Catch up with the adventure as it stands on the server (another screen moved it on). */
  refresh(): Promise<void>
  create(build: CharacterBuild, settings: CampaignSettings, opts?: CreateOptions): Promise<void>
  remove(id: string): Promise<void>
  /** After a death: open the creator for whoever takes up the tale. */
  startHeir(h: Heir): void
  /** Back to the story without a successor. */
  cancelHeir(): Promise<void>
  /** The successor joins the story, and their opening scene is narrated. */
  takeUp(build: CharacterBuild): Promise<void>

  /** Free text, or a move picked on the combat tracker, or a recipe from the Bag. */
  act(text: string, picked?: { combat?: CombatAction; work?: Work; spell?: string; image?: string; skip?: SkipPlan }): Promise<void>
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

/** The story split between screens (ReconcileDialog): this one's head, both versions, a held-back move. */
export type Conflict = { mine: string | null; ahead: Comparison['ahead']; behind: Comparison['behind']; retry?: () => Promise<void>; draft?: string }

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
    // What the turn did, in sound (and a jolt for a big hit): one big moment at most (a death, a
    // level, a fight won, a quest done), else the smaller ones.
    const seen = new Set((before.timeline ?? []).map((e) => `${e.day}|${e.minute}|${e.text}`))
    const fresh = (after.timeline ?? []).filter((e) => !seen.has(`${e.day}|${e.minute}|${e.text}`))
    const big = a.status === 'dead' && b.status !== 'dead' ? 'death' : a.level > b.level ? 'level' : fresh.some((e) => e.text.startsWith('Won a fight')) ? 'victory' : fresh.some((e) => e.text.startsWith('Done: ')) ? 'quest' : null
    if (big) stinger(big)
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

  /**
   * This screen shows a story that has changed since. If the other screen only carried it on,
   * catch up (and hand back any typing, to send again once it's been read). If the story split,
   * ask which version to keep (ReconcileDialog); a move held back runs after "keep this screen's".
   */
  const reconcileWith = async (v: CampaignView, retry?: () => Promise<void>, draft?: string) => {
    let diff: Comparison
    try {
      diff = await api.compare(v.id, v.headId)
    } catch {
      return void get().refresh()
    }
    if (!diff.behind.length) {
      await get().refresh()
      if (draft) set({ restoreDraft: draft })
      if (diff.ahead.length) get().toast({ title: 'Caught up', text: 'The story moved on from your other screen.', tone: 'info', icon: 'rewind' })
      return
    }
    set({ conflict: { mine: v.headId, ahead: diff.ahead, behind: diff.behind, retry, draft } })
  }

  /** Before a move: is this screen showing the story as it stands? If not, reconcile first. */
  const upToDate = async (retry: () => Promise<void>, draft?: string): Promise<boolean> => {
    const v = get().view
    if (!v) return false
    try {
      const s = await api.stamp(v.id)
      if ((s.head ?? null) === (v.headId ?? null)) return true
    } catch {
      return true // the server checks again anyway
    }
    await reconcileWith(v, retry, draft)
    return false
  }

  /** After Stop: the server is still saving what was written; wait for it before looking. */
  const settle = async (id: string) => {
    for (let i = 0; i < 40; i++) {
      try {
        if (!(await api.stamp(id)).answering) return
      } catch {
        return
      }
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  /** Another screen moved the story on (a refused rewind or switch): reconcile, then try again if kept. */
  const caughtUp = (v: CampaignView, retry: () => Promise<void>) => void reconcileWith(v, retry)

  /** Runs one streamed turn endpoint and folds its events into the view. */
  const run = async (path: string, body: unknown, checked = false): Promise<void> => {
    let view = get().view
    if (!view || get().busy) return
    // A move from a screen that's behind waits until it has caught up (narrating is the server's to check).
    if (!checked && path !== 'narrate') {
      const draft = path === 'act' ? (body as { text?: string }).text : undefined
      if (!(await upToDate(() => run(path, body, true), draft))) return
      view = get().view
      if (!view || get().busy) return
    }
    let stale = false
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
            if (ev.stale) stale = true
            else set({ live: { ...get().live, error: ev.message } })
            break
          case 'view':
            setView(ev.view)
            break
        }
      },
      controller.signal
    )
    // Stopped: the server is still saving what the DM wrote so far; wait for it, then look.
    if (controller.signal.aborted) await settle(view.id)
    // Make sure we end on the saved state, even if the stream was cut short.
    try {
      setView(await api.campaign(view.id))
    } catch {
      /* keep what we have */
    }
    const live = get().live
    set({ busy: false, abort: null, live: { ...idleLive, error: live.error, notice: live.notice, dice: live.dice, hold: live.hold } })
    // The server found this screen behind (a race the check before it missed): reconcile now.
    const before = view
    if (stale) void reconcileWith(before, () => run(path, body, true), path === 'act' ? (body as { text?: string }).text : undefined)
  }

  return {
    screen: 'title',
    settings: null,
    campaigns: [],
    view: null,
    busy: false,
    elsewhere: false,
    conflict: null,
    restoreDraft: null,
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
      set({ view, screen: 'play', live: idleLive, elsewhere: Boolean(view.answering) })
      // Waiting for the DM, and no screen is asking it: ask now. (If another screen is, it'll catch up.)
      if (view.awaitingNarration && !view.answering) void get().narrateHead()
    },

    refresh: async () => {
      const v = get().view
      if (!v || get().busy) return
      const view = await api.campaign(v.id)
      if (!get().busy && get().view?.id === v.id) setView(view)
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
      const again = () => get().swipe(messageId)
      if (!(await upToDate(again))) return
      try {
        set({ view: await api.swipe(v.id, messageId), live: idleLive })
      } catch {
        caughtUp(v, again)
      }
    },
    rewind: async (messageId) => {
      const v = get().view
      if (!v || get().busy) return
      const again = () => get().rewind(messageId)
      if (!(await upToDate(again))) return
      let view: CampaignView
      try {
        view = await api.rewind(v.id, messageId)
      } catch {
        return caughtUp(v, again)
      }
      set({ view, live: idleLive })
      if (view.awaitingNarration) void get().narrateHead()
    },

    resolveConflict: async (choice) => {
      const c = get().conflict
      const v = get().view
      if (!c || !v) return set({ conflict: null })
      set({ conflict: null })
      if (choice === 'latest') {
        await get().refresh()
        if (c.draft) set({ restoreDraft: c.draft })
        return
      }
      try {
        if (c.mine) setView(await api.adopt(v.id, c.mine))
      } catch (err) {
        get().toast({ title: "Couldn't keep this screen's version", text: (err as Error).message, tone: 'bad', icon: 'warn' })
        return
      }
      if (c.retry) await c.retry()
    },

    reconcile: async () => {
      const v = get().view
      if (!v || get().busy || get().conflict) return
      await reconcileWith(v)
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

// Every change this screen sends carries the head of the story it shows (api.ts), so a screen
// that hasn't caught up with another one can't move the story blind.
useGame.subscribe((s) => showingHead(s.view ? s.view.headId : undefined))
