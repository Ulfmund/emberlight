import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { RenameDialog } from './RenameDialog'
import { PortraitDialog } from './PortraitDialog'
import { AGES, ageYears, BACKGROUNDS, CONDITIONS, dateLabel, RACES, SEXES } from '@shared/rules'
import type { CampaignView } from '@shared/view'
import { Medallion } from '../../components/Medallion'
import { cardImageUrl } from '@shared/cards'
import { playerPortrait } from '../../portraits'
import { Bar } from '../../components/Bar'
import { Icon } from '../../components/Icon'
import { Tip } from '../../components/Tip'
import { PartyStrip } from './Party'
import { samePlace } from '@shared/memory'
import { mediaUrl } from '@shared/images'

export function formatCoins(copper: number) {
  const g = Math.floor(copper / 100)
  const s = Math.floor((copper % 100) / 10)
  const c = copper % 10
  return { g, s, c }
}

export function timeLabel(minute: number) {
  const h = Math.floor(minute / 60)
  const part = h < 5 ? 'Night' : h < 8 ? 'Dawn' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 20 ? 'Evening' : 'Night'
  return { part, icon: h < 6 || h >= 20 ? 'moon' : 'sparkle' }
}

function journalLine(v: CampaignView) {
  const people = v.memory.entities.filter((e) => e.kind === 'person').length
  const places = v.memory.entities.filter((e) => e.kind === 'place').length
  if (!people && !places) return 'People and places you meet'
  return `${people} ${people === 1 ? 'person' : 'people'} · ${places} ${places === 1 ? 'place' : 'places'}`
}

/** Hunger, tiredness and load, when they're worth mentioning. */
function bodyChips(view: CampaignView): { label: string; text: string; icon: string; bad: boolean }[] {
  const out: { label: string; text: string; icon: string; bad: boolean }[] = []
  const n = view.derived.needs
  if (view.settings.survival || view.state.character.conditions.includes('hungry')) {
    if (n.hunger !== 'fed')
      out.push({
        label: n.hunger === 'peckish' ? 'Peckish' : n.hunger === 'hungry' ? 'Hungry' : 'Starving',
        text: n.hunger === 'peckish' ? `Last proper meal ${n.hoursSinceMeal} hours ago.` : n.hunger === 'hungry' ? '−1 to physical checks until you eat.' : '−2 to all checks, and sleep heals nothing until you eat.',
        icon: 'bread',
        bad: n.hunger !== 'peckish'
      })
  }
  if (n.exhaustion) out.push({ label: n.exhaustion > 1 ? `Exhausted ${n.exhaustion}` : 'Exhausted', text: `−${n.exhaustion} to all checks. Awake ${n.hoursAwake} hours: sleep removes it.`, icon: 'moon', bad: true })
  else if (view.settings.survival && n.hoursAwake >= 14) out.push({ label: 'Tired', text: `Awake ${n.hoursAwake} hours. Exhaustion sets in at 18.`, icon: 'moon', bad: false })
  if (view.derived.load !== 'none') out.push({ label: view.derived.load === 'overloaded' ? 'Overloaded' : 'Encumbered', text: `Carrying ${view.derived.carried} of ${view.derived.capacity} kg: disadvantage on agility checks.`, icon: 'bag', bad: true })
  return out
}

