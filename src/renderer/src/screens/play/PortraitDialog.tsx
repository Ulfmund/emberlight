import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { mediaUrl } from '@shared/images'
import { api } from '../../api'
import { useGame } from '../../store'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Medallion } from '../../components/Medallion'
import { playerPortrait } from '../../portraits'

/**
 * A picture (docs/spec/03-characters-and-cards.md#image-input, #image-generation): of the player
 * character, or of a person, a place or a group from the Journal. Upload one (the DM can put a
 * portrait into words for the story), make one with the image generator, or take it away.
 */
export function PortraitDialog({ open, onClose, entity }: { open: boolean; onClose: () => void; entity?: { id: string; name: string } }) {
  const view = useGame((s) => s.view)
  const [prompt, setPrompt] = useState('')
  const [ready, setReady] = useState(false)
  const [working, setWorking] = useState<'' | 'upload' | 'make' | 'describe'>('')
  const [error, setError] = useState('')
  const [said, setSaid] = useState<{ text: string; used: boolean } | null>(null)
  const [note, setNote] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const making = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open || !view) return
    setError('')
    setSaid(null)
    setNote('')
    api
      .imagePrompt(view.id, entity?.id)
      .then((r) => {
        setPrompt(r.prompt)
        setReady(r.ready)
      })
      .catch(() => setReady(false))
    return () => making.current?.abort()
  }, [open, view?.id, entity?.id])

  if (!view) return null
  const record = entity ? view.memory.entities.find((e) => e.id === entity.id) : undefined
  const current = entity ? (record?.image ? mediaUrl(record.image) : undefined) : playerPortrait(view)
  const place = record?.kind === 'place'
  const group = record?.kind === 'faction'
  const thing = record?.kind === 'item'
  const name = entity?.name ?? view.build.name
  const setView = (v: typeof view) => useGame.setState({ view: v })

  const upload = async (file: File | undefined) => {
    if (!file) return
    setWorking('upload')
    setError('')
    setSaid(null)
    try {
      const { id } = await api.uploadMedia(view.id, file, 'portrait')
      if (entity) setView(await api.entityImage(view.id, entity.id, id))
      else {
        setWorking('describe')
        const r = await api.setPortrait(view.id, id, true)
        setView(r.view)
        if (r.description) setSaid({ text: r.description, used: false })
        if (r.note) setNote(r.note)
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setWorking('')
  }

  const make = async () => {
    setWorking('make')
    setError('')
    const ctl = new AbortController()
    making.current = ctl
    try {
      const r = await api.generateImage(view.id, prompt, entity?.id, ctl.signal)
      setView(r.view)
    } catch (e) {
      if (!ctl.signal.aborted) setError((e as Error).message)
    }
    setWorking('')
  }

  const remove = async () => {
    setError('')
    try {
      setView(entity ? await api.entityImage(view.id, entity.id, null) : (await api.setPortrait(view.id, null)).view)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const useWords = async () => {
    if (!said) return
    try {
      setView(await api.setAppearance(view.id, said.text))
      setSaid({ ...said, used: true })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 p-0 backdrop-blur-sm md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-label={`Picture of ${name}`}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="panel flex h-full w-full max-w-lg flex-col overflow-y-auto rounded-none p-5 md:h-auto md:max-h-[90vh] md:rounded-2xl md:p-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl tracking-wider text-gold-300">Picture of {name}</h3>
              <button onClick={onClose} className="no-drag cursor-pointer rounded-md p-1.5 text-parchment-400 hover:text-gold-200" aria-label="Close">
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-4">
              {place ? (
                <div className="grid h-[110px] w-[165px] shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-gold-500/40 bg-ink-800">
                  {current ? <img src={current} alt="" className="h-full w-full object-cover" /> : <Icon name="map" size={34} className="text-gold-400/60" />}
                </div>
              ) : thing ? (
                <div className="grid h-[110px] w-[110px] shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-gold-500/40 bg-ink-800">
                  {current ? <img src={current} alt="" className="h-full w-full object-cover" /> : <Icon name="amulet" size={34} className="text-gold-400/60" />}
                </div>
              ) : (
                <Medallion name={name} race={entity ? 'human' : view.build.race} size={110} badge={false} image={current} />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void upload(e.target.files?.[0]).then(() => (e.target.value = ''))} />
                <Button variant="secondary" size="sm" icon="upload" disabled={Boolean(working)} onClick={() => picker.current?.click()} className="w-full">
                  {working === 'upload' ? 'Uploading…' : working === 'describe' ? 'The DM is looking…' : 'Use a picture of your own'}
                </Button>
                {current && (
                  <button onClick={() => void remove()} disabled={Boolean(working)} className="no-drag block w-full cursor-pointer text-center text-xs text-parchment-500 hover:text-blood-400">
                    Remove the picture
                  </button>
                )}
              </div>
            </div>
            {!entity && <p className="mt-3 text-xs text-parchment-500">With a model that can see pictures (Claude, or a local one with vision), the DM looks at yours and offers it as your character's description.</p>}

            {said && (
              <div className="mt-4 rounded-xl border border-gold-500/25 bg-ink-900/70 p-3">
                <div className="text-xs font-semibold tracking-[0.12em] text-gold-400 uppercase">The DM sees</div>
                <p className="mt-1 font-story text-[1.02rem] leading-relaxed text-parchment-100">{said.text}</p>
                <div className="mt-2 flex justify-end">
                  {said.used ? (
                    <span className="text-xs text-moss-400">Now your character's appearance.</span>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => void useWords()}>
                      Use as my appearance
                    </Button>
                  )}
                </div>
              </div>
            )}
            {note && <p className="mt-3 text-xs text-parchment-400">{note}</p>}

            <div className="mt-5 border-t border-gold-500/15 pt-4">
              <div className="text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Make one</div>
              {ready ? (
                <>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className="input mt-2 w-full resize-y text-sm" aria-label="What to paint" />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    {working === 'make' && (
                      <Button variant="ghost" size="sm" onClick={() => making.current?.abort()}>
                        Stop
                      </Button>
                    )}
                    <Button variant="primary" size="sm" icon="sparkle" disabled={Boolean(working) || prompt.trim().length < 3} onClick={() => void make()}>
                      {working === 'make' ? 'Painting… (this can take a minute)' : place ? 'Paint the place' : group ? 'Make their emblem' : thing ? 'Paint it' : 'Make a portrait'}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-parchment-400">
                  Set up an image generator (Stable Diffusion, ComfyUI, or an images API) under <span className="text-gold-300">Connect a Model</span>, and pictures can be made from what the story knows.
                </p>
              )}
            </div>
            {error && <p className="mt-3 text-sm text-blood-400">{error}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
