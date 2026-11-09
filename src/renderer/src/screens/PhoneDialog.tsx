import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import QRCode from 'qrcode'
import type { RemoteView } from '@shared/types'
import { api } from '../api'
import { Icon } from '../components/Icon'

/**
 * Play on Phone (docs/spec/08-ui-ux.md#play-on-phone), shown only on the computer running
 * Emberlight. The phone opens the same adventures through this computer.
 */
export function PhoneDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [view, setView] = useState<RemoteView | null>(null)
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    if (!open) return
    api.remote().then(setView).catch((e: Error) => setError(e.message))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const url = view?.wifi.urls[0]
  useEffect(() => {
    if (!url) return setQr('')
    QRCode.toDataURL(url, { margin: 1, width: 440, color: { dark: '#120d10', light: '#f3e6c8' } }).then(setQr, () => setQr(''))
  }, [url])

  const change = async (patch: { wifi?: boolean; link?: boolean }) => {
    setBusy(true)
    setError('')
    try {
      setView(await api.setRemote(patch))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }
  const reset = async () => {
    if (!confirmReset) return setConfirmReset(true)
    setConfirmReset(false)
    setView(await api.newRemoteKey())
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            role="dialog"
            aria-label="Play on your phone"
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            className="panel relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6"
          >
            <button onClick={onClose} className="no-drag absolute top-3 right-3 cursor-pointer rounded-lg p-2 text-parchment-400 hover:bg-white/5 hover:text-gold-200" aria-label="Close">
              <Icon name="x" size={20} />
            </button>
            <div className="mb-5 flex items-center gap-3">
              <Icon name="phone" size={28} className="text-gold-300" />
              <div>
                <h2 className="font-display text-2xl tracking-wider text-gold-300">Play on Your Phone</h2>
                <p className="text-sm text-parchment-400">Same adventures, same saves, on the sofa. Emberlight stays open here and does the work.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-500/20 bg-ink-900/60 px-4 py-3">
              <div>
                <div className="font-display tracking-wide text-parchment-50">Allow phones on this Wi-Fi</div>
                <div className="text-xs text-parchment-500">The phone must be on the same Wi-Fi as this computer.</div>
              </div>
              <Toggle on={Boolean(view?.wifi.on)} disabled={busy || !view} onChange={(v) => void change({ wifi: v })} />
            </div>

            {view?.wifi.on && (
              <div className="mt-5 grid gap-5 md:grid-cols-[13rem_1fr] md:items-center">
                <div className="mx-auto grid h-52 w-52 place-items-center overflow-hidden rounded-xl bg-parchment-100 p-1 shadow-[0_0_40px_-10px_rgb(255_160_60/0.6)]">
                  {qr ? <img src={qr} alt="QR code to open Emberlight on your phone" className="h-full w-full" /> : <span className="text-sm text-ink-800">{view.wifi.running ? 'No Wi-Fi address found' : 'Starting…'}</span>}
                </div>
                <div className="space-y-3 text-sm text-parchment-300">
                  <ol className="list-decimal space-y-1.5 pl-5">
                    <li>Open the phone's camera and point it at the code.</li>
                    <li>Tap the link that appears. Emberlight opens in the phone's browser.</li>
                    <li>
                      Optional: use the browser's <span className="text-gold-200">Add to Home Screen</span> to get an app icon.
                    </li>
                  </ol>
                  {url && (
                    <p className="text-xs text-parchment-500">
                      Or type this into the phone's browser (it's private: it lets that phone in):
                      <br />
                      <span className="break-all text-parchment-300 select-all">{url}</span>
                    </p>
                  )}
                  <p className="rounded-lg border border-ember-500/25 bg-ember-500/10 px-3 py-2 text-xs text-parchment-300">
                    If Windows asks whether Emberlight may use the network, choose <b>Allow</b> (private networks). If the phone can't connect, make sure it's on the home Wi-Fi, not mobile data.
                  </p>
                </div>
              </div>
            )}

            {error || view?.error ? <p className="mt-4 text-sm text-blood-400">{error || view?.error}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gold-500/15 pt-4">
              <button
                onClick={() => void reset()}
                className={`no-drag flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${confirmReset ? 'bg-blood-500 text-parchment-50' : 'text-parchment-400 hover:text-blood-400'}`}
              >
                <Icon name="lock" size={15} />
                {confirmReset ? 'Disconnect every phone? They will need the new code.' : 'Disconnect all phones'}
              </button>
              <button onClick={() => setAdvanced(!advanced)} className="no-drag ml-auto flex cursor-pointer items-center gap-1 text-xs text-parchment-500 hover:text-gold-200">
                Advanced <Icon name="chevron" size={13} className={advanced ? 'rotate-180' : ''} />
              </button>
            </div>

            {advanced && view && (
              <div className="mt-4 space-y-3 rounded-xl border border-gold-500/15 bg-ink-900/50 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display tracking-wide text-parchment-50">Link for a tunnel</div>
                    <div className="text-xs text-parchment-500">For playing away from home through a tunnel you run yourself (Cloudflare Tunnel, Tailscale Serve…).</div>
                  </div>
                  <Toggle on={view.link.on} disabled={busy} onChange={(v) => void change({ link: v })} />
                </div>
                {view.link.running && (
                  <p className="text-xs leading-relaxed text-parchment-300">
                    Point the tunnel at <span className="text-gold-200 select-all">http://127.0.0.1:{view.link.port}</span>, then open the tunnel's address followed by{' '}
                    <span className="break-all text-gold-200 select-all">{view.link.path}</span> on the phone once. Anyone with that full link can play on your model, so keep it private; "Disconnect all phones" makes it stop working.
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`no-drag relative h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors disabled:opacity-50 ${on ? 'border-gold-300 bg-gold-400/80' : 'border-gold-500/30 bg-ink-800'}`}
    >
      <motion.span layout className={`absolute top-0.5 h-5.5 w-5.5 rounded-full shadow ${on ? 'right-0.5 bg-ink-950' : 'left-0.5 bg-parchment-300'}`} />
    </button>
  )
}
