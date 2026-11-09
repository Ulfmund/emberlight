import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useGame } from '../store'
import { Button } from '../components/Button'
import { EmberField } from '../components/EmberField'
import { CharacterPanel } from './play/CharacterPanel'
import { SidePanel, type Tab } from './play/SidePanel'
import { Story } from './play/Story'
import { DiceTray } from './play/DiceTray'
import { DeathScreen, Toasts } from './play/Overlays'

export function PlayScreen() {
  const { view, busy, act, stop, live } = useGame()
  const [tab, setTab] = useState<Tab>('sheet')
  if (!view) return null
  const dead = view.state.character.status === 'dead'

  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgb(255_150_60/0.07),transparent_70%)]" />
      <EmberField density={0.15} className="opacity-40" />

      <CharacterPanel view={view} onOpenSheet={() => setTab('sheet')} />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <Story view={view} />
        <Composer disabled={dead} busy={busy} holding={live.hold} onSend={(t) => void act(t)} onStop={stop} />
        <DiceTray />
      </main>

      <div className="hidden lg:flex">
        <SidePanel view={view} tab={tab} setTab={setTab} />
      </div>

      <Toasts />
      <DeathScreen view={view} />
    </div>
  )
}

function Composer({ disabled, busy, holding, onSend, onStop }: { disabled: boolean; busy: boolean; holding: boolean; onSend: (t: string) => void; onStop: () => void }) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ta.current!
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [text])

  const submit = () => {
    const t = text.trim()
    if (!t || busy || disabled) return
    onSend(t)
    setText('')
  }

  return (
    <div className="relative z-20 border-t border-gold-500/15 bg-gradient-to-t from-ink-950 to-ink-950/85 backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-6 py-4">
        <motion.div
          animate={{ boxShadow: focused ? '0 0 0 1px rgba(232,181,77,0.55), 0 0 40px -8px rgba(255,140,40,0.45)' : '0 0 0 1px rgba(201,143,44,0.22), 0 0 0 0 rgba(0,0,0,0)' }}
          transition={{ duration: 0.25 }}
          className="flex items-end gap-3 rounded-2xl bg-ink-850/90 p-2 pl-4"
        >
          <textarea
            ref={ta}
            rows={1}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={disabled ? 'Your story has ended.' : 'What do you do?  e.g.  "Who goes there?" I call, raising my lantern.'}
            className="max-h-[220px] flex-1 resize-none bg-transparent py-2.5 font-story text-[1.12rem] text-parchment-50 outline-none placeholder:text-parchment-500 placeholder:italic disabled:opacity-50"
          />
          {busy && !holding ? (
            <Button variant="secondary" icon="stop" onClick={onStop} title="Stop the DM">
              Stop
            </Button>
          ) : (
            <Button variant="primary" icon="quill" onClick={submit} disabled={!text.trim() || busy || disabled} title="Send (Enter)">
              Act
            </Button>
          )}
        </motion.div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 px-1 text-xs text-parchment-500">
          <span>
            <span className="text-gold-300">"Quotes"</span> are spoken aloud
          </span>
          <span>Everything else is what you do</span>
          <span>
            <span className="text-arcane-400">((Double brackets))</span> talk to the DM directly
          </span>
          <span className="ml-auto">Shift+Enter for a new line</span>
        </div>
      </div>
    </div>
  )
}
