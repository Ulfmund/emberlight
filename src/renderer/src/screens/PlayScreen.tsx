import { portraitMap, PortraitContext } from '../portraits'
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { useGame } from '../store'
import { Button } from '../components/Button'
import { EmberField } from '../components/EmberField'
import { CharacterPanel } from './play/CharacterPanel'
import { SidePanel, type Tab } from './play/SidePanel'
import { Story } from './play/Story'
import { DiceTray } from './play/DiceTray'
import { DeathScreen, Toasts } from './play/Overlays'
import { Journal } from './play/Journal'
import { Inspector } from './play/Inspector'
import { ReconcileDialog } from './play/ReconcileDialog'
import { SkipDialog } from './play/SkipDialog'
import { MobileDrawer, MobileStatus } from './play/Mobile'
import { CombatTracker } from './play/CombatTracker'
import { Icon } from '../components/Icon'
import { Tip } from '../components/Tip'
import { api } from '../api'
import { isTouch, useEffectsLevel, usePrefs } from '../prefs'
import { LevelUpPillar, useFx } from '../fx'
import { useSoundscape } from '../audio/mixer'

export function PlayScreen() {
  const { view, busy, act, stop, live } = useGame()
  const [tab, setTab] = useState<Tab>('sheet')
  const [journal, setJournal] = useState(false)
  const [inspector, setInspector] = useState(false)
  const [skipping, setSkipping] = useState(false)
  /** Phones: the character and side panels live in a drawer. */
  const [drawer, setDrawer] = useState(false)
  const portraits = useMemo(() => (view ? portraitMap(view) : {}), [view])
  // The music and the sounds of the place follow the story.
  useSoundscape(view)
  // A big hit jolts the screen (Full effects, if screen shake is on).
  const [shakeScope, shake] = useAnimate()
  const hitAt = useFx((f) => f.hitAt)
  const effects = useEffectsLevel()
  const screenShake = usePrefs((p) => p.screenShake)
  useEffect(() => {
    if (!hitAt || effects !== 'full' || !screenShake || !shakeScope.current) return
    void shake(shakeScope.current, { x: [0, -9, 8, -6, 4, -2, 0] }, { duration: 0.45 })
  }, [hitAt, effects, screenShake, shake, shakeScope])
  if (!view) return null
  const dead = view.state.character.status === 'dead'
  const canSkip = !busy && !view.state.combat && view.state.character.status === 'alive'

  return (
    <div ref={shakeScope} className="relative flex min-h-0 flex-1">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgb(255_150_60/0.07),transparent_70%)]" />
      <EmberField density={0.15} className="opacity-40" />

      <div className="hidden md:flex">
        <CharacterPanel view={view} onOpenSheet={() => setTab('sheet')} onOpenJournal={() => setJournal(true)} onSkip={() => setSkipping(true)} canSkip={canSkip} />
      </div>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <MobileStatus view={view} onOpen={() => setDrawer(true)} onJournal={() => setJournal(true)} />
        <PortraitContext.Provider value={portraits}>
          <Story view={view} onInspect={() => setInspector(true)} />
        </PortraitContext.Provider>
        <CombatTracker view={view} />
        <Composer campaignId={view.id} disabled={dead} busy={busy} holding={live.hold} onSend={(t, image) => void act(t, image ? { image } : undefined)} onStop={stop} />
        <DiceTray />
      </main>

      <div className="hidden lg:flex">
        <SidePanel view={view} tab={tab} setTab={setTab} />
      </div>

      <MobileDrawer
        view={view}
        open={drawer}
        onClose={() => setDrawer(false)}
        tab={tab}
        setTab={setTab}
        onJournal={() => {
          setDrawer(false)
          setJournal(true)
        }}
        onSkip={() => {
          setDrawer(false)
          setSkipping(true)
        }}
        canSkip={canSkip}
      />
      <SkipDialog view={view} open={skipping} onClose={() => setSkipping(false)} onSkip={(text, plan) => void act(text, { skip: plan })} />
      <Journal view={view} open={journal} onClose={() => setJournal(false)} />
      <Inspector campaignId={view.id} open={inspector} onClose={() => setInspector(false)} />
      <ReconcileDialog />
      <Toasts />
      <LevelUpPillar />
      <DeathScreen view={view} />
    </div>
  )
}

