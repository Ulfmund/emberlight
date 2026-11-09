import { create } from 'zustand'
import type { SettingsView } from '@shared/types'
import { api } from './api'

export type Screen = 'title' | 'connect' | 'play'

export type StoryMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  /** Sent to the model but not shown (e.g. the "begin the adventure" nudge). */
  hidden?: boolean
  error?: string
  notice?: string
  streaming?: boolean
}

type State = {
  screen: Screen
  settings: SettingsView | null
  messages: StoryMessage[]
  streaming: boolean
  abort: AbortController | null

  go(screen: Screen): void
  loadSettings(): Promise<void>
  setSettings(s: SettingsView): void
  send(text: string, opts?: { hidden?: boolean }): Promise<void>
  regenerate(): Promise<void>
  stop(): void
  newStory(): void
}

const uid = () => Math.random().toString(36).slice(2, 10)

export const OPENING_NUDGE = '((Begin the adventure: set an opening scene for my character.))'

export const useGame = create<State>((set, get) => ({
  screen: 'title',
  settings: null,
  messages: [],
  streaming: false,
  abort: null,

  go: (screen) => set({ screen }),

  loadSettings: async () => {
    // The local server may still be starting when the page first loads, so retry briefly.
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        set({ settings: await api.settings() })
        return
      } catch {
        await new Promise((r) => setTimeout(r, 400))
      }
    }
  },
  setSettings: (settings) => set({ settings }),

  send: async (text, opts) => {
    if (get().streaming) return
    const user: StoryMessage = { id: uid(), role: 'user', content: text, hidden: opts?.hidden }
    set({ messages: [...get().messages, user] })
    await streamReply(set, get)
  },

  regenerate: async () => {
    if (get().streaming) return
    const msgs = [...get().messages]
    while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop()
    if (!msgs.length) return
    set({ messages: msgs })
    await streamReply(set, get)
  },

  stop: () => get().abort?.abort(),

  newStory: () => {
    get().abort?.abort()
    set({ messages: [], streaming: false, abort: null })
  }
}))

async function streamReply(set: (p: Partial<State>) => void, get: () => State) {
  const controller = new AbortController()
  const reply: StoryMessage = { id: uid(), role: 'assistant', content: '', thinking: '', streaming: true }
  const history = get()
    .messages.filter((m) => !m.error || m.content)
    .map((m) => ({ role: m.role, content: m.content }))
  set({ messages: [...get().messages, reply], streaming: true, abort: controller })

  const patch = (p: Partial<StoryMessage>) =>
    set({ messages: get().messages.map((m) => (m.id === reply.id ? { ...m, ...p } : m)) })
  const current = () => get().messages.find((m) => m.id === reply.id)!

  // Batch text into animation frames so long streams don't re-render on every token.
  let pendingText = ''
  let pendingThinking = ''
  let frame = 0
  const flush = () => {
    frame = 0
    const cur = current()
    patch({ content: cur.content + pendingText, thinking: (cur.thinking ?? '') + pendingThinking })
    pendingText = ''
    pendingThinking = ''
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(flush)
  }

  await api.chat(
    history,
    (ev) => {
      if (ev.type === 'text') {
        pendingText += ev.text
        schedule()
      } else if (ev.type === 'thinking') {
        pendingThinking += ev.text
        schedule()
      } else if (ev.type === 'error') {
        patch({ error: ev.message })
      } else if (ev.type === 'notice') {
        patch({ notice: ev.message })
      }
    },
    controller.signal
  )
  if (frame) cancelAnimationFrame(frame)
  flush()
  const cur = current()
  patch({
    streaming: false,
    content: cur.content.replace(/^\s+/, ''),
    error: cur.error ?? (controller.signal.aborted && !cur.content ? 'Stopped.' : undefined)
  })
  set({ streaming: false, abort: null })
}
