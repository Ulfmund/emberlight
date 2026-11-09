import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Brief } from '@shared/view'
import { useGame } from '../../store'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'

/** At most this many messages of each version are shown (the newest). */
const SHOWN = 4

function Version({ title, list }: { title: string; list: Brief[] }) {
  const shown = list.slice(-SHOWN)
  return (
    <div className="rounded-xl border border-gold-500/15 bg-ink-850/70 p-3">
      <div className="mb-1.5 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">{title}</div>
      {list.length > SHOWN && <p className="mb-1 text-xs text-parchment-500">…and {list.length - SHOWN} earlier</p>}
      {shown.length ? (
        <ul className="space-y-1.5">
          {shown.map((m, i) => (
            <li key={i} className={`text-sm ${m.role === 'user' ? 'text-gold-200' : 'font-story text-parchment-200'}`}>
              <span className="mr-1.5 text-[0.68rem] tracking-wide text-parchment-500 uppercase">{m.role === 'user' ? 'You' : 'DM'}</span>
              {m.text || '…'}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-parchment-500">Nothing after the point both share.</p>
      )}
    </div>
  )
}

/**
 * The story split between screens (docs/spec/08-ui-ux.md#one-adventure-several-screens): this one
 * shows a version the story no longer has. Show both after the point they share, and let the
 * player take the latest or keep this screen's. Either way the other stays as a branch.
 */
export function ReconcileDialog() {
  const conflict = useGame((s) => s.conflict)
  const resolve = useGame((s) => s.resolveConflict)
  return createPortal(
    <AnimatePresence>
      {conflict && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 backdrop-blur-sm md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div role="dialog" aria-label="The story changed" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} className="panel flex h-full w-full max-w-lg flex-col overflow-hidden rounded-none md:h-auto md:max-h-[88vh] md:rounded-2xl">
            <div className="flex items-center gap-3 border-b border-gold-500/15 px-5 py-4">
              <Icon name="rewind" size={20} className="text-gold-300" />
              <h3 className="flex-1 font-display text-xl tracking-wider text-gold-300">The story changed</h3>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <p className="text-sm text-parchment-400">It was changed on another screen. Pick the version to keep; the other stays as a branch you can rewind to.</p>
              <Version title="Latest" list={conflict.ahead} />
              <Version title="This screen" list={conflict.behind} />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gold-500/15 px-5 py-3">
              <Button variant="secondary" onClick={() => void resolve('mine')}>
                Keep this screen's
              </Button>
              <Button variant="primary" onClick={() => void resolve('latest')}>
                Show the latest
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
