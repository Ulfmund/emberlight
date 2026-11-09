import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Icon } from './Icon'

/**
 * A resource bar (health, stamina, mana, XP). When the value drops, a pale "ghost" of the old
 * value lingers and drains away, and the bar flashes; when it rises, it shimmers.
 */
export function Bar({
  value,
  max,
  color,
  icon,
  label,
  thin = false
}: {
  value: number
  max: number
  color: string
  icon?: string
  label?: string
  thin?: boolean
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const prev = useRef(value)
  const [ghost, setGhost] = useState(pct)
  const [flash, setFlash] = useState<'hit' | 'heal' | null>(null)

  useEffect(() => {
    const before = prev.current
    prev.current = value
    if (value < before) {
      setFlash('hit')
      const t = setTimeout(() => setGhost(pct), 450)
      const f = setTimeout(() => setFlash(null), 500)
      return () => {
        clearTimeout(t)
        clearTimeout(f)
      }
    }
    setGhost(pct)
    if (value > before) {
      setFlash('heal')
      const f = setTimeout(() => setFlash(null), 700)
      return () => clearTimeout(f)
    }
  }, [value, pct])

  return (
    <div className="w-full">
      {!thin && (
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-parchment-300">
            {icon && <Icon name={icon} size={14} style={{ color }} />}
            {label}
          </span>
          <span className="font-semibold text-parchment-100 tabular-nums">
            {Math.max(0, value)}
            <span className="text-parchment-500">/{max}</span>
          </span>
        </div>
      )}
      <motion.div
        animate={flash === 'hit' ? { x: [0, -3, 3, -2, 0] } : { x: 0 }}
        transition={{ duration: 0.35 }}
        className={`relative overflow-hidden rounded-full bg-ink-950/80 ring-1 ring-white/5 ${thin ? 'h-1.5' : 'h-2.5'}`}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-parchment-50/40 transition-[width] duration-700 ease-out" style={{ width: `${ghost}%` }} />
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          style={{
            background: `linear-gradient(180deg, color-mix(in oklab, ${color} 80%, white), ${color})`,
            boxShadow: `0 0 12px -2px ${color}`
          }}
        />
        {flash && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: flash === 'hit' ? 0.5 : 0.7 }}
            style={{ background: flash === 'hit' ? 'rgb(255 80 60 / 0.6)' : `linear-gradient(90deg, transparent, ${color}, transparent)` }}
          />
        )}
      </motion.div>
    </div>
  )
}
