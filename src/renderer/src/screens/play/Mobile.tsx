import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { CampaignView } from '@shared/view'
import { Medallion } from '../../components/Medallion'
import { Bar } from '../../components/Bar'
import { Icon } from '../../components/Icon'
import { playerPortrait } from '../../portraits'
import { CharacterPanel } from './CharacterPanel'
import { SidePanel, type Tab } from './SidePanel'

/**
 * Phones (docs/spec/08-ui-ux.md#play-on-phone): the story takes the whole screen; a slim strip
 * on top shows health at a glance and opens the character and the Journal.
 */
export function MobileStatus({ view, onOpen, onJournal }: { view: CampaignView; onOpen: () => void; onJournal: () => void }) {
  const c = view.state.character
  const d = view.derived
  return (
    <div className="relative z-20 flex items-center gap-3 border-b border-gold-500/15 bg-ink-950/85 px-3 py-2 backdrop-blur md:hidden">
      <button onClick={onOpen} className="no-drag flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left" aria-label="Open your character">
        <Medallion name={c.build.name} race={c.build.race} size={38} dead={c.status === 'dead'} badge={false} image={playerPortrait(view)} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-display text-sm tracking-wide text-gold-200">{c.build.name}</span>
            <span className="shrink-0 text-[0.68rem] text-parchment-500">Lv {c.level}</span>
            {c.attrPoints > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ember-400 shadow-[0_0_6px_var(--color-ember-400)]" title="Points to spend" />}
          </span>
          <span className="mt-1 grid grid-cols-3 gap-1.5">
            <Bar value={c.hp} max={d.maxHp} color="#d9574c" thin />
            <Bar value={c.stamina} max={d.maxStamina} color="#8fbf73" thin />
            {d.maxMana > 0 ? <Bar value={c.mana} max={d.maxMana} color="#9fb3ff" thin /> : <span />}
          </span>
        </span>
      </button>
      {c.status !== 'alive' && <Icon name="skull" size={18} className="shrink-0 text-blood-400" />}
      <button onClick={onJournal} className="no-drag grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-gold-500/25 text-gold-300" aria-label="Journal">
        <Icon name="book" size={19} />
      </button>
      <button onClick={onOpen} className="no-drag grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-gold-500/25 text-gold-300" aria-label="Character, bag and saves">
        <Icon name="user" size={19} />
      </button>
    </div>
  )
}

export function MobileDrawer({
  view,
  open,
  onClose,
  tab,
  setTab,
  onJournal
}: {
  view: CampaignView
  open: boolean
  onClose: () => void
  tab: Tab
  setTab: (t: Tab) => void
  onJournal: () => void
}) {
  const [part, setPart] = useState<'you' | 'more'>('you')
  // Back to "you" each time it opens.
  useEffect(() => {
    if (open) setPart('you')
  }, [open])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-40 flex flex-col bg-ink-950 md:hidden"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        >
          <div className="flex items-center gap-2 border-b border-gold-500/15 px-3 py-2">
            <div className="flex flex-1 gap-1 rounded-xl border border-gold-500/20 bg-ink-900/80 p-1">
              {(
                [
                  { id: 'you', label: 'Character' },
                  { id: 'more', label: 'Sheet, bag & saves' }
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPart(p.id)}
                  className={`no-drag relative flex-1 cursor-pointer rounded-lg py-1.5 text-sm transition-colors ${part === p.id ? 'text-ink-950' : 'text-parchment-300'}`}
                >
                  {part === p.id && <motion.span layoutId="mobile-part" className="absolute inset-0 rounded-lg bg-gradient-to-b from-gold-300 to-gold-500" />}
                  <span className="relative font-medium">{p.label}</span>
                </button>
              ))}
            </div>
            <button onClick={onClose} className="no-drag grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-parchment-300" aria-label="Close">
              <Icon name="x" size={20} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1">
            {part === 'you' ? (
              <CharacterPanel
                view={view}
                className="w-full"
                onOpenSheet={() => {
                  setTab('sheet')
                  setPart('more')
                }}
                onOpenJournal={onJournal}
              />
            ) : (
              <SidePanel view={view} tab={tab} setTab={setTab} className="w-full" />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
