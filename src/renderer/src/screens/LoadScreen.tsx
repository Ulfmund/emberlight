import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { RaceId } from '@shared/rules'
import { useGame } from '../store'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { Medallion } from '../components/Medallion'
import { cardImageUrl } from '@shared/cards'
import { EmberField } from '../components/EmberField'

const RACE_BY_LABEL: Record<string, RaceId> = { Human: 'human', Dwarf: 'dwarf', Elf: 'elf', Halfling: 'halfling', Orc: 'orc' }

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`
  const d = Math.round(h / 24)
  return `${d} day${d > 1 ? 's' : ''} ago`
}

export function LoadScreen() {
  const { campaigns, loadCampaigns, open, remove, go } = useGame()
  const [confirm, setConfirm] = useState<string | null>(null)

  useEffect(() => {
    void loadCampaigns()
  }, [loadCampaigns])

  return (
    <div className="relative flex-1 overflow-y-auto">
      <EmberField density={0.3} className="opacity-50" />
      <div className="relative z-10 mx-auto max-w-4xl px-4 pt-5 pb-16 md:px-8 md:pt-8">
        <div className="mb-6 flex items-center gap-3 md:mb-8 md:gap-4">
          <Button variant="ghost" icon="back" size="sm" onClick={() => go('title')} aria-label="Back" className="shrink-0 px-2 md:px-3">
            <span className="hidden md:inline">Back</span>
          </Button>
          <div className="min-w-0">
            <h2 className="font-display text-2xl tracking-wider text-gold-300 md:text-3xl">Your Adventures</h2>
            <p className="mt-1 hidden text-parchment-400 sm:block">Every tale is saved as you play.</p>
          </div>
          <Button variant="primary" icon="d20" className="ml-auto shrink-0" onClick={() => go('creator')} aria-label="New adventure">
            <span className="hidden sm:inline">New adventure</span>
          </Button>
        </div>

        {campaigns.length === 0 && (
          <div className="panel rounded-2xl p-10 text-center text-parchment-400">
            <Icon name="scroll" size={36} className="mx-auto mb-3 text-gold-500" />
            No adventures yet. Start one, and it will appear here.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <AnimatePresence>
            {campaigns.map((c, i) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="panel group relative flex items-center gap-4 rounded-2xl p-4"
              >
                <Medallion name={c.characterName} race={RACE_BY_LABEL[c.race] ?? 'human'} size={60} dead={c.status === 'dead'} image={c.portraitId ? cardImageUrl(c.portraitId) : undefined} />
                <button onClick={() => void open(c.id)} className="no-drag min-w-0 flex-1 cursor-pointer text-left">
                  <div className="truncate font-display tracking-wide text-gold-200">{c.name}</div>
                  <div className="truncate text-sm text-parchment-200">
                    {c.characterName} · level {c.level} {c.race.toLowerCase()} {c.background.toLowerCase()}
                  </div>
                  <div className="truncate text-xs text-parchment-500">
                    {c.status === 'dead' ? 'Fallen' : `Day ${c.day}${c.location ? ` · ${c.location}` : ''}`} · played {ago(c.updatedAt)}
                  </div>
                </button>
                {confirm === c.id ? (
                  <div className="flex items-center gap-1">
                    <Button variant="danger" size="sm" onClick={() => void remove(c.id).then(() => setConfirm(null))}>
                      Delete forever
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <button onClick={() => setConfirm(c.id)} className="no-drag cursor-pointer rounded-md p-2 text-parchment-500 opacity-0 touch:opacity-100 transition group-hover:opacity-100 hover:text-blood-400" title="Delete this adventure">
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
