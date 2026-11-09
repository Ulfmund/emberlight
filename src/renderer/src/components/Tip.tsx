import { useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'

/** A short tooltip that appears after a moment on hover (or long-press on touch). */
export function Tip({ content, children, side = 'top', className = '' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'right' | 'left'; className?: string }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pos =
    side === 'top'
      ? 'bottom-full left-1/2 mb-2 -translate-x-1/2'
      : side === 'bottom'
        ? 'top-full left-1/2 mt-2 -translate-x-1/2'
        : side === 'right'
          ? 'left-full top-1/2 ml-2 -translate-y-1/2'
          : 'right-full top-1/2 mr-2 -translate-y-1/2'
  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => (timer.current = setTimeout(() => setOpen(true), 280))}
      onMouseLeave={() => {
        clearTimeout(timer.current)
        setOpen(false)
      }}
      onTouchStart={() => (timer.current = setTimeout(() => setOpen(true), 400))}
      onTouchEnd={() => {
        clearTimeout(timer.current)
        setTimeout(() => setOpen(false), 1500)
      }}
    >
      {children}
      <AnimatePresence>
        {open && content && (
          <motion.span
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className={`pointer-events-none absolute z-50 w-max max-w-72 rounded-lg border border-gold-500/30 bg-ink-900/95 px-3 py-2 text-left text-xs leading-relaxed text-parchment-100 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.9)] backdrop-blur ${pos}`}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
