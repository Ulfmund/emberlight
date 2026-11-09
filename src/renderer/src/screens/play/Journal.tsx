import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ATTITUDES, MAX_FACTS, sameName, type Attitude, type Entity, type EntityStatus, type MemoryEvent, type Summary } from '@shared/memory'
import { cardImageUrl } from '@shared/cards'
import type { CampaignView } from '@shared/view'
import { useGame } from '../../store'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { speakerColor } from '../../components/StoryText'
import { LoreEditor } from '../LoreEditor'
import { RenameDialog } from './RenameDialog'

/**
 * The Journal (docs/spec/07-memory-and-lore.md#journal-what-the-player-sees): everything the
 * DM remembers, all editable. The Journal *is* the memory, so a correction here is a
 * correction to what the DM knows.
 */

type Section = 'people' | 'places' | 'story' | 'notes' | 'lore'

const ATTITUDE_INFO: Record<Attitude, { label: string; color: string }> = {
  hostile: { label: 'Hostile', color: '#d9574c' },
  unfriendly: { label: 'Unfriendly', color: '#e8894d' },
  neutral: { label: 'Neutral', color: '#b9a98a' },
  friendly: { label: 'Friendly', color: '#a7c46a' },
  devoted: { label: 'Devoted', color: '#6fc8a0' }
}
const STATUS_INFO: Record<EntityStatus, { label: string; tone: string }> = {
  alive: { label: 'Alive', tone: 'text-parchment-400' },
  dead: { label: 'Dead', tone: 'text-blood-400' },
  missing: { label: 'Missing', tone: 'text-ember-400' },
  unknown: { label: 'Unknown', tone: 'text-parchment-500' }
}

export function Journal({ view, open, onClose }: { view: CampaignView; open: boolean; onClose: () => void }) {
  const [section, setSection] = useState<Section>('people')
  const m = view.memory
  const people = useMemo(() => m.entities.filter((e) => e.kind === 'person').sort(bySeen), [m.entities])
  const places = useMemo(() => m.entities.filter((e) => e.kind === 'place').sort(bySeen), [m.entities])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const sections: { id: Section; label: string; icon: string; count?: number }[] = [
    { id: 'people', label: 'People', icon: 'user', count: people.length },
    { id: 'places', label: 'Places', icon: 'map', count: places.length },
    { id: 'story', label: 'Story', icon: 'scroll', count: m.scenes.length + m.chapters.length || undefined },
    { id: 'notes', label: 'Pinned', icon: 'pin', count: m.notes.length || undefined },
    { id: 'lore', label: 'Lore', icon: 'book', count: view.lorebooks.length || undefined }
  ]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-40 grid place-items-center bg-ink-950/75 backdrop-blur-sm md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-label="Journal"
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="panel relative flex h-full w-full max-w-4xl flex-col overflow-hidden md:h-[min(86vh,52rem)] md:flex-row md:rounded-2xl"
          >
            <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-gold-500/15 bg-ink-950/50 p-2 pr-12 md:w-48 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:p-4">
              <div className="mb-4 hidden items-center gap-2.5 px-1 md:flex">
                <Icon name="book" size={24} className="text-gold-300" />
                <h2 className="font-display text-xl tracking-wider text-gold-300">Journal</h2>
              </div>
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`no-drag relative flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors md:gap-2.5 ${
                    section === s.id ? 'text-gold-200' : 'text-parchment-400 hover:bg-white/5 hover:text-parchment-100'
                  }`}
                >
                  {section === s.id && <motion.span layoutId="journal-tab" className="absolute inset-0 rounded-lg border border-gold-400/40 bg-gold-500/10" />}
                  <Icon name={s.icon} size={16} className="relative" />
                  <span className="relative flex-1 font-display tracking-wide">{s.label}</span>
                  {s.count ? <span className="relative text-xs text-parchment-500 tabular-nums">{s.count}</span> : null}
                </button>
              ))}
              <p className="mt-auto hidden px-1 text-[0.72rem] leading-snug text-parchment-500 md:block">
                This is what the Dungeon Master remembers. Fix anything that's wrong and the DM will know.
              </p>
            </nav>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="absolute top-2 right-2 flex justify-end md:static md:px-3 md:pt-3">
                <button onClick={onClose} className="no-drag focus-ring cursor-pointer rounded-lg bg-ink-950/60 p-2 text-parchment-400 hover:bg-white/5 hover:text-gold-200" aria-label="Close">
                  <Icon name="x" size={20} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8 md:px-7 md:pt-0">
                {section === 'people' && <EntityList view={view} items={people} kind="person" />}
                {section === 'places' && <EntityList view={view} items={places} kind="place" />}
                {section === 'story' && <StorySection view={view} />}
                {section === 'notes' && <NotesSection view={view} />}
                {section === 'lore' && <LoreSection view={view} />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const bySeen = (a: Entity, b: Entity) => Number(a.status === 'dead') - Number(b.status === 'dead') || b.lastSeen - a.lastSeen

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-5">
      <h3 className="font-display text-2xl tracking-wider text-gold-300">{title}</h3>
      <p className="mt-0.5 text-sm text-parchment-400">{text}</p>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-10 text-center font-story text-lg text-parchment-400 italic">{children}</p>
}

