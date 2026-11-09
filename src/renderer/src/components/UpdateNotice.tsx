import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { UpdateStatus } from '@shared/types'
import { create } from 'zustand'
import { api } from '../api'
import { Icon } from './Icon'

/** One shared poller for update status, used by every UpdateNotice on screen. */
const useUpdates = create<{ status: UpdateStatus; set(s: UpdateStatus): void }>((set) => ({
  status: { state: 'disabled' },
  set: (status) => set({ status })
}))

let polling = false
let timer: ReturnType<typeof setTimeout> | undefined

async function tick() {
  clearTimeout(timer)
  let next = 60_000
  try {
    const s = await api.updateStatus()
    useUpdates.getState().set(s)
    if (s.state === 'disabled') return // development build: nothing to do
    if (s.state === 'checking' || s.state === 'downloading' || s.state === 'idle') next = 800
  } catch {
    next = 5000
  }
  timer = setTimeout(tick, next)
}

function startPolling() {
  if (polling) return
  polling = true
  void tick()
}

/** Check again right away (after a click), instead of waiting for the next slow poll. */
const pollNow = () => void tick()

/**
 * "Update available" → "Downloading 42%" → "Restart to update". Hidden when there's nothing to say.
 * `compact` is the title-bar pill; the full version is the card on the title screen.
 */
export function UpdateNotice({ compact = false }: { compact?: boolean }) {
  const status = useUpdates((s) => s.status)
  const [restarting, setRestarting] = useState(false)

  useEffect(startPolling, [])

  const visible = ['available', 'downloading', 'ready', 'error'].includes(status.state)
  const version = 'version' in status ? status.version : undefined

  const onClick = async () => {
    if (status.state === 'available' || status.state === 'error') {
      useUpdates.getState().set(await api.downloadUpdate())
      pollNow()
    } else if (status.state === 'ready') {
      setRestarting(true)
      await api.installUpdate()
    }
  }

  const label = restarting
    ? 'Restarting…'
    : status.state === 'available'
      ? compact
        ? `Update to ${version}`
        : `Version ${version} is ready to download`
      : status.state === 'downloading'
        ? status.percent > 0
          ? `Downloading… ${status.percent}%`
          : 'Downloading…'
        : status.state === 'ready'
          ? 'Restart to update'
          : status.state === 'error'
            ? 'Update failed. Try again'
            : ''

  const busy = status.state === 'downloading' || restarting
  const percent = status.state === 'downloading' ? status.percent : status.state === 'ready' ? 100 : 0

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="update"
          initial={{ opacity: 0, y: compact ? -6 : 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          whileHover={busy ? undefined : { y: -1 }}
          whileTap={busy ? undefined : { scale: 0.96 }}
          onClick={() => void onClick()}
          disabled={busy}
          title={status.state === 'ready' ? `Close and reopen Emberlight on version ${version}` : undefined}
          className={`no-drag focus-ring relative cursor-pointer overflow-hidden border text-left disabled:cursor-default ${
            status.state === 'error'
              ? 'border-blood-400/50 bg-blood-500/15 text-parchment-100'
              : 'border-gold-300/60 bg-gradient-to-b from-gold-500/25 to-ink-900/90 text-gold-200'
          } ${
            compact
              ? 'flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold'
              : 'flex w-80 items-center gap-3 rounded-xl px-4 py-3 backdrop-blur'
          }`}
          style={{ boxShadow: status.state === 'error' ? undefined : '0 0 24px -6px rgb(255 160 60 / 0.7)' }}
        >
          {/* progress fill */}
          {percent > 0 && (
            <motion.span
              className="absolute inset-y-0 left-0 bg-gold-400/20"
              initial={false}
              animate={{ width: `${percent}%` }}
              transition={{ ease: 'easeOut' }}
            />
          )}
          {/* a slow glint so it catches the eye */}
          {status.state !== 'error' && !busy && (
            <motion.span
              className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-gold-200/25 to-transparent"
              initial={{ left: '-40%' }}
              animate={{ left: '140%' }}
              transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 2.5, ease: 'easeInOut' }}
            />
          )}
          <span
            className={`relative grid shrink-0 place-items-center rounded-full ${
              compact ? 'h-4 w-4' : 'h-9 w-9 border border-gold-300/50 bg-gold-400/15'
            } ${status.state === 'error' ? 'text-blood-400' : 'text-gold-200'}`}
          >
            <Icon name={status.state === 'ready' ? 'reroll' : status.state === 'error' ? 'warn' : 'star'} size={compact ? 14 : 18} />
          </span>
          <span className="relative min-w-0">
            {!compact && (
              <span className="block font-display text-[0.72rem] tracking-[0.18em] text-gold-300">
                {status.state === 'ready' ? 'UPDATE DOWNLOADED' : 'UPDATE AVAILABLE'}
              </span>
            )}
            <span className={compact ? '' : 'block text-sm text-parchment-100'}>{label}</span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
