import { motion } from 'motion/react'
import { findPreset } from '@shared/presets'
import titleArt from '../assets/title.jpg'
import logo from '../assets/logo-die.png'
import { EmberField } from '../components/EmberField'
import { UpdateNotice } from '../components/UpdateNotice'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { useGame } from '../store'

const rise = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { delay: 0.25 + i * 0.12, duration: 0.8, ease: [0.2, 0.7, 0.2, 1] as const }
  })
}

export function TitleScreen() {
  const { settings, messages, go, newStory } = useGame()
  const conn = settings?.connection
  const connected = Boolean(conn?.model)
  const hasStory = messages.some((m) => m.role === 'assistant' && m.content)

  const begin = () => {
    if (!connected) return go('connect')
    newStory()
    go('play')
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Backdrop: the rendered die scene, slowly drifting */}
      <img
        src={titleArt}
        alt=""
        draggable={false}
        className="animate-ken-burns absolute inset-0 h-full w-full object-cover object-[70%_50%]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/80 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-ink-950/40" />
      <EmberField density={0.9} />

      <div className="relative z-10 flex h-full flex-col justify-center px-[7vw]">
        <motion.div initial="hidden" animate="show" className="max-w-xl">
          <motion.div custom={0} variants={rise} className="mb-6 flex items-center gap-4">
            <motion.img
              src={logo}
              alt=""
              draggable={false}
              className="h-20 w-20 drop-shadow-[0_0_24px_rgb(255_130_40/0.45)]"
              animate={{ y: [0, -6, 0], rotate: [0, 4, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="gilt-rule flex-1" />
          </motion.div>

          <motion.h1
            custom={1}
            variants={rise}
            className="gold-text font-display text-[clamp(3rem,7vw,5.6rem)] leading-none font-bold tracking-[0.08em]"
          >
            EMBERLIGHT
          </motion.h1>
          <motion.p custom={2} variants={rise} className="mt-4 font-story text-2xl text-parchment-200 italic">
            Tales told by firelight. The dice decide the rest.
          </motion.p>

          <motion.div custom={3} variants={rise} className="mt-12 flex flex-col items-start gap-3">
            {hasStory && (
              <Button variant="primary" size="lg" icon="scroll" onClick={() => go('play')} className="min-w-64">
                Continue
              </Button>
            )}
            <Button
              variant={hasStory ? 'secondary' : 'primary'}
              size="lg"
              icon="d20"
              onClick={begin}
              className="min-w-64"
            >
              {connected ? 'Begin a New Adventure' : 'Begin'}
            </Button>
            <Button variant="secondary" size="lg" icon="plug" onClick={() => go('connect')} className="min-w-64">
              Connect a Model
            </Button>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 1 }}
          className="absolute bottom-8 left-[7vw] flex items-center gap-2.5 rounded-full border border-gold-500/20 bg-ink-950/60 px-4 py-2 text-sm backdrop-blur"
        >
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-moss-400 shadow-[0_0_10px_var(--color-moss-400)]' : 'bg-ink-500'}`}
          />
          {connected && conn ? (
            <span className="text-parchment-200">
              <Icon name={findPreset(conn.presetId)?.icon ?? 'plug'} size={15} className="mr-1.5 inline -translate-y-px text-gold-300" />
              {findPreset(conn.presetId)?.label} · <span className="text-parchment-400">{conn.model}</span>
            </span>
          ) : (
            <span className="text-parchment-400">No model connected yet</span>
          )}
        </motion.div>

        <div className="absolute right-[5vw] bottom-8">
          <UpdateNotice />
        </div>
      </div>
    </div>
  )
}
