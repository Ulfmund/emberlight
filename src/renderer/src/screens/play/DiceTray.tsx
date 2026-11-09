import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { DIFFICULTY_LABEL, SKILLS, TIER_INFO, type CheckResult } from '@shared/rules'
import logo from '../../assets/logo-die.png'
import { useGame } from '../../store'
import { TIER_STYLE } from './Story'

type Phase = 'ready' | 'rolling' | 'result'

/**
 * The dice tray. The result is already decided by the engine; throwing is the player's moment.
 * Click (or press Space) to throw, watch it tumble, then the number and the result stamp land.
 */
export function DiceTray() {
  const dice = useGame((s) => s.live.dice)
  const diceDone = useGame((s) => s.diceDone)
  const check = dice[0]
  return (
    <AnimatePresence>
      {check && (
        <motion.div
          key="tray"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          className="absolute inset-0 z-40 grid place-items-center bg-ink-950/75 backdrop-blur-sm"
        >
          <Throw key={check.id} check={check} onDone={diceDone} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Throw({ check, onDone }: { check: CheckResult; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('ready')
  const [face, setFace] = useState<number | null>(null)
  const [scope, animate] = useAnimate()
  const done = useRef(false)
  const t = TIER_STYLE[check.tier]
  const info = TIER_INFO[check.tier]

  const finish = () => {
    if (done.current) return
    done.current = true
    onDone()
  }

  const toss = async () => {
    if (phase !== 'ready') return
    setPhase('rolling')
    const flicker = setInterval(() => setFace(1 + Math.floor(Math.random() * 20)), 70)
    const spins = 3 + Math.random() * 2
    await animate(
      scope.current,
      {
        rotate: [0, 360 * spins * 0.6, 360 * spins],
        y: [0, -140, 0, -30, 0],
        x: [0, 40 - Math.random() * 80, 0],
        scale: [1, 0.8, 1.08, 0.97, 1]
      },
      { duration: 1.25, ease: 'easeOut' }
    )
    clearInterval(flicker)
    setFace(check.kept)
    setPhase('result')
  }

  // Space or Enter throws; after the result, any key or a short wait continues.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (phase === 'ready') void toss()
        else if (phase === 'result') finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  useEffect(() => {
    if (phase !== 'result') return
    const id = setTimeout(finish, 2600)
    return () => clearTimeout(id)
  })

  return (
    <div className="flex flex-col items-center text-center" onClick={() => (phase === 'ready' ? void toss() : phase === 'result' ? finish() : undefined)}>
      <div className="mb-6">
        <div className="font-display text-sm tracking-[0.3em] text-gold-400">{SKILLS[check.skill].label.toUpperCase()}</div>
        <div className="mt-1 font-story text-lg text-parchment-300 italic">
          {check.hidden ? 'Something is happening…' : `${check.reason} · ${DIFFICULTY_LABEL[check.difficulty]}`}
        </div>
      </div>

      <div className="relative h-56 w-56 cursor-pointer">
        {/* glow under the die */}
        <motion.div
          className="absolute inset-6 rounded-full blur-2xl"
          animate={{ opacity: phase === 'result' ? 0.9 : [0.3, 0.6, 0.3], background: phase === 'result' ? t.color : '#ff7a2f' }}
          transition={{ opacity: phase === 'result' ? { duration: 0.3 } : { duration: 1.8, repeat: Infinity } }}
        />
        <div ref={scope} className="absolute inset-0">
          <motion.img
            src={logo}
            alt=""
            draggable={false}
            className="h-full w-full select-none"
            // Once the result lands, the die steps back so the number reads clearly.
            animate={phase === 'ready' ? { y: [0, -8, 0], rotate: [0, 6, 0] } : phase === 'result' ? { opacity: 0.22, scale: 0.92, filter: 'blur(1.5px)' } : {}}
            transition={{ duration: 2.2, repeat: phase === 'ready' ? Infinity : 0, ease: 'easeInOut' }}
          />
        </div>
        {face !== null && (
          <motion.div
            key={phase === 'result' ? 'final' : 'flicker'}
            initial={phase === 'result' ? { scale: 2.2, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <span
              className="font-display text-7xl font-bold"
              style={{ color: phase === 'result' ? t.color : '#fbe5a8', textShadow: `0 0 30px ${phase === 'result' ? t.color : '#ff7a2f'}, 0 4px 0 #0b0809` }}
            >
              {face}
            </span>
          </motion.div>
        )}
        {phase === 'result' && check.kept === 20 && <Burst color="#f5d27a" />}
        {phase === 'result' && check.kept === 1 && <Crack />}
      </div>

      <div className="mt-6 h-24">
        {phase === 'ready' && (
          <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.6, repeat: Infinity }} className="font-display tracking-[0.25em] text-gold-200">
            CLICK TO THROW
          </motion.div>
        )}
        {phase === 'result' && (
          <motion.div initial={{ scale: 1.8, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.15 }}>
            <div className="inline-block rounded-lg border-2 px-5 py-1.5 font-display text-2xl tracking-wider" style={{ color: t.color, borderColor: t.color, boxShadow: t.glow }}>
              {info.label.toUpperCase()}
            </div>
            <div className="mt-2 text-sm text-parchment-400">
              {check.kept} {check.bonus >= 0 ? '+' : '−'} {Math.abs(check.bonus)} = {check.total}
              {!check.hidden && ` vs ${check.dc}`}
              {check.damage > 0 && <span className="ml-2 text-blood-400">−{check.damage} health</span>}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

/** Golden sparks for a natural 20. */
function Burst({ color }: { color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2
        const r = 120 + Math.random() * 40
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 h-2 w-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 10px ${color}` }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r, opacity: 0, scale: 0.3 }}
            transition={{ duration: 0.9 + Math.random() * 0.4, ease: 'easeOut' }}
          />
        )
      })}
    </div>
  )
}

/** A dull crack across the die for a natural 1. */
function Crack() {
  return (
    <motion.svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0" initial={{ pathLength: 0, opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.path
        d="M30 18 L44 40 L38 52 L55 66 L50 82"
        fill="none"
        stroke="#ff5a4a"
        strokeWidth="2.2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35 }}
        style={{ filter: 'drop-shadow(0 0 4px #ff3020)' }}
      />
    </motion.svg>
  )
}
