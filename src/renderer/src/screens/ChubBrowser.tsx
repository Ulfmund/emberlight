import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CHUB_SORT_LABEL, CHUB_SORTS, type ChubBook, type ChubResults, type ChubSort } from '@shared/chub'
import type { Lorebook, LorebookSummary } from '@shared/lore'
import { api } from '../api'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'

/** How big a book is, roughly ("9k tokens"). */
const size = (tokens: number) => (tokens >= 1000 ? `${Math.round(tokens / 1000)}k tokens` : tokens > 0 ? `${tokens} tokens` : '')

/**
 * Finding lorebooks on Chub (docs/spec/07-memory-and-lore.md#finding-lorebooks-on-chub): search
 * the lorebooks its community shares, read what each is, and add one to the library, where it
 * can be used like any other. Fantasy only and NSFW off to begin with.
 */
export function ChubBrowser({
  library,
  onAdded,
  attached,
  onToggleAttach,
  context
}: {
  library: LorebookSummary[] | null
  onAdded: (book: Lorebook, existing: boolean) => void
  attached?: string[]
  onToggleAttach?: (id: string) => void
  context: string
}) {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ChubSort>('downloads')
  const [fantasy, setFantasy] = useState(true)
  const [nsfw, setNsfw] = useState(false)
  const [books, setBooks] = useState<ChubBook[]>([])
  const [meta, setMeta] = useState<Omit<ChubResults, 'books'> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [addError, setAddError] = useState<{ path: string; text: string } | null>(null)
  const asking = useRef<AbortController | null>(null)

  const search = async (page: number) => {
    asking.current?.abort()
    const ask = new AbortController()
    asking.current = ask
    setLoading(true)
    setError('')
    try {
      const r = await api.chubSearch({ query, page, sort, nsfw, fantasy }, ask.signal)
      if (ask.signal.aborted) return
      const { books: found, ...rest } = r
      setBooks((was) => (page > 1 ? [...was, ...found.filter((b) => !was.some((w) => w.path === b.path))] : found))
      setMeta(rest)
    } catch (e) {
      if (!ask.signal.aborted) setError((e as Error).message)
    } finally {
      if (!ask.signal.aborted) setLoading(false)
    }
  }
  // A new search from the first page whenever what's asked changes.
  useEffect(() => {
    void search(1)
    return () => asking.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sort, fantasy, nsfw])

  const inLibrary = (b: ChubBook) => library?.find((x) => x.description.includes(b.url))
  const add = async (b: ChubBook) => {
    setAdding(b.path)
    setAddError(null)
    try {
      const r = await api.chubAdd(b.path)
      onAdded(r.book, r.existing)
    } catch (e) {
      setAddError({ path: b.path, text: (e as Error).message })
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 border-b border-gold-500/10 px-4 pt-4 pb-3 md:px-6">
        <div>
          <h3 className="font-display text-lg tracking-wide text-parchment-50">Find on Chub</h3>
          <p className="text-xs text-parchment-400">Lorebooks shared on chub.ai. Add one to your library to use it.</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim() === query) void search(1)
            else setQuery(draft.trim())
          }}
        >
          <span className="relative min-w-0 flex-1">
            <Icon name="search" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-parchment-500" />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={100} placeholder="A setting, a people, a place…" className="input text-sm" style={{ paddingLeft: '2.25rem' }} aria-label="Search Chub's lorebooks" enterKeyHint="search" />
          </span>
          <Button size="sm" variant="secondary" type="submit">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="w-44">
            <select value={sort} onChange={(e) => setSort(e.target.value as ChubSort)} className="input" style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem' }} aria-label="Order">
              {CHUB_SORTS.map((s) => (
                <option key={s} value={s}>
                  {CHUB_SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </span>
          <button
            type="button"
            onClick={() => setFantasy(!fantasy)}
            aria-pressed={fantasy}
            className={`no-drag cursor-pointer rounded-md border px-2.5 py-1 font-semibold transition-colors touch:py-1.5 ${fantasy ? 'border-gold-300 bg-gold-400/20 text-gold-100' : 'border-gold-500/20 text-parchment-400 hover:text-gold-200'}`}
          >
            Fantasy only
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 text-parchment-400">
            <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} className="h-4 w-4 accent-[var(--color-gold-400)]" />
            Show NSFW
          </label>
          {meta && <span className="ml-auto text-parchment-500 tabular-nums">{meta.total.toLocaleString()} found</span>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-6">
        {error && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-blood-500/30 bg-blood-500/10 px-3 py-2 text-sm text-blood-300">
            <Icon name="warn" size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <Button size="sm" variant="ghost" onClick={() => void search(1)}>
              Try again
            </Button>
          </div>
        )}
        {!loading && !error && books.length === 0 && <p className="py-8 text-center text-sm text-parchment-400">Nothing found. Try other words{fantasy ? ', or turn off Fantasy only' : ''}.</p>}
        <div className="space-y-2">
          {books.map((b) => {
            const have = inLibrary(b)
            const on = have && attached?.includes(have.id)
            const expanded = open === b.path
            return (
              <motion.div key={b.path} layout="position" className="rounded-xl border border-gold-500/15 bg-ink-850/80 p-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gold-500/25 bg-ink-800 text-gold-300">
                    <Icon name="scroll" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-display text-[0.98rem] tracking-wide text-parchment-50">{b.name}</span>
                      <span className="text-[0.72rem] text-parchment-500">
                        by {b.author}
                        {size(b.tokens) && ` · ${size(b.tokens)}`}
                      </span>
                    </div>
                    {b.tagline && <p className="mt-0.5 text-[0.84rem] leading-snug text-parchment-300">{b.tagline}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {b.instructions && (
                        <span className="rounded bg-ember-500/15 px-1.5 py-px text-[0.66rem] font-semibold text-ember-400" title="Written as instructions for the AI or a game system: it may clash with Emberlight's own rules">
                          Instructions, not a world
                        </span>
                      )}
                      {b.nsfw && <span className="rounded bg-blood-500/20 px-1.5 py-px text-[0.66rem] font-semibold text-blood-300">NSFW</span>}
                      {b.tags.slice(0, 5).map((t) => (
                        <span key={t} className="rounded bg-white/5 px-1.5 py-px text-[0.66rem] font-semibold text-parchment-400">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {expanded && b.description && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 overflow-hidden text-[0.82rem] leading-relaxed text-parchment-300">
                      {b.description}
                    </motion.p>
                  )}
                </AnimatePresence>
                {addError?.path === b.path && <p className="mt-2 text-xs text-blood-400">{addError.text}</p>}
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {b.description && (
                    <button type="button" onClick={() => setOpen(expanded ? null : b.path)} className="no-drag mr-auto cursor-pointer text-xs text-parchment-400 hover:text-gold-200 touch:py-1" aria-expanded={expanded}>
                      {expanded ? 'Less' : 'About it'}
                    </button>
                  )}
                  <a href={b.url} target="_blank" rel="noreferrer" className="no-drag flex items-center gap-1 rounded-md px-2 py-1 text-xs text-parchment-400 hover:bg-white/5 hover:text-gold-200" title="Its page on chub.ai">
                    chub.ai
                  </a>
                  {have ? (
                    onToggleAttach ? (
                      <button
                        type="button"
                        onClick={() => onToggleAttach(have.id)}
                        className={`no-drag cursor-pointer rounded-md border px-2.5 py-1 text-xs font-semibold touch:py-1.5 ${on ? 'border-gold-300 bg-gold-400/20 text-gold-100' : 'border-gold-500/25 text-parchment-300 hover:text-gold-200'}`}
                        title={on ? `Used in this ${context}` : `In your library: use it in this ${context}`}
                      >
                        {on ? 'In use' : 'Added · Use'}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-moss-400">
                        <Icon name="check" size={13} /> In your library
                      </span>
                    )
                  ) : (
                    <Button size="sm" variant="primary" icon="plus" disabled={adding !== null} onClick={() => void add(b)}>
                      {adding === b.path ? 'Adding…' : 'Add'}
                    </Button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
        {loading && <p className="py-6 text-center text-sm text-parchment-400 italic">Asking Chub…</p>}
        {!loading && meta?.more && (
          <div className="py-4 text-center">
            <Button size="sm" variant="ghost" onClick={() => void search(meta.page + 1)}>
              More
            </Button>
          </div>
        )}
        {meta && meta.hidden > 0 && !nsfw && <p className="pb-3 text-center text-[0.7rem] text-parchment-500">Some were left out as NSFW.</p>}
      </div>
    </div>
  )
}