/** Saves a Journal change and reports a failure in place. */
function useSave() {
  const journal = useGame((s) => s.journal)
  const [error, setError] = useState('')
  const save = async (edit: MemoryEvent) => {
    setError('')
    try {
      await journal(edit)
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }
  return { save, error }
}

// ---- People and places ----------------------------------------------------------------------

function EntityList({ view, items, kind }: { view: CampaignView; items: Entity[]; kind: 'person' | 'place' }) {
  const [query, setQuery] = useState('')
  const shown = query.trim() ? items.filter((e) => [e.name, ...e.aliases, e.summary, ...e.facts].join(' ').toLowerCase().includes(query.trim().toLowerCase())) : items
  return (
    <>
      <Heading
        title={kind === 'person' ? 'People' : 'Places'}
        text={kind === 'person' ? 'Everyone you have met or heard of, and how they feel about you.' : 'Where you have been, and what you learned there.'}
      />
      {items.length > 6 && (
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="input mb-4 py-2 text-sm" />
      )}
      {!items.length && <Empty>{kind === 'person' ? 'Nobody yet. The people you meet will be written here.' : 'Nowhere yet. The places you visit will be written here.'}</Empty>}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {shown.map((e) => (
            <EntityCard key={e.id} entity={e} view={view} />
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}

function EntityCard({ entity: e, view }: { entity: Entity; view: CampaignView }) {
  const [editing, setEditing] = useState(false)
  const companion = view.cast.find((m) => m.role === 'companion' && m.hasImage && sameName(m.name, e.name))
  const color = speakerColor(e.name)
  const dead = e.status === 'dead'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={`group relative rounded-xl border bg-ink-850/80 p-4 ${editing ? 'border-gold-400/60' : 'border-gold-500/15 hover:border-gold-500/35'}`}
    >
      {editing ? (
        <EntityEditor entity={e} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex gap-4">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border-2 font-display text-base font-bold text-ink-950"
            style={{
              borderColor: color,
              background: e.kind === 'place' ? 'var(--color-ink-800)' : `radial-gradient(circle at 35% 30%, ${color}, color-mix(in oklab, ${color} 40%, #120d10))`,
              filter: dead ? 'grayscale(1) brightness(0.65)' : undefined
            }}
          >
            {companion ? (
              <img src={cardImageUrl(companion.cardId)} alt="" className="h-full w-full object-cover" style={{ objectPosition: 'center 18%' }} />
            ) : e.kind === 'place' ? (
              <Icon name="map" size={22} style={{ color }} />
            ) : (
              initials(e.name)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pr-16">
              <span className={`font-display text-lg tracking-wide ${dead ? 'text-parchment-400 line-through decoration-blood-400/60' : 'text-parchment-50'}`}>{e.name}</span>
              {e.kind === 'person' && e.status !== 'alive' && <span className={`text-xs font-semibold uppercase ${STATUS_INFO[e.status].tone}`}>{STATUS_INFO[e.status].label}</span>}
              {e.aliases.length > 0 && <span className="text-xs text-parchment-500">also {e.aliases.join(', ')}</span>}
            </div>
            {e.kind === 'person' && <AttitudeMeter value={e.attitude} />}
            <p className="mt-1.5 text-[0.92rem] leading-snug text-parchment-200">{e.summary || <span className="text-parchment-500 italic">No description yet.</span>}</p>
            {e.facts.length > 0 && (
              <ul className="mt-2 space-y-1">
                {e.facts.map((f, i) => (
                  <li key={i} className="flex gap-2 text-[0.85rem] leading-snug text-parchment-300">
                    <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-gold-400/70" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[0.7rem] text-parchment-500">
              {e.firstSeenDay === e.lastSeenDay ? `Day ${e.firstSeenDay}` : `First day ${e.firstSeenDay} · last day ${e.lastSeenDay}`}
            </p>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="no-drag absolute top-3 right-3 flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-parchment-400 opacity-0 touch:opacity-100 transition group-hover:opacity-100 hover:bg-white/5 hover:text-gold-200 focus:opacity-100"
          >
            <Icon name="quill" size={14} /> Edit
          </button>
        </div>
      )}
    </motion.div>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 2) || name.slice(0, 1).toUpperCase()

function AttitudeMeter({ value }: { value?: Attitude }) {
  if (!value) return <div className="mt-1 text-[0.72rem] text-parchment-500">Feelings unknown</div>
  const idx = ATTITUDES.indexOf(value)
  const info = ATTITUDE_INFO[value]
  return (
    <div className="mt-1.5 flex items-center gap-2" title={`${info.label} toward you`}>
      <div className="flex gap-0.5">
        {ATTITUDES.map((a, i) => {
          // Lit from neutral (the middle) out to the current feeling.
          const lit = i >= Math.min(2, idx) && i <= Math.max(2, idx)
          return <span key={a} className="h-1.5 w-5 rounded-full" style={{ background: i === idx ? info.color : lit ? `color-mix(in oklab, ${info.color} 35%, transparent)` : 'rgb(255 255 255 / 0.07)' }} />
        })}
      </div>
      <span className="text-[0.72rem] font-semibold" style={{ color: info.color }}>
        {info.label}
      </span>
    </div>
  )
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; color?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`no-drag cursor-pointer rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
            value === o.id ? 'border-gold-300 bg-gold-400/20 text-gold-100' : 'border-gold-500/20 text-parchment-400 hover:text-gold-200'
          }`}
          style={value === o.id && o.color ? { borderColor: o.color, color: o.color, background: `color-mix(in oklab, ${o.color} 15%, transparent)` } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[0.68rem] font-semibold tracking-[0.14em] text-gold-400 uppercase">{children}</span>
}

function EntityEditor({ entity: e, onDone }: { entity: Entity; onDone: () => void }) {
  const { save, error } = useSave()
  // Renaming goes through its own choice (retcon or in-story), so the name isn't edited here.
  const name = e.name
  const [renaming, setRenaming] = useState(false)
  const [aliases, setAliases] = useState(e.aliases.join(', '))
  const [summary, setSummary] = useState(e.summary)
  const [facts, setFacts] = useState(e.facts.join('\n'))
  const [status, setStatus] = useState<EntityStatus>(e.status)
  const [attitude, setAttitude] = useState<Attitude | 'unknown'>(e.attitude ?? 'unknown')
  const [confirmForget, setConfirmForget] = useState(false)
  const person = e.kind === 'person'

  const submit = async () => {
    const ok = await save({
      type: 'entity_edit',
      id: e.id,
      name: name.trim() || e.name,
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      summary,
      facts: facts.split('\n').map((f) => f.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).slice(-MAX_FACTS),
      status,
      attitude: person ? (attitude === 'unknown' ? null : attitude) : undefined
    })
    if (ok) onDone()
  }
  const forget = async () => {
    if (!confirmForget) return setConfirmForget(true)
    await save({ type: 'entity_forget', id: e.id })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <Label>Name</Label>
          <span className="flex gap-2">
            <input value={name} readOnly className="input min-w-0 flex-1 py-2 font-display tracking-wide opacity-80" />
            <Button size="sm" variant="secondary" icon="quill" onClick={() => setRenaming(true)}>
              Rename…
            </Button>
          </span>
          <RenameDialog open={renaming} onClose={() => setRenaming(false)} onRenamed={onDone} from={e.name} target={{ kind: 'entity', id: e.id }} />
        </label>
        <label className="block">
          <Label>Also called</Label>
          <input value={aliases} onChange={(x) => setAliases(x.target.value)} placeholder="Other names, separated by commas" className="input py-2 text-sm" />
        </label>
      </div>
      <label className="block">
        <Label>{person ? 'Who they are' : 'What it is'}</Label>
        <input value={summary} onChange={(x) => setSummary(x.target.value)} maxLength={400} className="input py-2 text-sm" />
      </label>
      <label className="block">
        <Label>What you know (one per line)</Label>
        <textarea value={facts} onChange={(x) => setFacts(x.target.value)} rows={Math.min(8, Math.max(3, e.facts.length + 1))} className="input resize-y py-2 text-sm leading-relaxed" />
      </label>
      {person && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Feelings toward you</Label>
            <Choice
              value={attitude}
              onChange={setAttitude}
              options={[...ATTITUDES.map((a) => ({ id: a, label: ATTITUDE_INFO[a].label, color: ATTITUDE_INFO[a].color })), { id: 'unknown' as const, label: '?' }]}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Choice value={status} onChange={setStatus} options={(['alive', 'dead', 'missing', 'unknown'] as const).map((s) => ({ id: s, label: STATUS_INFO[s].label }))} />
          </div>
        </div>
      )}
      {error && <p className="text-sm text-blood-400">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="primary" icon="check" onClick={() => void submit()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <button
          onClick={() => void forget()}
          className={`no-drag ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${confirmForget ? 'bg-blood-500 text-parchment-50' : 'text-parchment-400 hover:text-blood-400'}`}
          title="Remove this from the DM's memory"
        >
          <Icon name="trash" size={15} />
          {confirmForget ? (person ? 'Forget them?' : 'Forget it?') : 'Forget'}
        </button>
      </div>
    </div>
  )
}

// ---- Story ------------------------------------------------------------------------------------

function StorySection({ view }: { view: CampaignView }) {
  const m = view.memory
  // Chapters with the scenes they were made from, then the scenes since the last chapter.
  const groups = useMemo(() => {
    const out: { chapter?: Summary; scenes: Summary[] }[] = []
    let i = 0
    for (const ch of m.chapters) {
      const start = m.scenes.findIndex((s) => s.from === ch.from)
      const end = m.scenes.findIndex((s) => s.to === ch.to)
      if (start >= i && end >= start) {
        out.push({ chapter: ch, scenes: m.scenes.slice(start, end + 1) })
        i = end + 1
      } else out.push({ chapter: ch, scenes: [] })
    }
    if (i < m.scenes.length) out.push({ scenes: m.scenes.slice(i) })
    return out
  }, [m.chapters, m.scenes])

  return (
    <>
      <Heading title="The Story" text="Older parts of your adventure, summarized in order. The DM reads these once the full text no longer fits." />
      {m.arc && <ArcCard text={m.arc} />}
      {!m.scenes.length && !m.chapters.length && (
        <Empty>
          Nothing summarized yet. While the story is short, the DM reads all of it word for word; summaries appear here as it grows.
        </Empty>
      )}
      <div className="space-y-5">
        {groups.map((g, i) =>
          g.chapter ? (
            <ChapterBlock key={g.chapter.to} chapter={g.chapter} scenes={g.scenes} number={i + 1} />
          ) : (
            <div key="loose" className="space-y-3">
              {groups.length > 1 && <div className="text-[0.68rem] font-semibold tracking-[0.14em] text-gold-400 uppercase">Since the last chapter</div>}
              {g.scenes.map((s) => (
                <SummaryCard key={s.to} summary={s} />
              ))}
            </div>
          )
        )}
      </div>
    </>
  )
}

const days = (s: Summary) => (s.fromDay === s.toDay ? `Day ${s.fromDay}` : `Days ${s.fromDay}–${s.toDay}`)

function ChapterBlock({ chapter, scenes, number }: { chapter: Summary; scenes: Summary[]; number: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-gold-500/20 bg-gradient-to-b from-gold-500/[0.06] to-transparent p-1">
      <SummaryCard summary={chapter} eyebrow={`Chapter ${number} · ${days(chapter)}`} bare />
      {scenes.length > 0 && (
        <div className="px-4 pb-3">
          <button onClick={() => setOpen(!open)} className="no-drag flex cursor-pointer items-center gap-1.5 text-xs text-parchment-400 hover:text-gold-200">
            <Icon name="chevron" size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            {open ? 'Hide' : 'Show'} its {scenes.length} scenes
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 space-y-2 overflow-hidden">
                {scenes.map((s) => (
                  <SummaryCard key={s.to} summary={s} small />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ summary: s, eyebrow, bare = false, small = false }: { summary: Summary; eyebrow?: string; bare?: boolean; small?: boolean }) {
  const { save, error } = useSave()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(s.title)
  const [text, setText] = useState(s.text)
  const submit = async () => {
    if (await save({ type: 'summary_edit', level: s.level, to: s.to, title, text })) setEditing(false)
  }
  return (
    <div className={`group relative ${bare ? 'p-4' : `rounded-xl border border-gold-500/15 bg-ink-850/80 ${small ? 'p-3' : 'p-4'}`}`}>
      <div className="mb-1 text-[0.68rem] font-semibold tracking-[0.14em] text-gold-400/90 uppercase">{eyebrow ?? days(s)}</div>
      {editing ? (
        <div className="space-y-2">
          <input value={title} onChange={(x) => setTitle(x.target.value)} maxLength={120} className="input py-2 font-display tracking-wide" />
          <textarea value={text} onChange={(x) => setText(x.target.value)} rows={6} className="input resize-y py-2 font-story text-[1.02rem] leading-relaxed" />
          {error && <p className="text-sm text-blood-400">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon="check" onClick={() => void submit()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={`pr-14 font-display tracking-wide text-parchment-50 ${small ? 'text-base' : 'text-lg'}`}>{s.title}</div>
          <p className={`mt-1 font-story leading-relaxed text-parchment-200 ${small ? 'text-[0.95rem]' : 'text-[1.02rem]'}`}>{s.text}</p>
          <button
            onClick={() => setEditing(true)}
            className="no-drag absolute top-3 right-3 flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-parchment-400 opacity-0 touch:opacity-100 transition group-hover:opacity-100 hover:bg-white/5 hover:text-gold-200 focus:opacity-100"
          >
            <Icon name="quill" size={14} /> Edit
          </button>
        </>
      )}
    </div>
  )
}

function ArcCard({ text: initial }: { text: string }) {
  const { save, error } = useSave()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(initial)
  return (
    <div className="group relative mb-6 rounded-xl border border-ember-400/30 bg-gradient-to-b from-ember-500/10 to-ink-850/60 p-5">
      <div className="mb-1.5 text-[0.68rem] font-semibold tracking-[0.14em] text-ember-400 uppercase">The story so far</div>
      {editing ? (
        <div className="space-y-2">
          <textarea value={text} onChange={(x) => setText(x.target.value)} rows={7} className="input resize-y py-2 font-story text-[1.05rem] leading-relaxed" />
          {error && <p className="text-sm text-blood-400">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon="check" onClick={() => void save({ type: 'arc', text }).then((ok) => ok && setEditing(false))}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="pr-14 font-story text-[1.08rem] leading-relaxed text-parchment-100">{initial}</p>
          <button
            onClick={() => {
              setText(initial)
              setEditing(true)
            }}
            className="no-drag absolute top-3 right-3 flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-parchment-400 opacity-0 touch:opacity-100 transition group-hover:opacity-100 hover:bg-white/5 hover:text-gold-200 focus:opacity-100"
          >
            <Icon name="quill" size={14} /> Edit
          </button>
        </>
      )}
    </div>
  )
}

// ---- Pinned notes -------------------------------------------------------------------------------

function NotesSection({ view }: { view: CampaignView }) {
  const { save, error } = useSave()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const add = async () => {
    const text = draft.trim()
    if (!text) return
    if (await save({ type: 'note', id: `note_${Date.now().toString(36)}`, text })) setDraft('')
  }
  return (
    <>
      <Heading title="Pinned" text="Things the DM must always keep true, however long the story gets. They stay even if you rewind." />
      <div className="mb-5 flex gap-2">
        <input
          value={draft}
          onChange={(x) => setDraft(x.target.value)}
          onKeyDown={(x) => x.key === 'Enter' && void add()}
          maxLength={500}
          placeholder='e.g. "Mira is secretly the baron’s daughter."'
          className="input py-2 text-sm"
        />
        <Button size="sm" variant="secondary" icon="pin" onClick={() => void add()} disabled={!draft.trim()}>
          Pin
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-blood-400">{error}</p>}
      {!view.memory.notes.length && <Empty>Nothing pinned yet.</Empty>}
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {view.memory.notes.map((n) => (
            <motion.li key={n.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="group flex items-start gap-3 rounded-xl border border-gold-500/15 bg-ink-850/80 px-4 py-3">
              <Icon name="pin" size={16} className="mt-0.5 shrink-0 text-gold-400" />
              {editing === n.id ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={(x) => setEditText(x.target.value)}
                  onKeyDown={(x) => {
                    if (x.key === 'Enter') void save({ type: 'note', id: n.id, text: editText }).then((ok) => ok && setEditing(null))
                    if (x.key === 'Escape') setEditing(null)
                  }}
                  onBlur={() => setEditing(null)}
                  className="input -my-1 flex-1 py-1 text-sm"
                />
              ) : (
                <button
                  onClick={() => {
                    setEditing(n.id)
                    setEditText(n.text)
                  }}
                  className="no-drag flex-1 cursor-text text-left text-[0.95rem] text-parchment-100"
                  title="Click to edit"
                >
                  {n.text}
                </button>
              )}
              <button onClick={() => void save({ type: 'note_remove', id: n.id })} className="no-drag cursor-pointer rounded p-1 text-parchment-500 opacity-0 touch:opacity-100 transition group-hover:opacity-100 hover:text-blood-400" title="Unpin">
                <Icon name="x" size={15} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </>
  )
}

// ---- Lorebooks in this adventure ---------------------------------------------------------------

function LoreSection({ view }: { view: CampaignView }) {
  const setLorebooks = useGame((x) => x.setLorebooks)
  const [open, setOpen] = useState(false)
  const ids = view.lorebooks.map((b) => b.id)
  return (
    <>
      <Heading title="Lore" text="Lorebooks this adventure uses. The DM is given an entry when the story mentions its keywords." />
      {!view.lorebooks.length && <Empty>No lorebooks in this adventure.</Empty>}
      <ul className="mb-5 space-y-2">
        {view.lorebooks.map((b) => (
          <li key={b.id} className="flex items-center gap-3 rounded-xl border border-gold-500/15 bg-ink-850/80 px-4 py-3">
            <Icon name="book" size={18} className="shrink-0 text-gold-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-parchment-100">{b.name}</span>
              <span className="text-xs text-parchment-500">
                {b.entries} entr{b.entries === 1 ? 'y' : 'ies'}
              </span>
            </span>
            <button onClick={() => void setLorebooks(ids.filter((x) => x !== b.id))} className="no-drag cursor-pointer rounded-lg px-2 py-1 text-xs text-parchment-400 hover:text-blood-400">
              Stop using
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" icon="scroll" onClick={() => setOpen(true)}>
        Open lorebooks
      </Button>
      <LoreEditor open={open} onClose={() => setOpen(false)} attached={ids} onToggleAttach={(id) => void setLorebooks(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])} />
    </>
  )
}
