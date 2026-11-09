import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { OPENING_NUDGE, useGame, type StoryMessage } from '../store'
import { StoryText, PlayerText } from '../components/StoryText'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { EmberField } from '../components/EmberField'

export function PlayScreen() {
  const { messages, streaming, send, stop, regenerate, settings } = useGame()
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const opened = useRef(false)

  // Ask the DM for an opening scene when a new story starts.
  useEffect(() => {
    if (messages.length > 0) {
      opened.current = false
    } else if (!opened.current && settings?.connection?.model) {
      opened.current = true
      void send(OPENING_NUDGE, { hidden: true })
    }
  }, [messages.length, send, settings?.connection?.model])

  // Keep the newest text in view, unless the player has scrolled up to reread.
  const onScroll = () => {
    const el = scroller.current!
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const visible = messages.filter((m) => !m.hidden)
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgb(255_150_60/0.07),transparent_70%)]" />
      <EmberField density={0.18} className="opacity-50" />

      <div ref={scroller} onScroll={onScroll} className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 pt-10 pb-8">
          <div className="mb-8 flex items-center gap-4">
            <div className="gilt-rule flex-1" />
            <Icon name="d20" size={20} className="text-gold-500" />
            <div className="gilt-rule flex-1" />
          </div>

          <div className="space-y-8">
            <AnimatePresence initial={false}>
              {visible.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
                >
                  {m.role === 'user' ? <PlayerTurn m={m} /> : <DmTurn m={m} />}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {!streaming && lastAssistant && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex justify-start">
              <Button variant="ghost" size="sm" icon="reroll" onClick={() => void regenerate()} title="Write this response again">
                Reroll response
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      <Composer streaming={streaming} onSend={(t) => void send(t)} onStop={stop} />
    </div>
  )
}

function PlayerTurn({ m }: { m: StoryMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-gold-500/30 bg-gradient-to-b from-ink-700/80 to-ink-800/80 px-5 py-3 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.8)]">
        <div className="mb-1 text-right font-display text-[0.7rem] tracking-[0.2em] text-gold-400">YOU</div>
        <PlayerText text={m.content} />
      </div>
    </div>
  )
}

function DmTurn({ m }: { m: StoryMessage }) {
  const waiting = m.streaming && !m.content
  return (
    <div>
      {(m.thinking || waiting) && <Thinking text={m.thinking ?? ''} active={Boolean(m.streaming && !m.content)} />}
      {m.content && <StoryText text={m.content} animate={Boolean(m.streaming)} />}
      {m.streaming && m.content && (
        <span className="ml-1 inline-block h-5 w-[3px] translate-y-1 animate-pulse rounded bg-ember-500 shadow-[0_0_10px_var(--color-ember-500)]" />
      )}
      {m.notice && <p className="mt-3 text-sm text-gold-300 italic">{m.notice}</p>}
      {m.error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-blood-400/40 bg-blood-500/10 px-4 py-3 text-sm text-parchment-100">
          <Icon name="warn" size={18} className="mt-0.5 shrink-0 text-blood-400" />
          {m.error}
        </div>
      )}
    </div>
  )
}

const RUNES = ['ᚠ', 'ᚱ', 'ᛟ', 'ᚨ', 'ᛉ']

function Thinking({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-4">
      <button
        onClick={() => text && setOpen((o) => !o)}
        className={`no-drag flex items-center gap-3 text-sm ${text ? 'cursor-pointer' : 'cursor-default'} text-parchment-400 hover:text-gold-300`}
      >
        <span className="flex gap-1.5 font-display text-lg text-ember-400">
          {RUNES.map((r, i) => (
            <span
              key={r}
              className={active ? 'animate-rune-pulse inline-block' : 'inline-block opacity-40'}
              style={{ animationDelay: `${i * 0.18}s`, textShadow: active ? '0 0 10px var(--color-ember-500)' : undefined }}
            >
              {r}
            </span>
          ))}
        </span>
        <span className="italic">{active ? 'The Dungeon Master ponders…' : "The DM's reasoning"}</span>
        {text && <Icon name="chevron" size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      <AnimatePresence initial={false}>
        {open && text && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="selectable mt-2 max-h-72 overflow-y-auto border-l-2 border-ember-500/30 pl-4 text-sm leading-relaxed whitespace-pre-wrap text-parchment-400 italic">
              {text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Composer({ streaming, onSend, onStop }: { streaming: boolean; onSend: (t: string) => void; onStop: () => void }) {
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
    if (!t || streaming) return
    onSend(t)
    setText('')
  }

  return (
    <div className="relative z-20 border-t border-gold-500/15 bg-gradient-to-t from-ink-950 to-ink-950/85 backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-6 py-4">
        <motion.div
          animate={{
            boxShadow: focused
              ? '0 0 0 1px rgba(232,181,77,0.55), 0 0 40px -8px rgba(255,140,40,0.45)'
              : '0 0 0 1px rgba(201,143,44,0.22), 0 0 0 0 rgba(0,0,0,0)'
          }}
          transition={{ duration: 0.25 }}
          className="flex items-end gap-3 rounded-2xl bg-ink-850/90 p-2 pl-4"
        >
          <textarea
            ref={ta}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder='What do you do?  e.g.  "Who goes there?" I call, raising my lantern.'
            className="max-h-[220px] flex-1 resize-none bg-transparent py-2.5 font-story text-[1.12rem] text-parchment-50 outline-none placeholder:text-parchment-500 placeholder:italic"
          />
          {streaming ? (
            <Button variant="secondary" icon="stop" onClick={onStop} title="Stop the DM">
              Stop
            </Button>
          ) : (
            <Button variant="primary" icon="quill" onClick={submit} disabled={!text.trim()} title="Send (Enter)">
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