type Idea = { kind: 'bold' | 'careful' | 'say'; text: string }
const IDEA_LABEL: Record<Idea['kind'], string> = { bold: 'Bold', careful: 'Careful', say: 'Say' }

function Composer({
  campaignId,
  disabled,
  busy,
  holding,
  onSend,
  onStop
}: {
  campaignId: string
  disabled: boolean
  busy: boolean
  holding: boolean
  onSend: (t: string, image?: string) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')
  // A picture to show the DM with the next message.
  const [pic, setPic] = useState<{ id: string; url: string } | null>(null)
  const [picError, setPicError] = useState('')
  const [uploading, setUploading] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const attach = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setPicError('')
    try {
      const { id } = await api.uploadMedia(campaignId, file, 'story')
      setPic({ id, url: URL.createObjectURL(file) })
      if (!text.trim()) setText('I show them this.')
    } catch (err) {
      setPicError((err as Error).message)
    }
    setUploading(false)
  }
  const [focused, setFocused] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  // Ideas: three things the character could do now.
  const [ideas, setIdeas] = useState<{ open: boolean; loading: boolean; list: Idea[]; error: string }>({ open: false, loading: false, list: [], error: '' })
  // Ghost text: the rest of the sentence, greyed out, while typing pauses.
  const ghostOn = usePrefs((p) => p.ghost)
  const setPrefs = usePrefs((p) => p.set)
  const [ghost, setGhost] = useState('')
  const asking = useRef<AbortController | null>(null)
  const mirror = useRef<HTMLDivElement>(null)
  // Typing runes (Full effects): a glint where a word was just finished.
  const effects = useEffectsLevel()
  const measure = useRef<HTMLDivElement>(null)
  const [rune, setRune] = useState<{ id: number; x: number; y: number; glyph: string } | null>(null)
  const RUNE_GLYPHS = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'
  const glint = (value: string) => {
    const box = measure.current
    if (!box) return
    box.firstChild!.textContent = value
    const mark = box.lastChild as HTMLElement
    const x = mark.offsetLeft
    const y = mark.offsetTop - (ta.current?.scrollTop ?? 0)
    setRune({ id: Date.now(), x, y, glyph: RUNE_GLYPHS[Math.floor(Math.random() * RUNE_GLYPHS.length)] })
  }
  useEffect(() => {
    if (!rune) return
    const t = setTimeout(() => setRune(null), 420)
    return () => clearTimeout(t)
  }, [rune])

  // The box grows with the text, and with the grey words when there are some.
  useLayoutEffect(() => {
    const el = ta.current!
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, mirror.current?.scrollHeight ?? 0), 220)}px`
  }, [text, ghost])

  useEffect(() => {
    setGhost('')
    asking.current?.abort()
    if (!ghostOn || disabled || busy || text.trim().length < 4 || /\n$/.test(text)) return
    const typed = text
    const t = setTimeout(() => {
      const el = ta.current
      if (!el || el.selectionStart !== typed.length || el.scrollHeight > 220) return
      const ctl = new AbortController()
      asking.current = ctl
      api
        .ghost(campaignId, typed, ctl.signal)
        .then((r) => {
          if (!ctl.signal.aborted && ta.current?.value === typed) setGhost(r.continuation)
        })
        .catch(() => {})
    }, 900)
    return () => clearTimeout(t)
  }, [text, ghostOn, disabled, busy, campaignId])

  const acceptGhost = () => {
    if (!ghost) return
    setText(text + ghost)
    setGhost('')
    ta.current?.focus()
  }

  const askIdeas = async () => {
    if (ideas.open) return setIdeas((x) => ({ ...x, open: false }))
    setIdeas({ open: true, loading: true, list: [], error: '' })
    try {
      const r = await api.suggest(campaignId)
      setIdeas({ open: true, loading: false, list: r.suggestions, error: r.suggestions.length ? '' : 'No ideas came. Try again.' })
    } catch (err) {
      setIdeas({ open: true, loading: false, list: [], error: (err as Error).message })
    }
  }
  const pick = (idea: Idea) => {
    setText(idea.text)
    setIdeas((x) => ({ ...x, open: false }))
    requestAnimationFrame(() => {
      const el = ta.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  // A move that waited for this screen to catch up hands its words back, to send again.
  const restore = useGame((s) => s.restoreDraft)
  useEffect(() => {
    if (restore === null) return
    setText((cur) => cur || restore)
    useGame.setState({ restoreDraft: null })
  }, [restore])

  const submit = () => {
    const t = text.trim()
    if (!t || busy || disabled) return
    onSend(t, pic?.id)
    setText('')
    setPic(null)
    setGhost('')
    setIdeas((x) => ({ ...x, open: false }))
  }

  return (
    <div className="relative z-20 border-t border-gold-500/15 bg-gradient-to-t from-ink-950 to-ink-950/85 backdrop-blur-md">
      <div className="relative mx-auto max-w-3xl px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:py-4">
        <AnimatePresence>
          {ideas.open && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-x-3 bottom-full mb-2 space-y-1.5 rounded-2xl border border-gold-500/25 bg-ink-900/95 p-2 shadow-[0_-10px_40px_-12px_rgb(0_0_0/0.9)] backdrop-blur md:inset-x-6"
            >
              <div className="flex items-center justify-between px-1.5 pt-0.5 text-[0.68rem] font-semibold tracking-[0.16em] text-gold-400 uppercase">
                What could I do?
                <button onClick={() => setIdeas((x) => ({ ...x, open: false }))} className="no-drag cursor-pointer p-1 text-parchment-500 hover:text-gold-200" aria-label="Close">
                  <Icon name="x" size={14} />
                </button>
              </div>
              {ideas.loading && <p className="px-2 py-3 text-sm text-parchment-400 italic">Thinking of a few things you could do…</p>}
              {ideas.error && <p className="px-2 py-2 text-sm text-blood-400">{ideas.error}</p>}
              {ideas.list.map((idea) => (
                <button
                  key={idea.kind}
                  onClick={() => pick(idea)}
                  className="no-drag flex w-full cursor-pointer items-baseline gap-3 rounded-xl border border-white/5 bg-ink-850/80 px-3 py-2 text-left hover:border-gold-400/40 hover:bg-ink-800"
                >
                  <span className="w-14 shrink-0 text-[0.7rem] font-semibold tracking-wide text-gold-300 uppercase">{IDEA_LABEL[idea.kind]}</span>
                  <span className="font-story text-[1.02rem] leading-snug text-parchment-100">{idea.text}</span>
                </button>
              ))}
              {!ideas.loading && ideas.list.length > 0 && <p className="px-2 pb-0.5 text-[0.68rem] text-parchment-500">Tap one to put it in the box. Change it as you like before you send it.</p>}
            </motion.div>
          )}
        </AnimatePresence>
        {(pic || picError) && (
          <div className="mb-2 flex items-center gap-2 px-1">
            {pic && (
              <span className="relative">
                <img src={pic.url} alt="The picture you'll show" className="h-14 w-14 rounded-lg border border-gold-500/30 object-cover" />
                <button onClick={() => setPic(null)} className="no-drag absolute -top-1.5 -right-1.5 grid h-5 w-5 cursor-pointer place-items-center rounded-full bg-ink-900 text-parchment-300 ring-1 ring-gold-500/40 hover:text-blood-400" aria-label="Don't show the picture">
                  <Icon name="x" size={11} />
                </button>
              </span>
            )}
            <span className={`text-xs ${picError ? 'text-blood-400' : 'text-parchment-400'}`}>{picError || 'The DM sees this picture with your next message.'}</span>
          </div>
        )}
        <motion.div
          animate={{ boxShadow: focused ? '0 0 0 1px rgba(232,181,77,0.55), 0 0 40px -8px rgba(255,140,40,0.45)' : '0 0 0 1px rgba(201,143,44,0.22), 0 0 0 0 rgba(0,0,0,0)' }}
          transition={{ duration: 0.25 }}
          className="flex items-end gap-2 rounded-2xl bg-ink-850/90 p-1.5 pl-3 md:gap-3 md:p-2 md:pl-4"
        >
          <div className="relative min-w-0 flex-1">
            {/* Measures where the last word ends, for the rune. */}
            <div ref={measure} aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 py-2.5 font-story text-[1.12rem] break-words whitespace-pre-wrap">
              <span />
              <span>|</span>
            </div>
            <AnimatePresence>
              {rune && (
                <motion.span
                  key={rune.id}
                  aria-hidden
                  className="pointer-events-none absolute z-10 font-display text-lg text-ember-400"
                  style={{ left: rune.x - 8, top: rune.y - 2, textShadow: '0 0 10px var(--color-ember-500), 0 0 3px #ffd9a0' }}
                  initial={{ opacity: 0, y: 2, scale: 0.7 }}
                  animate={{ opacity: [0, 0.9, 0], y: -10, scale: 1.1 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  {rune.glyph}
                </motion.span>
              )}
            </AnimatePresence>
            {ghost && (
              <div ref={mirror} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden py-2.5 font-story text-[1.12rem] break-words whitespace-pre-wrap">
                <span className="invisible">{text}</span>
                <span className="text-parchment-500/80">{ghost}</span>
              </div>
            )}
            <textarea
              ref={ta}
              rows={1}
              value={text}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.value
                // A finished word: one more character, a space or punctuation, typed at the end (phones: only spaces).
                if (effects === 'full' && next.length === text.length + 1 && next.startsWith(text) && e.target.selectionStart === next.length && (/[ ]$/.test(next) || (!isTouch() && /[.,!?;:]$/.test(next))) && /\S/.test(next.slice(-2, -1)))
                  glint(next.slice(0, -1))
                setText(next)
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && ghost && !e.shiftKey) {
                  e.preventDefault()
                  acceptGhost()
                } else if (e.key === 'Escape') {
                  setGhost('')
                  setIdeas((x) => ({ ...x, open: false }))
                } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={disabled ? 'Your story has ended.' : 'What do you do?  e.g.  "Who goes there?" I call, raising my lantern.'}
              enterKeyHint="send"
              className="relative block max-h-[220px] w-full resize-none bg-transparent py-2.5 font-story text-[1.12rem] text-parchment-50 outline-none placeholder:text-parchment-500 placeholder:italic disabled:opacity-50"
            />
          </div>
          {!disabled && (
            <Tip content="Show the DM a picture">
              <button
                onClick={() => picker.current?.click()}
                disabled={uploading || (busy && !holding)}
                aria-label="Show a picture"
                className="no-drag mb-1 grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-gold-500/20 text-gold-300 transition-colors hover:border-gold-400/50 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="upload" size={17} />
              </button>
            </Tip>
          )}
          <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void attach(e.target.files?.[0]).then(() => (e.target.value = ''))} />
          {!disabled && (
            <Tip content="What could I do?">
              <button
                onClick={() => void askIdeas()}
                disabled={busy && !holding}
                aria-label="What could I do?"
                aria-expanded={ideas.open}
                className={`no-drag mb-1 grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${ideas.open ? 'border-gold-400/60 bg-gold-500/15 text-gold-200' : 'border-gold-500/20 text-gold-300 hover:border-gold-400/50 hover:bg-white/5'}`}
              >
                <Icon name="idea" size={19} />
              </button>
            </Tip>
          )}
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
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-xs text-parchment-500">
          {ghost ? (
            <button onClick={acceptGhost} className="no-drag cursor-pointer text-gold-300 hover:text-gold-200">
              <span className="hidden md:inline">Tab to add the grey words</span>
              <span className="md:hidden">Tap here to add the grey words</span>
            </button>
          ) : (
            <>
              <span>
                <span className="text-gold-300">"Quotes"</span> are spoken aloud
              </span>
              <span className="hidden md:inline">Everything else is what you do</span>
              <span>
                <span className="text-arcane-400">((Double brackets))</span> <span className="md:hidden">talk to the DM</span>
                <span className="hidden md:inline">talk to the DM directly</span>
              </span>
            </>
          )}
          <Tip content="Suggests the rest of your sentence when you pause typing. Each suggestion is a small request to your model.">
            <button onClick={() => setPrefs({ ghost: !ghostOn })} className="no-drag ml-auto cursor-pointer hover:text-gold-200">
              Autocomplete: {ghostOn ? 'on' : 'off'}
            </button>
          </Tip>
        </div>
      </div>
    </div>
  )
}