export function CharacterPanel({
  view,
  onOpenSheet,
  onOpenJournal,
  onSkip,
  canSkip = false,
  className = 'w-72 border-r border-gold-500/15 bg-ink-950/70 backdrop-blur'
}: {
  view: CampaignView
  onOpenSheet: () => void
  onOpenJournal: () => void
  /** Opens the Timeskip dialog (a long time-skip). */
  onSkip?: () => void
  canSkip?: boolean
  className?: string
}) {
  const [renaming, setRenaming] = useState(false)
  const [picturing, setPicturing] = useState(false)
  const c = view.state.character
  const b = view.build
  const d = view.derived
  const coins = formatCoins(c.coins)
  const t = timeLabel(view.state.time.minute)
  const here = view.state.location ? view.memory.entities.find((e) => e.kind === 'place' && e.image && [e.name, ...e.aliases].some((n) => samePlace(n, view.state.location!))) : undefined

  return (
    <aside className={`relative z-10 flex shrink-0 flex-col gap-5 overflow-y-auto p-5 ${className}`}>
      <div className="flex flex-col items-center text-center">
        <button onClick={() => setPicturing(true)} className="no-drag group/portrait relative cursor-pointer rounded-full" title="Change your character's picture" aria-label="Change your character's picture">
          <Medallion name={b.name} race={b.race} size={92} dead={c.status === 'dead'} image={playerPortrait(view)} />
          <span className="absolute -right-1 -bottom-1 grid h-7 w-7 place-items-center rounded-full border border-gold-500/40 bg-ink-900 text-gold-300 opacity-0 transition group-hover/portrait:opacity-100 touch:opacity-100">
            <Icon name="upload" size={13} />
          </span>
        </button>
        <PortraitDialog open={picturing} onClose={() => setPicturing(false)} />
        <div className="group mt-3 flex items-center justify-center gap-1.5">
          <span className="font-display text-lg tracking-wide text-gold-200">{b.name}</span>
          <button onClick={() => setRenaming(true)} className="no-drag cursor-pointer rounded p-1 text-parchment-500 opacity-0 transition group-hover:opacity-100 touch:opacity-100 hover:text-gold-200" title="Rename your character" aria-label="Rename your character">
            <Icon name="quill" size={14} />
          </button>
        </div>
        <RenameDialog open={renaming} onClose={() => setRenaming(false)} from={b.name} target={{ kind: 'player' }} />
        <div className="text-xs text-parchment-400">
          {RACES[b.race].label} · {SEXES[view.settings.sexModifiers][b.sex].label} · {AGES[b.age].label}, {ageYears(view.state)}
        </div>
        <div className="text-xs text-gold-300/80">{b.job?.trim() || BACKGROUNDS[b.background].label}</div>
        <motion.div key={c.level} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-2 rounded-full border border-gold-400/50 bg-gold-500/15 px-3 py-0.5 font-display text-sm text-gold-200">
          Level {c.level}
        </motion.div>
      </div>

      <AnimatePresence>
        {c.status !== 'alive' && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-lg border border-blood-400/50 bg-blood-500/15 px-3 py-2 text-center text-sm text-parchment-50">
            <Icon name="skull" size={16} className="mr-1.5 inline -translate-y-px text-blood-400" />
            {c.status === 'dead' ? 'Dead' : `Downed · death rolls ${c.deathRolls.success}✓ ${c.deathRolls.fail}✗`}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        onClick={onOpenJournal}
        className="no-drag focus-ring flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gold-500/25 bg-ink-900/80 px-3 py-2.5 text-left hover:border-gold-400/60"
      >
        <Icon name="book" size={22} className="shrink-0 text-gold-300" />
        <span className="min-w-0">
          <span className="block font-display text-sm tracking-wider text-gold-200">Journal</span>
          <span className="block truncate text-xs text-parchment-400">{journalLine(view)}</span>
        </span>
      </motion.button>

      {view.cast.some((m) => m.role === 'companion') && (
        <div>
          <div className="mb-2 text-[0.68rem] font-semibold tracking-[0.14em] text-gold-400 uppercase">Travelling with</div>
          <div className="space-y-2">
            {view.cast
              .filter((m) => m.role === 'companion')
              .map((m) => (
                <div key={m.cardId} className="flex items-center gap-2.5 text-sm text-parchment-200">
                  <Medallion name={m.name} race="human" size={32} badge={false} image={m.hasImage ? cardImageUrl(m.cardId) : undefined} />
                  <span className="truncate">{m.name}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Bar value={c.hp} max={d.maxHp} color="#d9574c" icon="heart" label="Health" />
        <Bar value={c.stamina} max={d.maxStamina} color="#8fbf73" icon="bolt" label="Stamina" />
        {d.maxMana > 0 && <Bar value={c.mana} max={d.maxMana} color="#9fb3ff" icon="sparkle" label="Mana" />}
        <div>
          <div className="mb-1 flex justify-between text-[0.7rem] text-parchment-500">
            <span>Experience</span>
            <span className="tabular-nums">
              {Math.max(0, d.xpIntoLevel)} / {d.xpForNext}
            </span>
          </div>
          <Bar value={Math.max(0, d.xpIntoLevel)} max={d.xpForNext} color="#e8b54d" thin />
        </div>
      </div>
      <PartyStrip view={view} onOpen={onOpenSheet} />

      {c.attrPoints > 0 && (
        <motion.button
          onClick={onOpenSheet}
          animate={{ boxShadow: ['0 0 0px rgba(255,170,60,0)', '0 0 24px rgba(255,170,60,0.6)', '0 0 0px rgba(255,170,60,0)'] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="no-drag cursor-pointer rounded-lg border border-gold-300/60 bg-gold-500/15 px-3 py-2 text-sm text-gold-200"
        >
          <Icon name="star" size={15} className="mr-1.5 inline -translate-y-px" />
          {c.attrPoints} attribute point{c.attrPoints > 1 ? 's' : ''} to spend
        </motion.button>
      )}

      <Tip
        side="right"
        content={
          c.deeds.length ? (
            <>
              <div className="mb-1 font-semibold text-gold-200">Known for</div>
              {c.deeds.slice(-6).map((x, i) => (
                <div key={i}>• {x.text}</div>
              ))}
            </>
          ) : (
            'Nobody has heard of you yet. Deeds and level-ups build Renown, and Renown changes how people treat you.'
          )
        }
      >
        <div className="flex w-full items-center gap-3 rounded-lg border border-gold-500/20 bg-ink-850/80 px-3 py-2">
          <Icon name="laurel" size={22} className="text-gold-300" />
          <div className="min-w-0 flex-1">
            <div className="text-[0.65rem] tracking-[0.16em] text-parchment-500 uppercase">Renown</div>
            <div className="font-display text-sm text-gold-200">
              {d.renownTier} <span className="text-parchment-500">· {c.renown}</span>
            </div>
          </div>
        </div>
      </Tip>

      {(c.conditions.length > 0 || bodyChips(view).length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {bodyChips(view).map((chip) => (
            <Tip key={chip.label} content={chip.text}>
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${chip.bad ? 'border-blood-400/40 bg-blood-500/10 text-blood-400' : 'border-gold-500/30 bg-gold-500/10 text-gold-200'}`}>
                <Icon name={chip.icon} size={12} />
                {chip.label}
              </motion.span>
            </Tip>
          ))}
          {c.conditions.filter((id) => id !== 'hungry' && id !== 'exhausted').map((id) => (
            <Tip key={id} content={CONDITIONS[id].text}>
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${['well_fed', 'inspired', 'hidden'].includes(id) ? 'border-moss-400/40 bg-moss-400/10 text-moss-400' : 'border-blood-400/40 bg-blood-500/10 text-blood-400'}`}>
                <Icon name={CONDITIONS[id].icon} size={12} />
                {CONDITIONS[id].label}
              </motion.span>
            </Tip>
          ))}
        </div>
      )}

      <div className="mt-auto space-y-2 border-t border-gold-500/15 pt-4 text-sm">
        <div className="flex items-center gap-2 text-parchment-300">
          <Icon name="coin" size={16} className="text-gold-400" />
          {coins.g > 0 && <span><b className="text-gold-200">{coins.g}</b> gold</span>}
          <span><b className="text-parchment-100">{coins.s}</b> silver</span>
          <span><b className="text-parchment-100">{coins.c}</b> copper</span>
        </div>
        <div className="flex items-center gap-2 text-parchment-300">
          <Icon name={t.icon} size={16} className="text-gold-400" />
          Day {view.state.time.day} · {dateLabel(view.state.time.day)} · {t.part}
        </div>
        {onSkip && (
          <button
            onClick={onSkip}
            disabled={!canSkip}
            title={canSkip ? 'Skip ahead a week, a season or years' : 'Not during a fight, or while the DM is answering'}
            className="no-drag -mt-1 ml-6 flex cursor-pointer items-center gap-1.5 text-xs text-gold-300 hover:text-gold-200 disabled:cursor-not-allowed disabled:opacity-40 touch:py-1.5 touch:text-sm"
          >
            <Icon name="hourglass" size={13} />
            Timeskip
          </button>
        )}
        {view.state.location && (
          <div className="flex items-center gap-2 text-parchment-300">
            <Icon name="map" size={16} className="text-gold-400" />
            {view.state.location}
          </div>
        )}
        {here?.image && <img src={mediaUrl(here.image)} alt={view.state.location ?? ''} className="mt-1 h-24 w-full rounded-lg border border-gold-500/20 object-cover" />}
      </div>
    </aside>
  )
}
