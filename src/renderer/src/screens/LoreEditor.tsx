import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { LOGIC_LABEL, normalizeEntry, newEntryId, POSITION_LABEL, selectLore, type LoreEntry, type Lorebook, type LorebookSummary, type LorePosition, type SecondaryLogic } from '@shared/lore'
import { api } from '../api'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { ChubBrowser } from './ChubBrowser'

/**
 * The lorebook library and editor (docs/spec/07-memory-and-lore.md#lorebooks): a list of
 * books, the chosen book's entries, and a test box that shows which entries a sentence wakes.
 * Changes save by themselves a moment after you stop typing.
 */
export function LoreEditor({
  open,
  onClose,
  attached,
  onToggleAttach,
  context = 'adventure'
}: {
  open: boolean
  onClose: () => void
  /** When editing for an adventure: which books it uses. */
  attached?: string[]
  onToggleAttach?: (id: string) => void
  context?: 'adventure' | 'new adventure'
}) {
  const [books, setBooks] = useState<LorebookSummary[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  /** Finding lorebooks on Chub (ChubBrowser), in place of the book being edited. */
  const [browsing, setBrowsing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const refresh = () => api.lorebooks().then(setBooks).catch((e: Error) => setError(e.message))
  // Fresh each time it opens (only then: the parent re-rendering mustn't lose the selection).
  useEffect(() => {
    if (!open) return
    void refresh()
    setSelected(null)
    setBrowsing(false)
    setError('')
    setNotice('')
  }, [open])
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) && close.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const importFiles = async (files: File[]) => {
    setError('')
    setNotice('')
    for (const f of files) {
      try {
        const b = await api.importLorebook(f)
        setNotice(`Imported ${b.name} (${b.entries.length} entries).`)
        setSelected(b.id)
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`)
      }
    }
    await refresh()
  }
  const create = async () => {
    const b = await api.createLorebook('New lorebook')
    await refresh()
    setSelected(b.id)
  }

  // Drawn at the top of the page: inside a blurred panel, 'fixed' would mean 'fixed to the panel'.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 backdrop-blur-sm md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onDrop={(e) => {
            // Ours alone: the creator behind would otherwise try it as a character card.
            e.preventDefault()
            e.stopPropagation()
            void importFiles([...e.dataTransfer.files])
          }}
        >
          <motion.div
            role="dialog"
            aria-label="Lorebooks"
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            className="panel relative flex h-full w-full max-w-6xl flex-col overflow-hidden md:h-[min(90vh,56rem)] md:rounded-2xl"
          >
            <div className="flex items-center gap-3 border-b border-gold-500/15 px-4 py-3 md:px-6">
              {(selected || browsing) && (
                <button onClick={() => (setSelected(null), setBrowsing(false))} className="no-drag grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-parchment-300 md:hidden" aria-label="All lorebooks">
                  <Icon name="left" size={18} />
                </button>
              )}
              <Icon name="scroll" size={22} className="hidden text-gold-300 md:block" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-xl tracking-wider text-gold-300">Lorebooks</h2>
                <p className="hidden text-xs text-parchment-400 md:block">World knowledge the DM is given only when the story touches it. SillyTavern World Info files work too.</p>
              </div>
              <Button size="sm" variant={browsing ? 'secondary' : 'ghost'} icon="search" onClick={() => (setBrowsing(true), setSelected(null))} title="Find lorebooks others have shared on chub.ai">
                <span className="hidden sm:inline">Find on Chub</span>
              </Button>
              <Button size="sm" variant="ghost" icon="upload" onClick={() => input.current?.click()}>
                <span className="hidden sm:inline">Import</span>
              </Button>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => void create()}>
                <span className="hidden sm:inline">New</span>
              </Button>
              <button onClick={onClose} className="no-drag cursor-pointer rounded-lg p-2 text-parchment-400 hover:bg-white/5 hover:text-gold-200" aria-label="Close">
                <Icon name="x" size={20} />
              </button>
              <input ref={input} type="file" multiple accept=".json,application/json" className="hidden" onChange={(e) => {
                void importFiles([...(e.target.files ?? [])])
                e.target.value = ''
              }} />
            </div>
            {(error || notice) && (
              <div className={`border-b border-gold-500/10 px-6 py-2 text-sm ${error ? 'text-blood-400' : 'text-moss-400'}`}>{error || notice}</div>
            )}
            <div className="flex min-h-0 flex-1">
              <aside className={`${selected || browsing ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col overflow-y-auto border-r border-gold-500/15 p-3 md:w-72`}>
                {books?.length === 0 && <p className="p-4 text-sm text-parchment-400">No lorebooks yet. Find one on Chub, import one, or start a new one.</p>}
                {books?.map((b) => {
                  const on = attached?.includes(b.id)
                  return (
                    <div key={b.id} className={`group mb-1 flex items-center gap-2 rounded-lg px-2 py-2 ${selected === b.id ? 'bg-gold-500/10 ring-1 ring-gold-400/40' : 'hover:bg-white/5'}`}>
                      <button onClick={() => (setSelected(b.id), setBrowsing(false))} className="no-drag min-w-0 flex-1 cursor-pointer text-left">
                        <div className="truncate text-sm text-parchment-100">{b.name}</div>
                        <div className="text-[0.7rem] text-parchment-500">
                          {b.entries} entr{b.entries === 1 ? 'y' : 'ies'}
                          {b.builtin && ' · example world'}
                        </div>
                      </button>
                      {onToggleAttach && (
                        <button
                          onClick={() => onToggleAttach(b.id)}
                          className={`no-drag shrink-0 cursor-pointer rounded-md border px-2 py-1 text-[0.7rem] font-semibold ${on ? 'border-gold-300 bg-gold-400/20 text-gold-100' : 'border-gold-500/25 text-parchment-400 hover:text-gold-200'}`}
                          title={on ? `Used in this ${context}` : `Use in this ${context}`}
                        >
                          {on ? 'In use' : 'Use'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </aside>
              <section className={`${selected || browsing ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
                {browsing ? (
                  <ChubBrowser
                    library={books}
                    attached={attached}
                    onToggleAttach={onToggleAttach}
                    context={context}
                    onAdded={(b, existing) => {
                      setError('')
                      setNotice(existing ? `${b.name} is already in your library.` : `Added ${b.name} (${b.entries.length} entries).`)
                      void refresh()
                    }}
                  />
                ) : selected ? (
                  <BookEditor key={selected} id={selected} onChanged={() => void refresh()} onDeleted={() => { setSelected(null); void refresh() }} />
                ) : (
                  <p className="m-auto max-w-sm p-6 text-center font-story text-lg text-parchment-400 italic">Pick a lorebook to read or edit it.</p>
                )}
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ---- One book --------------------------------------------------------------------------------

function BookEditor({ id, onChanged, onDeleted }: { id: string; onChanged: () => void; onDeleted: () => void }) {
  const [book, setBook] = useState<Lorebook | null>(null)
  const [state, setState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved')
  const [open, setOpen] = useState<string | null>(null)
  const [test, setTest] = useState('')
  const [filter, setFilter] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef<Lorebook | null>(null)

  useEffect(() => {
    api.lorebook(id).then((b) => {
      setBook(b)
      latest.current = b
    })
    // Save anything pending when the book is closed.
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        if (latest.current) void api.saveLorebook(latest.current).then(onChanged)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const change = (next: Lorebook) => {
    setBook(next)
    latest.current = next
    setState('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = undefined
      setState('saving')
      api.saveLorebook(next).then(
        () => {
          setState('saved')
          onChanged()
        },
        () => setState('error')
      )
    }, 700)
  }
  const setEntry = (eid: string, patch: Partial<LoreEntry>) => book && change({ ...book, entries: book.entries.map((e) => (e.id === eid ? { ...e, ...patch } : e)) })

  const fired = useMemo(() => (book && test.trim() ? new Set(selectLore(book.entries, [test], { budgetChars: 1e9, rng: () => 0 }).map((e) => e.id)) : null), [book, test])
  if (!book) return <p className="m-auto text-parchment-400">Opening…</p>
  const shown = filter.trim() ? book.entries.filter((e) => [e.name, ...e.keys, e.content].join(' ').toLowerCase().includes(filter.trim().toLowerCase())) : book.entries

  const addEntry = () => {
    const e = normalizeEntry({ id: newEntryId(), name: 'New entry' })
    change({ ...book, entries: [e, ...book.entries] })
    setOpen(e.id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-gold-500/15 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <input value={book.name} onChange={(e) => change({ ...book, name: e.target.value })} maxLength={120} className="input min-w-0 flex-1 py-1.5 font-display text-lg tracking-wide" aria-label="Lorebook name" />
          <span className="w-16 shrink-0 text-right text-[0.7rem] text-parchment-500">{state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : state === 'error' ? <span className="text-blood-400">Not saved</span> : '…'}</span>
        </div>
        <textarea value={book.description} onChange={(e) => change({ ...book, description: e.target.value })} rows={1} placeholder="What this lorebook is about (for you; the DM doesn't see this)" className="input resize-y py-1.5 text-sm" />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-parchment-300">
          <Check on={Boolean(book.global)} onChange={(v) => change({ ...book, global: v })}>
            Use in every adventure
          </Check>
          <label className="flex items-center gap-2">
            <span className="text-xs text-parchment-400">Most it may add (characters, 0 = no limit)</span>
            <input type="number" min={0} step={500} value={book.budget ?? 0} onChange={(e) => change({ ...book, budget: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className="input w-24 py-1 text-sm" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Icon name="sparkle" size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ember-400" />
            <input value={test} onChange={(e) => setTest(e.target.value)} placeholder="Test: type a sentence to see which entries wake up" className="input py-1.5 text-sm" style={{ paddingLeft: '2.25rem' }} />
          </div>
          {fired && <span className="text-xs text-ember-400">{fired.size} would be used</span>}
          {book.entries.length > 8 && <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find…" className="input w-32 py-1.5 text-sm" />}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-6">
        <div className="mb-3 flex items-center gap-2">
          <Button size="sm" variant="secondary" icon="plus" onClick={addEntry}>
            Add entry
          </Button>
          <a href={api.lorebookExportUrl(book.id)} download className="no-drag flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-parchment-300 hover:bg-white/5 hover:text-gold-200">
            <Icon name="save" size={15} /> Export
          </a>
          <button
            onClick={() => (confirmDelete ? void api.deleteLorebook(book.id).then(onDeleted) : setConfirmDelete(true))}
            className={`no-drag ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${confirmDelete ? 'bg-blood-500 text-parchment-50' : 'text-parchment-400 hover:text-blood-400'}`}
          >
            <Icon name="trash" size={15} />
            {confirmDelete ? 'Delete this lorebook?' : 'Delete'}
          </button>
        </div>
        {!book.entries.length && <p className="py-8 text-center font-story text-lg text-parchment-400 italic">No entries yet.</p>}
        <div className="space-y-2">
          {shown.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              open={open === e.id}
              fired={fired?.has(e.id)}
              onToggle={() => setOpen(open === e.id ? null : e.id)}
              onChange={(p) => setEntry(e.id, p)}
              onDelete={() => change({ ...book, entries: book.entries.filter((x) => x.id !== e.id) })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const csv = (xs: string[]) => xs.join(', ')
const fromCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

function EntryCard({
  entry: e,
  open,
  fired,
  onToggle,
  onChange,
  onDelete
}: {
  entry: LoreEntry
  open: boolean
  fired?: boolean
  onToggle: () => void
  onChange: (p: Partial<LoreEntry>) => void
  onDelete: () => void
}) {
  // Key fields are edited as text so typing a comma doesn't fight the cursor.
  const [keys, setKeys] = useState(csv(e.keys))
  const [sec, setSec] = useState(csv(e.secondaryKeys))
  const [chars, setChars] = useState(csv(e.characters))
  return (
    <div className={`rounded-xl border bg-ink-850/80 transition-colors ${fired ? 'border-ember-400/70 shadow-[0_0_20px_-8px_rgb(255_122_47/0.8)]' : open ? 'border-gold-400/50' : 'border-gold-500/15'} ${e.enabled ? '' : 'opacity-60'}`}>
      <button onClick={onToggle} className="no-drag flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left">
        <Icon name="chevron" size={15} className={`mt-1 shrink-0 text-parchment-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display tracking-wide text-parchment-50">{e.name || e.keys[0] || 'Untitled'}</span>
            {e.constant && <Tag tone="gold">Always</Tag>}
            {!e.enabled && <Tag>Off</Tag>}
            {e.probability < 100 && <Tag>{e.probability}%</Tag>}
            {e.group && <Tag>group: {e.group}</Tag>}
            {fired && <Tag tone="ember">would be used</Tag>}
          </span>
          {!e.constant && <span className="mt-0.5 block truncate text-xs text-parchment-400">{e.keys.join(' · ') || 'No keywords yet'}</span>}
          {!open && <span className="mt-1 line-clamp-2 block text-[0.82rem] text-parchment-300">{e.content}</span>}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-gold-500/10 px-4 pt-3 pb-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Title (for you)">
              <input value={e.name} onChange={(x) => onChange({ name: x.target.value })} maxLength={200} className="input py-1.5 text-sm" />
            </Field>
            <Field label="Keywords that wake it (comma between)">
              <input
                value={keys}
                onChange={(x) => {
                  setKeys(x.target.value)
                  onChange({ keys: fromCsv(x.target.value) })
                }}
                disabled={e.constant}
                placeholder={e.constant ? 'Not needed: always included' : 'e.g. Wending, toll bridge'}
                className="input py-1.5 text-sm"
              />
            </Field>
          </div>
          <Field label="What the DM is told">
            <textarea value={e.content} onChange={(x) => onChange({ content: x.target.value })} rows={Math.min(14, Math.max(4, Math.ceil(e.content.length / 90)))} className="input resize-y py-2 font-story text-[1rem] leading-relaxed" />
          </Field>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-parchment-300">
            <Check on={e.enabled} onChange={(v) => onChange({ enabled: v })}>
              On
            </Check>
            <Check on={e.constant} onChange={(v) => onChange({ constant: v })}>
              Always include
            </Check>
            <Check on={e.wholeWords} onChange={(v) => onChange({ wholeWords: v })}>
              Whole words only
            </Check>
            <Check on={e.caseSensitive} onChange={(v) => onChange({ caseSensitive: v })}>
              Match capitals
            </Check>
          </div>
          <details className="rounded-lg border border-gold-500/10 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold tracking-[0.12em] text-gold-400 uppercase">More options</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field label="Also needs">
                <div className="flex gap-2">
                  <select value={e.logic} onChange={(x) => onChange({ logic: x.target.value as SecondaryLogic })} className="input w-auto py-1.5 text-sm">
                    {(Object.keys(LOGIC_LABEL) as SecondaryLogic[]).map((l) => (
                      <option key={l} value={l}>
                        {LOGIC_LABEL[l]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={sec}
                    onChange={(x) => {
                      setSec(x.target.value)
                      onChange({ secondaryKeys: fromCsv(x.target.value) })
                    }}
                    placeholder="other words (optional)"
                    className="input min-w-0 flex-1 py-1.5 text-sm"
                  />
                </div>
              </Field>
              <Field label="Priority (higher wins when space is short)">
                <input type="number" value={e.priority} onChange={(x) => onChange({ priority: Math.round(Number(x.target.value) || 0) })} className="input py-1.5 text-sm" />
              </Field>
              <Field label="Chance to be used (%)">
                <input type="number" min={0} max={100} value={e.probability} onChange={(x) => onChange({ probability: Math.max(0, Math.min(100, Number(x.target.value) || 0)) })} className="input py-1.5 text-sm" />
              </Field>
              <Field label="Group (only one per group is used)">
                <input value={e.group} onChange={(x) => onChange({ group: x.target.value })} maxLength={80} className="input py-1.5 text-sm" />
              </Field>
              <Field label="Messages to search (blank = 4)">
                <input type="number" min={1} max={100} value={e.scanDepth ?? ''} onChange={(x) => onChange({ scanDepth: x.target.value ? Math.max(1, Math.min(100, Math.round(Number(x.target.value)))) : null })} className="input py-1.5 text-sm" />
              </Field>
              <div className="flex flex-col justify-end gap-1.5 text-sm text-parchment-300">
                <Check on={e.preventRecursion} onChange={(v) => onChange({ preventRecursion: v })}>
                  Its text can't wake other entries
                </Check>
                <Check on={e.excludeRecursion} onChange={(v) => onChange({ excludeRecursion: v })}>
                  Other entries can't wake it
                </Check>
              </div>
              <Field label="Where the DM is told it">
                <div className="flex gap-2">
                  <select value={e.position} onChange={(x) => onChange({ position: x.target.value as LorePosition })} className="input min-w-0 flex-1 py-1.5 text-sm">
                    {(Object.keys(POSITION_LABEL) as LorePosition[]).map((p) => (
                      <option key={p} value={p}>
                        {POSITION_LABEL[p]}
                      </option>
                    ))}
                  </select>
                  {e.position === 'depth' && (
                    <input type="number" min={0} max={100} value={e.depth} onChange={(x) => onChange({ depth: Math.max(0, Math.min(100, Math.round(Number(x.target.value) || 0))) })} className="input w-16 py-1.5 text-sm" aria-label="Messages back" title="Messages back (0 = the newest)" />
                  )}
                </div>
              </Field>
              <Field label="Only with these characters (comma between)">
                <input
                  value={chars}
                  onChange={(x) => {
                    setChars(x.target.value)
                    onChange({ characters: fromCsv(x.target.value) })
                  }}
                  placeholder="anyone"
                  className="input py-1.5 text-sm"
                />
                {e.characters.length > 0 && (
                  <span className="mt-1.5 block">
                    <Check on={e.excludeCharacters} onChange={(v) => onChange({ excludeCharacters: v })}>
                      Only when they're not there
                    </Check>
                  </span>
                )}
              </Field>
              <Field label="Stays in for (replies)">
                <input type="number" min={0} max={100} value={e.sticky} onChange={(x) => onChange({ sticky: Math.max(0, Math.min(100, Math.round(Number(x.target.value) || 0))) })} className="input py-1.5 text-sm" />
              </Field>
              <Field label="Then rests for (replies)">
                <input type="number" min={0} max={100} value={e.cooldown} onChange={(x) => onChange({ cooldown: Math.max(0, Math.min(100, Math.round(Number(x.target.value) || 0))) })} className="input py-1.5 text-sm" />
              </Field>
              <Field label="Not before message number">
                <input type="number" min={0} max={10000} value={e.delay} onChange={(x) => onChange({ delay: Math.max(0, Math.min(10_000, Math.round(Number(x.target.value) || 0))) })} className="input py-1.5 text-sm" />
              </Field>
            </div>
          </details>
          <div className="flex justify-end">
            <button onClick={onDelete} className="no-drag flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-parchment-400 hover:text-blood-400">
              <Icon name="trash" size={14} /> Delete entry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.68rem] font-semibold tracking-[0.12em] text-gold-400 uppercase">{label}</span>
      {children}
    </label>
  )
}

function Check({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={on} onChange={(x) => onChange(x.target.checked)} className="h-4 w-4 accent-[var(--color-gold-400)]" />
      {children}
    </label>
  )
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: 'gold' | 'ember' }) {
  const c = tone === 'gold' ? 'bg-gold-500/20 text-gold-200' : tone === 'ember' ? 'bg-ember-500/20 text-ember-400' : 'bg-white/5 text-parchment-400'
  return <span className={`rounded px-1.5 py-px text-[0.65rem] font-semibold ${c}`}>{children}</span>
}
