import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { BEDS, MOODS, type Track, type TrackTag } from '@shared/scene'
import { useTracks } from '../audio/mixer'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { isTouch } from '../prefs'

const LABEL: Record<TrackTag, string> = {
  explore: 'Exploring',
  town: 'Town',
  night: 'Night',
  tension: 'Tension',
  combat: 'Fights',
  sorrow: 'Sorrow',
  eerie: 'Eerie',
  wind: 'Wind',
  rain: 'Rain',
  storm: 'Storm',
  fire: 'Fire',
  crickets: 'Crickets',
  birds: 'Birds',
  river: 'River',
  sea: 'Sea',
  drips: 'Cave drips',
  tavern: 'Tavern',
  owl: 'Owls'
}

/**
 * Your own music and sounds (docs/spec/09-audio.md#track-library): add files, say what each is
 * for (a mood for music, a place sound for ambience), and they're played in place of the
 * built-in sound whenever the scene calls for them.
 */
export function AudioLibrary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tracks, load } = useTracks()
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(0)
  const [playing, setPlaying] = useState<string | null>(null)
  const player = useRef<HTMLAudioElement | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    void load()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && close.current()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      player.current?.pause()
      setPlaying(null)
    }
  }, [open, load])

  const add = async (files: FileList | File[]) => {
    setError('')
    const list = [...files]
    setAdding(list.length)
    for (const f of list) {
      try {
        const r = await fetch('/api/audio/import', { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(f.name) } })
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't add ${f.name}.`)
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`)
      }
      setAdding((n) => n - 1)
    }
    await load()
  }
  const change = async (t: Track, patch: Partial<Pick<Track, 'name' | 'kind' | 'tags' | 'volume'>>) => {
    await fetch(`/api/audio/${encodeURIComponent(t.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    await load()
  }
  const remove = async (t: Track) => {
    if (playing === t.id) player.current?.pause()
    await fetch(`/api/audio/${encodeURIComponent(t.id)}`, { method: 'DELETE' })
    await load()
  }
  const preview = (t: Track) => {
    player.current?.pause()
    if (playing === t.id) return setPlaying(null)
    const a = new Audio(`/api/audio/${encodeURIComponent(t.id)}/file`)
    a.volume = t.volume
    a.onended = () => setPlaying(null)
    void a.play()
    player.current = a
    setPlaying(t.id)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 backdrop-blur-sm md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-label="Your music and sounds"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return
              e.preventDefault()
              e.stopPropagation()
              void add(e.dataTransfer.files)
            }}
            className="panel flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-none md:h-auto md:max-h-[88vh] md:rounded-2xl"
          >
            <div className="flex items-center gap-3 border-b border-gold-500/15 px-5 py-4">
              <Icon name="music" size={20} className="text-gold-300" />
              <h3 className="flex-1 font-display text-xl tracking-wider text-gold-300">Your music and sounds</h3>
              <button onClick={onClose} className="no-drag cursor-pointer rounded-md p-1.5 text-parchment-400 hover:text-gold-200" aria-label="Close">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm text-parchment-400">
                Add your own tracks and say what each is for. Music plays for its mood (a fight, a town, the road at night…); ambience plays for its sound (rain, a tavern, the sea…), in place of the built-in one.{isTouch() ? '' : ' Drop files here, or:'}
              </p>
              <input ref={picker} type="file" multiple accept="audio/*,.mp3,.ogg,.wav,.flac,.m4a,.webm" className="hidden" onChange={(e) => e.target.files && void add(e.target.files).then(() => (e.target.value = ''))} />
              <div className="mt-3 flex items-center gap-3">
                <Button size="sm" variant="secondary" icon="upload" disabled={adding > 0} onClick={() => picker.current?.click()}>
                  {adding > 0 ? `Adding ${adding}…` : 'Add files'}
                </Button>
                {error && <span className="text-sm text-blood-400">{error}</span>}
              </div>
              {tracks.length === 0 && <p className="mt-8 text-center font-story text-lg text-parchment-400 italic">Nothing here yet. Until there is, the music and sounds are made on the spot.</p>}
              <div className="mt-4 space-y-2">
                {tracks.map((t) => {
                  const options = t.kind === 'music' ? MOODS : BEDS
                  return (
                    <div key={t.id} className="rounded-xl border border-gold-500/15 bg-ink-850/70 p-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => preview(t)} className="no-drag grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border border-gold-500/30 text-gold-300 hover:text-gold-200 touch:h-10 touch:w-10" aria-label={playing === t.id ? 'Stop' : 'Listen'}>
                          <Icon name={playing === t.id ? 'stop' : 'speaker'} size={14} />
                        </button>
                        <input defaultValue={t.name} onBlur={(e) => e.target.value.trim() !== t.name && void change(t, { name: e.target.value })} className="input min-w-0 flex-1 py-1 text-sm" aria-label="Name" />
                        <div className="w-32 shrink-0">
                          <select value={t.kind} onChange={(e) => void change(t, { kind: e.target.value as Track['kind'], tags: [] })} className="input py-1 text-sm" aria-label="Kind">
                            <option value="music">Music</option>
                            <option value="ambience">Ambience</option>
                          </select>
                        </div>
                        <button onClick={() => void remove(t)} className="no-drag cursor-pointer rounded-md p-1.5 text-parchment-500 hover:text-blood-400 touch:p-2.5" aria-label="Remove">
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {options.map((tag) => {
                          const on = t.tags.includes(tag)
                          return (
                            <button
                              key={tag}
                              onClick={() => void change(t, { tags: on ? t.tags.filter((x) => x !== tag) : [...t.tags, tag] })}
                              className={`no-drag cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors touch:px-3 touch:py-1.5 touch:text-sm ${on ? 'border-gold-400/70 bg-gold-500/20 text-gold-100' : 'border-white/10 text-parchment-400 hover:border-gold-500/40'}`}
                            >
                              {LABEL[tag]}
                            </button>
                          )
                        })}
                      </div>
                      <label className="mt-2 flex items-center gap-2 text-xs text-parchment-400">
                        Volume
                        <input type="range" min={0} max={1} step={0.05} defaultValue={t.volume} onPointerUp={(e) => void change(t, { volume: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => void change(t, { volume: Number((e.target as HTMLInputElement).value) })} className="w-40 accent-[var(--color-gold-400)]" />
                        {!t.tags.length && <span className="ml-auto text-ember-400">Pick at least one, or it won't play</span>}
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
