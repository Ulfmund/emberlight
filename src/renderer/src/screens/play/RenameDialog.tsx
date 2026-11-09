import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { api } from '../../api'
import { useGame } from '../../store'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'

type Target = { kind: 'player' } | { kind: 'entity'; id: string }
type Preview = Awaited<ReturnType<typeof api.renamePreview>>

/**
 * Renaming someone (docs/spec/03-characters-and-cards.md#editing-characters-and-updating-the-story):
 * a retcon rewrites the name everywhere (with a preview to untick lines), an in-story rename
 * keeps the past and tells the DM.
 */
export function RenameDialog({ open, onClose, onRenamed, from, target }: { open: boolean; onClose: () => void; onRenamed?: () => void; from: string; target: Target }) {
  const view = useGame((s) => s.view)
  const busy = useGame((s) => s.busy)
  const [to, setTo] = useState(from)
  const [mode, setMode] = useState<'retcon' | 'story' | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!open) return
    setTo(from)
    setMode(null)
    setPreview(null)
    setSkip(new Set())
    setError('')
  }, [open, from])

  const ready = to.trim() && to.trim() !== from
  const choose = async (m: 'retcon' | 'story') => {
    setMode(m)
    setError('')
    if (m === 'retcon' && view) {
      try {
        setPreview(await api.renamePreview(view.id, from, to.trim()))
      } catch (e) {
        setError((e as Error).message)
      }
    }
  }
  const apply = async () => {
    if (!view || !mode) return
    setWorking(true)
    try {
      const v = await api.rename(view.id, { from, to: to.trim(), mode, target, skip: [...skip] })
      useGame.setState({ view: v })
      onClose()
      onRenamed?.()
    } catch (e) {
      setError((e as Error).message)
    }
    setWorking(false)
  }
  const who = target.kind === 'player' ? 'your character' : from

  // Drawn at the top of the page: inside a blurred panel, 'fixed' would mean 'fixed to the panel'.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/80 backdrop-blur-sm md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div role="dialog" aria-label="Rename" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} className="panel relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden md:max-h-[86vh] md:rounded-2xl">
            <div className="flex items-center gap-3 border-b border-gold-500/15 px-5 py-4">
              <Icon name="quill" size={22} className="text-gold-300" />
              <h2 className="flex-1 font-display text-xl tracking-wider text-gold-300">Rename {who}</h2>
              <button onClick={onClose} className="no-drag cursor-pointer rounded-lg p-2 text-parchment-400 hover:bg-white/5 hover:text-gold-200" aria-label="Close">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <label className="block">
                <span className="mb-1 block text-[0.68rem] font-semibold tracking-[0.14em] text-gold-400 uppercase">New name</span>
                <input
                  autoFocus
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value)
                    setMode(null)
                    setPreview(null)
                  }}
                  maxLength={80}
                  className="input font-display text-lg tracking-wide"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <Choice
                  active={mode === 'retcon'}
                  disabled={!ready}
                  onClick={() => void choose('retcon')}
                  title="They were always called this"
                  text={`A retcon: "${from}" is replaced everywhere it was written: the story so far, the Journal and the summaries. You can check each change first.`}
                />
                <Choice
                  active={mode === 'story'}
                  disabled={!ready}
                  onClick={() => void choose('story')}
                  title="They take a new name"
                  text={`Something in the story: the past stays as it was, "${from}" is kept as another name, and the DM is told about the change.`}
                />
              </div>

              {mode === 'retcon' && preview && (
                <div>
                  <p className="mb-2 text-sm text-parchment-300">
                    {preview.total ? `${preview.total} mention${preview.total === 1 ? '' : 's'} in ${preview.messages.length} message${preview.messages.length === 1 ? '' : 's'}` : 'No mentions in the story text'}
                    {preview.memory ? `, plus ${preview.memory} in the Journal and summaries` : ''}.{preview.messages.length ? ' Untick any line that should keep the old name.' : ''}
                  </p>
                  <ul className="space-y-2">
                    {preview.messages.map((m) => {
                      const on = !skip.has(m.id)
                      return (
                        <li key={m.id}>
                          <label className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2 text-[0.82rem] ${on ? 'border-gold-500/25 bg-ink-850/80' : 'border-gold-500/10 opacity-50'}`}>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => {
                                const next = new Set(skip)
                                if (on) next.add(m.id)
                                else next.delete(m.id)
                                setSkip(next)
                              }}
                              className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-gold-400)]"
                            />
                            <span className="min-w-0">
                              <span className="block text-[0.65rem] font-semibold tracking-[0.12em] text-gold-400 uppercase">{m.role === 'user' ? 'You' : 'DM'}</span>
                              <span className="block text-parchment-500 line-through decoration-blood-400/50">{m.before}</span>
                              <span className="block text-parchment-100">{m.after}</span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              {error && <p className="text-sm text-blood-400">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-gold-500/15 px-5 py-3">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" icon="check" onClick={() => void apply()} disabled={!mode || !ready || working || busy || (mode === 'retcon' && !preview)}>
                {mode === 'retcon' ? 'Rewrite the name' : mode === 'story' ? 'Rename' : 'Choose one'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function Choice({ active, disabled, onClick, title, text }: { active: boolean; disabled: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`no-drag cursor-pointer rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'border-gold-400/80 bg-gold-500/10' : 'border-gold-500/20 bg-ink-850/80 hover:border-gold-500/45'}`}
    >
      <span className="block font-display tracking-wide text-parchment-50">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-parchment-400">{text}</span>
    </button>
  )
}
