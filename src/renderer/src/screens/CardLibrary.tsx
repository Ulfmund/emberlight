import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cardImageUrl, MAX_COMPANIONS, type CardSummary } from '@shared/cards'
import { api } from '../api'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { speakerColor } from '../components/StoryText'

type Note = { tone: 'good' | 'bad' | 'neutral'; text: string }

/**
 * The character library (docs/spec/03-characters-and-cards.md): import cards from
 * SillyTavern, Chub and friends, then play as one or bring them along as companions.
 */
export function CardLibrary({
  open,
  onClose,
  dropped,
  playerCardId,
  companionIds,
  onPlayAs,
  onToggleCompanion
}: {
  open: boolean
  onClose: () => void
  /** Files dropped onto the creator, to import as soon as the library opens. */
  dropped: File[]
  playerCardId?: string
  companionIds: string[]
  onPlayAs: (card: CardSummary) => void
  onToggleCompanion: (card: CardSummary) => void
}) {
  const [cards, setCards] = useState<CardSummary[] | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) api.cards().then(setCards).catch(() => setCards([]))
  }, [open])

  const importFiles = async (files: File[]) => {
    if (!files.length) return
    setBusy(true)
    const out: Note[] = []
    const added = new Set<string>()
    for (const f of files) {
      try {
        const r = await api.importCard(f)
        added.add(r.card.id)
        out.push(r.existing ? { tone: 'neutral', text: `${r.card.name} was already in your library.` } : { tone: 'good', text: `Added ${r.card.name}.` })
      } catch (err) {
        out.push({ tone: 'bad', text: `${f.name}: ${(err as Error).message}` })
      }
    }
    setNotes(out)
    setFresh(added)
    setCards(await api.cards().catch(() => cards ?? []))
    setBusy(false)
  }

  useEffect(() => {
    if (open && dropped.length) void importFiles(dropped)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropped])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const remove = async (id: string) => {
    if (confirmDelete !== id) return setConfirmDelete(id)
    setConfirmDelete(null)
    if (companionIds.includes(id)) {
      const c = cards?.find((x) => x.id === id)
      if (c) onToggleCompanion(c)
    }
    setCards(await api.deleteCard(id))
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 backdrop-blur-sm md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-label="Character library"
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="panel flex h-full w-full max-w-5xl flex-col overflow-hidden md:h-auto md:max-h-[86vh] md:rounded-2xl"
          >
            <div className="flex items-start gap-4 border-b border-gold-500/15 px-6 pt-5 pb-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold-500/35 bg-ink-850 text-gold-300">
                <Icon name="cards" size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-2xl tracking-wider text-gold-300">Character Library</h2>
                <p className="text-sm text-parchment-400">Play as a character from a card, or bring up to {MAX_COMPANIONS} along as companions the Dungeon Master plays.</p>
              </div>
              <button onClick={onClose} className="no-drag focus-ring cursor-pointer rounded-lg p-2 text-parchment-400 hover:bg-white/5 hover:text-gold-200" aria-label="Close">
                <Icon name="x" size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6">
              {/* Drop zone */}
              <button
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDragging(false)
                  void importFiles([...e.dataTransfer.files])
                }}
                className={`no-drag focus-ring group flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed px-5 py-4 text-left transition-colors ${
                  dragging ? 'border-ember-400 bg-ember-500/10' : 'border-gold-500/30 bg-ink-900/50 hover:border-gold-400/60'
                }`}
              >
                <motion.span animate={busy ? { y: [0, -4, 0] } : { y: 0 }} transition={busy ? { repeat: Infinity, duration: 0.9 } : undefined} className="text-gold-300">
                  <Icon name="upload" size={30} />
                </motion.span>
                <span className="min-w-0">
                  <span className="block font-display tracking-wide text-parchment-50">{busy ? 'Reading cards…' : 'Drop character cards here, or click to choose'}</span>
                  <span className="block text-xs text-parchment-400">PNG cards, .json or .charx, from SillyTavern, Chub and similar sites. Several at once is fine.</span>
                </span>
              </button>
              <input
                ref={input}
                type="file"
                multiple
                accept=".png,.json,.charx,image/png,application/json"
                className="hidden"
                onChange={(e) => {
                  void importFiles([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />

              <AnimatePresence>
                {notes.length > 0 && (
                  <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-1 text-sm">
                    {notes.map((n, i) => (
                      <li key={i} className={`flex items-start gap-2 ${n.tone === 'good' ? 'text-moss-400' : n.tone === 'bad' ? 'text-blood-400' : 'text-parchment-300'}`}>
                        <Icon name={n.tone === 'bad' ? 'warn' : 'check'} size={15} className="mt-0.5 shrink-0" />
                        {n.text}
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>

              {/* Cards */}
              {cards && cards.length === 0 && (
                <div className="mt-8 text-center text-sm text-parchment-400">
                  <p className="font-story text-lg text-parchment-300 italic">Your library is empty.</p>
                  <p className="mx-auto mt-2 max-w-lg">
                    Download a card as a PNG from a site like Chub, or find the ones you already have in SillyTavern's folder:{' '}
                    <span className="text-parchment-200">SillyTavern\data\default-user\characters</span>.
                  </p>
                </div>
              )}
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence initial={false}>
                  {cards?.map((card) => (
                    <CardTile
                      key={card.id}
                      card={card}
                      fresh={fresh.has(card.id)}
                      isPlayer={card.id === playerCardId}
                      isCompanion={companionIds.includes(card.id)}
                      partyFull={companionIds.length >= MAX_COMPANIONS}
                      confirmingDelete={confirmDelete === card.id}
                      onPlayAs={() => onPlayAs(card)}
                      onToggleCompanion={() => onToggleCompanion(card)}
                      onDelete={() => void remove(card.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-gold-500/15 px-6 py-3">
              <span className="text-xs text-parchment-500">
                {companionIds.length ? `${companionIds.length} companion${companionIds.length === 1 ? '' : 's'} coming along` : 'No companions yet'}
              </span>
              <Button variant="primary" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CardTile({
  card,
  fresh,
  isPlayer,
  isCompanion,
  partyFull,
  confirmingDelete,
  onPlayAs,
  onToggleCompanion,
  onDelete
}: {
  card: CardSummary
  fresh: boolean
  isPlayer: boolean
  isCompanion: boolean
  partyFull: boolean
  confirmingDelete: boolean
  onPlayAs: () => void
  onToggleCompanion: () => void
  onDelete: () => void
}) {
  const color = speakerColor(card.name)
  const chosen = isPlayer || isCompanion
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-ink-850/90 transition-colors ${
        chosen ? 'border-gold-400/80 shadow-[0_0_30px_-8px_rgb(255_160_50/0.5)]' : fresh ? 'border-ember-400/70' : 'border-gold-500/15 hover:border-gold-500/40'
      }`}
    >
      <div className="relative h-52 overflow-hidden">
        {card.hasImage ? (
          <img src={cardImageUrl(card.id)} alt="" draggable={false} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" style={{ objectPosition: 'center 15%' }} />
        ) : (
          <div className="grid h-full w-full place-items-center" style={{ background: `radial-gradient(circle at 50% 35%, color-mix(in oklab, ${color} 45%, #120d10), #120d10 75%)` }}>
            <span className="font-display text-5xl font-bold" style={{ color: `color-mix(in oklab, ${color} 70%, #fff)` }}>
              {card.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-850 via-ink-850/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-2">
          <div className="truncate font-display text-xl tracking-wide text-parchment-50 drop-shadow">{card.name}</div>
          {card.creator && <div className="truncate text-[0.7rem] text-parchment-400">by {card.creator}</div>}
        </div>
        {chosen && (
          <span className="absolute top-2 left-2 rounded-full bg-gold-400 px-2.5 py-0.5 text-[0.7rem] font-semibold text-ink-950 shadow">
            {isPlayer ? 'You' : 'Companion'}
          </span>
        )}
        <button
          onClick={onDelete}
          className={`no-drag absolute top-2 right-2 flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs transition ${
            confirmingDelete ? 'bg-blood-500 text-parchment-50' : 'bg-ink-950/70 text-parchment-300 opacity-0 touch:opacity-100 group-hover:opacity-100 hover:text-blood-400'
          }`}
          title="Remove from library"
        >
          <Icon name="trash" size={14} />
          {confirmingDelete && 'Remove?'}
        </button>
      </div>

      <div className="flex flex-1 flex-col px-4 pt-1 pb-4">
        <p className="line-clamp-3 min-h-[3.6em] text-[0.82rem] leading-snug text-parchment-300">{card.tagline || 'No description.'}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {card.greetings > 0 && <Chip>{card.greetings} greeting{card.greetings === 1 ? '' : 's'}</Chip>}
          {card.bookEntries > 0 && <Chip>{card.bookEntries} lore entr{card.bookEntries === 1 ? 'y' : 'ies'}</Chip>}
          {card.tags.slice(0, 3).map((t) => (
            <Chip key={t} dim>
              {t}
            </Chip>
          ))}
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          <Button size="sm" variant={isPlayer ? 'primary' : 'secondary'} icon="user" onClick={onPlayAs} disabled={isCompanion}>
            {isPlayer ? 'Playing' : 'Play as'}
          </Button>
          <Button size="sm" variant={isCompanion ? 'primary' : 'secondary'} icon="party" onClick={onToggleCompanion} disabled={isPlayer || (!isCompanion && partyFull)}>
            {isCompanion ? 'Coming' : 'Bring along'}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

function Chip({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return <span className={`rounded px-1.5 py-px text-[0.68rem] font-semibold ${dim ? 'bg-white/5 text-parchment-400' : 'bg-gold-500/15 text-gold-200'}`}>{children}</span>
}
