import { Fragment, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'
import { CHANGELOG, changesSince, compareVersions, type Change } from '@shared/changelog'
import { api } from '../api'
import { Button } from './Button'
import { Icon } from './Icon'

/**
 * What's New (docs/spec/08-ui-ux.md#whats-new): after an update, what was added or changed since
 * this screen last showed the app (each screen keeps its own place, so the phone gets it too).
 * The title screen can open it again.
 */

const KEY = 'emberlight.seenVersion'
const read = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
const remember = (v: string) => {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    // Private window or blocked storage: it just shows again next time.
  }
}

export const useWhatsNew = create<{ shown: Change[] | null; open(changes?: Change[]): void; close(): void }>((set) => ({
  shown: null,
  open: (changes) => set({ shown: changes ?? CHANGELOG.filter((c) => compareVersions(c.version, __APP_VERSION__) <= 0).slice(0, 4) }),
  close: () => {
    remember(__APP_VERSION__)
    set({ shown: null })
  }
}))

/** "**Continue.** The Act button…" with the bold shown. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-semibold text-parchment-50">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  )
}

export function WhatsNew() {
  const { shown, open, close } = useWhatsNew()

  // Once per update. A screen meeting this for the first time: someone with adventures has just
  // updated (show this version's changes); a new player hasn't, so it stays quiet for them.
  useEffect(() => {
    const now = __APP_VERSION__
    const seen = read()
    if (seen && compareVersions(seen, now) >= 0) {
      // Seen already (or this screen went back to an older version).
      if (seen !== now) remember(now)
      return
    }
    if (seen) {
      const news = changesSince(seen, now)
      if (news.length) open(news)
      else remember(now)
      return
    }
    api
      .campaigns()
      .then((list) => {
        const mine = CHANGELOG.filter((c) => c.version === now)
        if (list.length && mine.length) open(mine)
        else remember(now)
      })
      .catch(() => undefined)
  }, [open])

  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown, close])

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/80 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            role="dialog"
            aria-label="What's New"
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="panel flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl"
          >
            <div className="flex items-center gap-3 border-b border-gold-500/15 px-5 py-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold-500/35 bg-ink-850 text-gold-300">
                <Icon name="sparkle" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-2xl tracking-wider text-gold-300">What's New</h2>
                <p className="text-xs text-parchment-400">Emberlight {__APP_VERSION__}</p>
              </div>
              <button onClick={close} className="no-drag cursor-pointer rounded-lg p-2 text-parchment-400 hover:bg-white/5 hover:text-gold-200" aria-label="Close">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {shown.map((c) => (
                <section key={c.version}>
                  <h3 className="font-display text-lg tracking-wide text-parchment-50">{c.title}</h3>
                  <p className="mb-2 text-[0.7rem] text-parchment-500">Version {c.version}</p>
                  <ul className="space-y-2">
                    {c.items.map((item, i) => (
                      <li key={i} className="flex gap-2.5 text-[0.9rem] leading-relaxed text-parchment-300">
                        <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400/80" />
                        <span>
                          <Rich text={item} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="flex justify-end border-t border-gold-500/15 px-5 py-3">
              <Button variant="primary" size="sm" onClick={close}>
                Done
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
