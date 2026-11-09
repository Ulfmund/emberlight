import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { useEffectsLevel } from './prefs'

/**
 * Big moments (docs/spec/08-ui-ux.md#feel-and-animation-juice): the store announces them, and
 * the play screen shows them, as much as the Effects setting allows.
 */
type Fx = {
  levelUp: { level: number; at: number } | null
  /** When the last big hit landed (the screen jolts). */
  hitAt: number
  celebrate(level: number): void
  bigHit(): void
}

export const useFx = create<Fx>((set) => ({
  levelUp: null,
  hitAt: 0,
  celebrate: (level) => set({ levelUp: { level, at: Date.now() } }),
  bigHit: () => set({ hitAt: Date.now() })
}))

/** A pillar of light and the new level, for a character level-up. */
export function LevelUpPillar() {
  const levelUp = useFx((f) => f.levelUp)
  const effects = useEffectsLevel()
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    if (!levelUp || effects !== 'full') return
    setShown(levelUp.level)
    const t = setTimeout(() => setShown(null), 2400)
    return () => clearTimeout(t)
  }, [levelUp, effects])
  return (
    <AnimatePresence>
      {shown !== null && (
        <motion.div className="pointer-events-none absolute inset-0 z-50 grid place-items-center overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.6 } }}>
          <motion.div
            className="absolute inset-y-0 left-1/2 w-48 -translate-x-1/2 bg-gradient-to-b from-transparent via-gold-300/35 to-transparent blur-2xl"
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 bg-gradient-to-b from-transparent via-gold-200/80 to-transparent blur-sm"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.25 }}
            className="relative text-center"
          >
            <div className="font-display text-sm tracking-[0.5em] text-gold-300">LEVEL</div>
            <div className="font-display text-7xl font-bold text-gold-200 [text-shadow:0_0_40px_#ffb347,0_0_12px_#ffd27a]">{shown}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
