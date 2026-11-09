import logo from '../assets/logo-die.png'

/**
 * The 40px strip at the top of the desktop window. The page draws it; Windows draws the
 * minimise/maximise/close buttons on the right (titleBarOverlay), so we leave room for them.
 */
export function TitleBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="drag relative z-30 flex h-10 shrink-0 items-center gap-3 border-b border-gold-500/15 bg-ink-950/80 pr-36 pl-3 backdrop-blur-md">
      <img src={logo} alt="" className="h-6 w-6 drop-shadow-[0_0_6px_rgb(255_140_40/0.5)]" draggable={false} />
      <span className="font-display text-[0.8rem] tracking-[0.3em] text-parchment-300">EMBERLIGHT</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  )
}
