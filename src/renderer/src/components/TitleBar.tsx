import logo from '../assets/logo-die.png'
import { IN_APP, UpdateNotice } from './UpdateNotice'
import { Icon } from './Icon'
import { usePrefs } from '../prefs'

/** Every sound on or off at once (music, ambience, effects). */
function MuteButton() {
  const muted = usePrefs((p) => p.muted)
  const set = usePrefs((p) => p.set)
  return (
    <button
      onClick={() => set({ muted: !muted })}
      className={`no-drag grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md transition-colors hover:bg-white/5 touch:h-9 touch:w-9 ${muted ? 'text-blood-400' : 'text-parchment-400 hover:text-gold-200'}`}
      title={muted ? 'Sound is off: turn it on' : 'Turn all sound off'}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      aria-pressed={muted}
    >
      <Icon name={muted ? 'mute' : 'speaker'} size={16} />
    </button>
  )
}

/**
 * The 40px strip at the top of the desktop window. The page draws it; Windows draws the
 * minimise/maximise/close buttons on the right (titleBarOverlay), so we leave room for them.
 */
export function TitleBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className={`drag relative z-30 flex h-10 shrink-0 items-center gap-3 border-b border-gold-500/15 bg-ink-950/80 pl-3 backdrop-blur-md ${IN_APP ? 'pr-36' : 'pr-2 pt-[env(safe-area-inset-top)]'}`}>
      <img src={logo} alt="" className="h-6 w-6 drop-shadow-[0_0_6px_rgb(255_140_40/0.5)]" draggable={false} />
      <span className="font-display text-[0.8rem] tracking-[0.3em] text-parchment-300">EMBERLIGHT</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <MuteButton />
      <UpdateNotice compact />
    </div>
  )
}
