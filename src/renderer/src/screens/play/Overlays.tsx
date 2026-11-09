import { AnimatePresence, motion } from 'motion/react'
import type { CampaignView } from '@shared/view'
import { useGame } from '../../store'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/Button'
import { Medallion } from '../../components/Medallion'
import { playerPortrait } from '../../portraits'
import { yearsOld } from '@shared/family'

export function Toasts() {
  const { toasts, dismissToast } = useGame()
  const tone = {
    good: 'border-moss-400/40 text-moss-400',
    bad: 'border-blood-400/50 text-blood-400',
    level: 'border-gold-300/70 text-gold-200',
    info: 'border-gold-500/30 text-gold-300'
  }
  return (
    <div className="pointer-events-none absolute top-4 right-4 z-50 flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, x: 60, scale: t.tone === 'level' ? 0.6 : 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            onClick={() => dismissToast(t.id)}
            className={`no-drag pointer-events-auto flex cursor-pointer items-start gap-3 rounded-xl border bg-ink-900/95 px-4 py-3 text-left shadow-[0_10px_40px_-10px_rgb(0_0_0/0.9)] backdrop-blur ${tone[t.tone]}`}
            style={t.tone === 'level' ? { boxShadow: '0 0 40px -6px rgb(255 190 80 / 0.7)' } : undefined}
          >
            <Icon name={t.icon} size={t.tone === 'level' ? 26 : 18} className="mt-0.5 shrink-0" />
            <span>
              <span className={`block font-display tracking-wide ${t.tone === 'level' ? 'text-xl' : 'text-sm'}`}>{t.title}</span>
              {t.text && <span className="block text-xs text-parchment-300">{t.text}</span>}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** Shown when the character dies (docs/spec/03-characters-and-cards.md#when-a-character-dies). */
export function DeathScreen({ view }: { view: CampaignView }) {
  const { go, rewind, busy, startHeir } = useGame()
  const c = view.state.character
  if (c.status !== 'dead' || busy) return null
  // Rewind to just before the fatal turn: the DM message before the last player action.
  const msgs = view.messages
  let lastUser = -1
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user' && msgs[i].kind !== 'roll_response') { lastUser = i; break }
  const before = lastUser > 0 ? msgs[lastUser - 1] : null
  const cause = [...msgs].reverse().flatMap((m) => m.changes).find((ch) => ch.text.startsWith('Died'))?.text.replace(/^Died: /, '')
  // Their children in the story can take up the tale.
  const children = view.memory.entities.filter((e) => e.kind === 'person' && e.relation === 'child' && e.status !== 'dead')
  const before_ = view.state.fallen ?? []
  const heir = { campaignId: view.id, settings: view.settings, dead: view.build.name }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }} className="absolute inset-0 z-40 grid place-items-center bg-[radial-gradient(circle,rgb(11_8_9/0.75),rgb(0_0_0/0.96))] backdrop-grayscale">
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.8, duration: 1 }} className="flex max-w-md flex-col items-center text-center">
        <Medallion name={view.build.name} race={view.build.race} size={110} dead image={playerPortrait(view)} />
        <div className="mt-6 font-display text-sm tracking-[0.4em] text-blood-400">HERE LIES</div>
        <h2 className="mt-1 font-display text-4xl tracking-wider text-parchment-100">{view.build.name}</h2>
        <p className="mt-2 font-story text-lg text-parchment-400 italic">
          {cause ?? 'Fallen'} · level {c.level} · day {view.state.time.day}
          {c.deeds.length ? ` · remembered for having ${c.deeds[c.deeds.length - 1].text}` : ''}
        </p>
        {c.epitaph && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8, duration: 1.2 }} className="mt-5 max-w-sm font-story text-xl leading-relaxed text-parchment-200 italic">
            “{c.epitaph}”
          </motion.p>
        )}
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3 px-4">
          <Button variant="primary" icon="d20" onClick={() => startHeir(heir)}>
            A new adventurer in this world
          </Button>
          {children.map((ch) => (
            <Button key={ch.id} variant="secondary" icon="laurel" onClick={() => startHeir({ ...heir, child: { id: ch.id, name: ch.name }, race: view.build.race })}>
              Continue as {ch.name}, their child{yearsOld(ch, view.state.time.day) !== undefined ? ` (${yearsOld(ch, view.state.time.day)})` : ''}
            </Button>
          ))}
          {before && !view.settings.ironman && (
            <Button variant="secondary" icon="rewind" onClick={() => void rewind(before.id)}>
              Rewind before the fatal moment
            </Button>
          )}
          <Button variant="ghost" icon="back" onClick={() => go('title')}>
            Back to the menu
          </Button>
        </div>
        <p className="mt-6 max-w-sm px-4 text-xs leading-relaxed text-parchment-500">
          <Icon name="laurel" size={12} className="mr-1 inline -translate-y-px" />
          {view.build.name} will be remembered in the Hall of the Fallen{before_.length ? `, beside ${before_.map((f) => f.name).join(', ')}` : ''}. Whoever comes next finds the same world, its people and its history.
        </p>
      </motion.div>
    </motion.div>
  )
}
