import { useEffect, useId, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AGE_IDS,
  AGES,
  ATTR_INFO,
  ATTR_START,
  ATTRS,
  RACE_BACKGROUNDS,
  BACKGROUNDS,
  DEFAULT_SETTINGS,
  GROUP_INFO,
  RACE_IDS,
  RACES,
  SEXES,
  SKILL_GROUPS,
  SKILL_IDS,
  SKILLS,
  START_SKILL_MAX,
  ageRange,
  attrCapBreakdown,
  attrRange,
  fmtMod,
  generateName,
  rescaleAge,
  stageAt,
  startingAge,
  typicalAge,
  maxHp,
  maxMana,
  maxStamina,
  mod,
  pointsLeft,
  randomBuild,
  skillCapBreakdown,
  skillLevelsSpent,
  startingSkillBudget,
  startingSkillLevel,
  validateBuild,
  type Attr,
  type CampaignSettings,
  type CharacterBuild,
  type SexMode,
  type SkillId
} from '@shared/rules'
import { cardImageUrl, fillMacros, guessFromCard, type CardSummary } from '@shared/cards'
import { APPEARANCE_IDEAS as APPEARANCE, callingFor, PERSONALITY_IDEAS as PERSONALITY } from '@shared/people'
import { useGame } from '../store'
import { AgeSlider, stageYears } from '../components/AgeSlider'
import { QuickHero } from './QuickHero'
import { api } from '../api'
import { CardLibrary } from './CardLibrary'
import { LoreEditor } from './LoreEditor'
import { LimitsField, StorytellerPicker } from './DmStyle'
import { WORLDS } from '@shared/worlds'
import { detectGenre, GENRE_LABEL, type Genre } from '@shared/genre'
import type { LorebookSummary } from '@shared/lore'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { Medallion } from '../components/Medallion'
import { Tip } from '../components/Tip'
import { EmberField } from '../components/EmberField'

const STEPS = [
  { id: 'origin', label: 'Origin', icon: 'user' },
  { id: 'calling', label: 'Calling', icon: 'hammer' },
  { id: 'attributes', label: 'Attributes', icon: 'bolt' },
  { id: 'skills', label: 'Skills', icon: 'star' },
  { id: 'identity', label: 'Identity', icon: 'quill' },
  { id: 'adventure', label: 'Adventure', icon: 'map' }
] as const
/** The Quick Hero (QuickHero.tsx): one page for the hero, then the adventure. */
const QUICK_STEPS = [{ id: 'hero', label: 'Hero', icon: 'quill' }, STEPS[5]] as const

const rng = () => Math.random()

/** "Ten years after", "A year after", "Days after": when a child sets out after the death. */
function afterDeath(days: number): string {
  const years = Math.floor(days / 360)
  const words = ['', 'A year', 'Two years', 'Three years', 'Four years', 'Five years', 'Six years', 'Seven years', 'Eight years', 'Nine years', 'Ten years']
  return years >= 1 ? `${words[years] ?? `${years} years`} after` : 'Days after'
}

/** Keeps a build legal after a choice changes its caps or budget. */
function normalize(b00: CharacterBuild, sexMode: SexMode): CharacterBuild {
  // The stage of life follows the age in years, kept to what an adventurer of this people can be.
  const range = ageRange(b00.race, 'adventurer')
  const years = Math.min(range.max, Math.max(range.min, Math.round(b00.years ?? startingAge(b00))))
  const b0 = { ...b00, years, age: stageAt(years, b00.race) }
  // A new race may not have the old calling: switch to its first one.
  const b = RACE_BACKGROUNDS[b0.race].includes(b0.background) ? b0 : { ...b0, background: RACE_BACKGROUNDS[b0.race][0] }
  const humanBonus = b.race === 'human' ? (b.humanBonus.length === 2 ? b.humanBonus : (['STR', 'AGI'] as Attr[])) : []
  const caps = attrCapBreakdown({ ...b, humanBonus }, sexMode)
  const attributes = { ...b.attributes }
  for (const a of ATTRS) attributes[a] = Math.max(ATTR_START, Math.min(caps[a].cap, attributes[a]))
  const next = { ...b, humanBonus, attributes }
  const sCaps = skillCapBreakdown(next, sexMode)
  const skills = { ...b.skills }
  for (const s of SKILL_IDS) {
    const limit = Math.min(START_SKILL_MAX, sCaps[s].cap)
    while ((skills[s] ?? 0) > 0 && startingSkillLevel({ background: b.background, skills }, s) > limit) skills[s] = (skills[s] ?? 0) - 1
    if (!skills[s]) delete skills[s]
  }
  let over = skillLevelsSpent({ skills }) - startingSkillBudget(b)
  for (const s of SKILL_IDS) {
    while (over > 0 && (skills[s] ?? 0) > 0) {
      skills[s] = (skills[s] ?? 0) - 1
      over--
    }
    if (!skills[s]) delete skills[s]
  }
  return { ...next, skills }
}

export function CreatorScreen() {
  const { go, create, heir, takeUp, cancelHeir } = useGame()
  /** After a death, this makes whoever takes up the tale in the same story (no world to pick). */
  /** Step by step, or the Quick Hero. */
  const [quick, setQuick] = useState(false)
  const [suggested, setSuggested] = useState(false)
  const steps: readonly { id: string; label: string; icon: string }[] = quick ? (heir ? QUICK_STEPS.slice(0, 1) : QUICK_STEPS) : heir ? STEPS.slice(0, STEPS.length - 1) : STEPS
  const [settings, setSettings] = useState<CampaignSettings>(() => (heir ? { ...heir.settings } : { ...DEFAULT_SETTINGS }))
  /** A child of the dead whose birth the story knows sets out at the age they are then. */
  const heirAge = heir?.child?.age
  const [build, setBuild] = useState<CharacterBuild>(() => {
    const mode = heir?.settings.sexModifiers ?? DEFAULT_SETTINGS.sexModifiers
    const b = randomBuild(rng, mode, '')
    if (heir?.child) {
      // Their card from the Journal, with their parent's people and family name; grown, and only
      // lately on the road.
      const kid = heir.child
      const surname = heir.dead.trim().split(/\s+/).slice(1).join(' ')
      const given = kid.name.trim()
      const name = given.split(/\s+/).length === 1 && surname ? `${given} ${surname}` : given
      const race = kid.race ?? heir.race ?? b.race
      const background = callingFor(kid.calling, race) ?? b.background
      const years = heirAge ?? typicalAge('young', race)
      return normalize({ ...b, race, sex: kid.sex ?? b.sex, background, years, name, appearance: kid.appearance ?? '', personality: kid.personality ?? '' }, mode)
    }
    return { ...b, name: generateName(rng, b.race, b.sex), appearance: '', personality: '' }
  })
  const [step, setStep] = useState(0)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [rolling, setRolling] = useState(0)
  /** Imported cards: the one the player plays as, and companions the DM plays. */
  const [playerCard, setPlayerCard] = useState<CardSummary | null>(null)
  const [companions, setCompanions] = useState<CardSummary[]>([])
  const [useGreeting, setUseGreeting] = useState(true)
  /** A starter world (its lorebook comes with it) and other lorebooks from the library. */
  const [world, setWorld] = useState<string | null>(null)
  const [lorebooks, setLorebooks] = useState<string[]>([])
  const [library, setLibrary] = useState<{ open: boolean; dropped: File[] }>({ open: false, dropped: [] })

  const sexMode = settings.sexModifiers
  const update = (patch: Partial<CharacterBuild>) =>
    setBuild((b) => {
      const next = { ...b, ...patch }
      // Another people, the same point in life (a human of 27 is a dwarf of 68), unless the
      // story has already said how old they are.
      if (heirAge !== undefined) next.years = heirAge
      else if (patch.race && patch.race !== b.race && patch.years === undefined) next.years = rescaleAge(startingAge(b), b.race, patch.race)
      return normalize(next, sexMode)
    })

  /** The name the card's description currently uses (it follows renames). */
  const [descName, setDescName] = useState('')

  /** Renaming a character from a card: their description follows the new name. */
  const withSyncedName = (b: CharacterBuild): CharacterBuild => {
    const now = b.name.trim()
    if (!playerCard || !descName || !now || now === descName) return b
    const swap = (text: string, from: string, to: string) => text.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), to)
    const [oldFirst] = descName.split(/\s+/)
    const [newFirst] = now.split(/\s+/)
    const fix = (text: string) => {
      let t = swap(text, descName, now)
      // Cards often use just the first name ("Mira smiles").
      if (oldFirst.length >= 3 && oldFirst !== newFirst && oldFirst !== descName) t = swap(t, oldFirst, newFirst)
      return t
    }
    return { ...b, appearance: fix(b.appearance), personality: fix(b.personality) }
  }
  const syncName = () => {
    if (!playerCard || !build.name.trim()) return
    setBuild(withSyncedName(build))
    setDescName(build.name.trim())
  }

  const playAs = async (card: CardSummary) => {
    try {
      const { data } = await api.card(card.id)
      const name = card.name.slice(0, 60)
      const guess = guessFromCard(data)
      const fill = (t: string) => fillMacros(t, name, 'someone').trim()
      update({
        name,
        appearance: fill(data.description).slice(0, 8000),
        personality: fill(data.personality).slice(0, 4000),
        ...(guess.race ? { race: guess.race } : {}),
        ...(guess.sex ? { sex: guess.sex } : {})
      })
      setPlayerCard(card)
      setDescName(name)
      setCompanions((cs) => cs.filter((c) => c.id !== card.id))
      setLibrary({ open: false, dropped: [] })
      setStep(0)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const toggleCompanion = (card: CardSummary) =>
    setCompanions((cs) => (cs.some((c) => c.id === card.id) ? cs.filter((c) => c.id !== card.id) : [...cs, card]))
  const errors = useMemo(() => validateBuild(build, sexMode), [build, sexMode])

  const rollAdventurer = () => {
    const b = randomBuild(rng, sexMode, '')
    const rolled = { ...b, name: generateName(rng, b.race, b.sex), appearance: pickOne(APPEARANCE), personality: pickOne(PERSONALITY) }
    // A child keeps their name, their people, their sex and their age.
    setBuild(heir?.child ? normalize({ ...rolled, name: build.name, race: build.race, sex: build.sex, years: heirAge ?? rescaleAge(rolled.years ?? startingAge(rolled), rolled.race, build.race) }, sexMode) : rolled)
    setPlayerCard(null)
    setRolling((r) => r + 1)
    setStep(quick ? 0 : 4)
  }

  const begin = async () => {
    setStarting(true)
    setError('')
    try {
      if (heir) return await takeUp(withSyncedName(build))
      const greet = useGreeting && (companions[0]?.greetings ?? 0) > 0
      await create(withSyncedName(build), settings, { playerCard: playerCard?.id, companions: companions.map((c) => c.id), useGreeting: greet, world: world ?? undefined, lorebooks })
    } catch (err) {
      setError((err as Error).message)
      setStarting(false)
    }
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col md:flex-row"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setLibrary({ open: true, dropped: [...e.dataTransfer.files] })
      }}
    >
      <EmberField density={0.25} className="opacity-40" />
      <CardLibrary
        open={library.open}
        dropped={library.dropped}
        onClose={() => setLibrary({ open: false, dropped: [] })}
        playerCardId={playerCard?.id}
        companionIds={companions.map((c) => c.id)}
        onPlayAs={(c) => void playAs(c)}
        onToggleCompanion={toggleCompanion}
      />

      {/* Steps */}
      <nav className="relative z-10 flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-gold-500/15 bg-ink-950/60 p-2 md:w-56 md:gap-1 md:flex-col md:items-stretch md:overflow-visible md:border-r md:border-b-0 md:p-4">
        <Button variant="ghost" size="sm" icon="back" onClick={() => (heir ? void cancelHeir() : go('title'))} className="shrink-0 px-2 md:mb-3 md:self-start md:px-3" aria-label="Back">
          <span className="hidden md:inline">Back</span>
        </Button>
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setStep(i)}
            aria-label={s.label}
            className={`no-drag relative flex shrink-0 cursor-pointer items-center gap-3 rounded-lg p-1 text-left text-sm transition-colors md:px-3 md:py-2.5 ${
              i === step ? 'text-gold-200' : 'text-parchment-400 hover:bg-white/5 hover:text-parchment-100'
            }`}
          >
            {i === step && (
              <motion.span layoutId="step-bg" className="absolute inset-0 rounded-lg border border-gold-400/40 bg-gold-500/10" />
            )}
            <span className="relative grid h-7 w-7 place-items-center rounded-full border border-gold-500/30 bg-ink-850 text-xs">
              <Icon name={s.icon} size={15} />
            </span>
            <span className="relative hidden font-display tracking-wider md:inline">{s.label}</span>
          </button>
        ))}
        {/* Phones: the same two as small icon buttons. */}
        <div className="ml-auto flex shrink-0 gap-1 pl-1 md:hidden">
          {!heir && (
            <button onClick={() => setLibrary({ open: true, dropped: [] })} className="no-drag grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-gold-500/25 text-gold-300" aria-label="Character cards">
              <Icon name="cards" size={19} />
            </button>
          )}
          <motion.button whileTap={{ scale: 0.9, rotate: -20 }} onClick={rollAdventurer} className="no-drag grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-ember-500/50 bg-ember-500/15 text-ember-400" aria-label="Roll a new adventurer">
            <Icon name="d20" size={20} />
          </motion.button>
        </div>
        <div className="mt-auto hidden space-y-2 md:block">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={heir ? { display: 'none' } : undefined}
            onClick={() => setLibrary({ open: true, dropped: [] })}
            className="no-drag focus-ring flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gold-500/25 bg-ink-900/80 p-3 text-left hover:border-gold-400/60"
          >
            <Icon name="cards" size={24} className="shrink-0 text-gold-300" />
            <span className="min-w-0">
              <span className="block font-display text-sm tracking-wider text-gold-200">Character Cards</span>
              <span className="block truncate text-xs text-parchment-400">
                {playerCard ? `Playing as ${build.name || playerCard.name}` : companions.length ? `${companions.length} companion${companions.length === 1 ? '' : 's'}` : 'Import, or bring a friend'}
              </span>
            </span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96, rotate: -2 }}
            onClick={rollAdventurer}
            className="no-drag focus-ring w-full cursor-pointer rounded-xl border border-ember-500/40 bg-gradient-to-b from-ember-500/20 to-ink-900 p-3 text-left shadow-[0_0_30px_-10px_rgb(255_122_47/0.8)]"
          >
            <motion.span key={rolling} initial={{ rotate: -200, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} className="mb-1 inline-block text-ember-400">
              <Icon name="d20" size={26} />
            </motion.span>
            <span className="block font-display text-sm tracking-wider text-gold-200">Roll a New Adventurer</span>
            <span className="block text-xs text-parchment-400">Random everything, in one click</span>
          </motion.button>
        </div>
      </nav>

      {/* Step content */}
      <div className="relative z-10 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 pt-5 pb-24 md:px-8 md:pt-8">
          {heir && (
            <div className="mb-6 rounded-xl border border-gold-500/25 bg-ink-900/70 px-4 py-3">
              <div className="flex items-center gap-2 font-display text-sm tracking-[0.14em] text-gold-300 uppercase">
                <Icon name="laurel" size={16} />
                {heir.child ? `${heir.child.name} takes up the tale` : 'Who takes up the tale?'}
              </div>
              <p className="mt-1 text-sm text-parchment-400">
                {heir.child
                  ? `${afterDeath(heir.child.days)} ${heir.dead} fell, their child sets out: they keep the family name and inherit their parent's savings, a share of their renown, and their weapon.`
                  : `A few days after ${heir.dead} fell, someone new comes to the same lands. The world, its people and its history carry on.`}
              </p>
            </div>
          )}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Segmented
              value={quick ? 'quick' : 'steps'}
              onChange={(v) => {
                setQuick(v === 'quick')
                setStep(0)
              }}
              options={[
                { id: 'steps', label: 'Step by Step', hint: 'Choose every part of your hero yourself.' },
                { id: 'quick', label: 'Quick Hero', hint: 'Describe your hero in your own words; the AI suggests the stats.' }
              ]}
            />
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={`${quick}-${step}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
              {steps[step]?.id === 'hero' && (
                <QuickHero
                  build={build}
                  update={update}
                  sexMode={sexMode}
                  suggested={suggested}
                  onSuggested={() => setSuggested(true)}
                  onAdjust={() => {
                    setQuick(false)
                    setStep(2)
                  }}
                  ageFixed={heirAge !== undefined}
                />
              )}
              {steps[step]?.id === 'origin' && <OriginStep build={build} update={update} settings={settings} setSettings={(s) => { setSettings(s); setBuild((b) => normalize(b, s.sexModifiers)) }} ageFixed={heirAge !== undefined} />}
              {steps[step]?.id === 'calling' && <CallingStep build={build} update={update} />}
              {steps[step]?.id === 'attributes' && <AttributesStep build={build} update={update} sexMode={sexMode} />}
              {steps[step]?.id === 'skills' && <SkillsStep build={build} update={update} sexMode={sexMode} />}
              {steps[step]?.id === 'identity' && <IdentityStep build={build} update={update} onNameDone={syncName} playerCard={playerCard} onUnlink={() => setPlayerCard(null)} />}
              {steps[step]?.id === 'adventure' && (
                <AdventureStep
                  settings={settings}
                  setSettings={setSettings}
                  companions={companions}
                  onRemoveCompanion={toggleCompanion}
                  onAddCompanion={() => setLibrary({ open: true, dropped: [] })}
                  useGreeting={useGreeting}
                  setUseGreeting={setUseGreeting}
                  world={world}
                  setWorld={setWorld}
                  lorebooks={lorebooks}
                  setLorebooks={setLorebooks}
                />
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-10 flex items-center gap-3 border-t border-gold-500/15 pt-6">
            {step > 0 && (
              <Button variant="ghost" icon="left" onClick={() => setStep(step - 1)}>
                {steps[step - 1].label}
              </Button>
            )}
            <div className="ml-auto flex items-center gap-3">
              {(error || (step === steps.length - 1 && errors[0])) && <span className="text-sm text-blood-400">{error || errors[0]}</span>}
              {step < steps.length - 1 ? (
                <Button variant="secondary" onClick={() => setStep(step + 1)}>
                  {steps[step + 1].label}
                  <Icon name="right" size={16} />
                </Button>
              ) : (
                <Button variant="primary" size="lg" icon="d20" onClick={() => void begin()} disabled={errors.length > 0 || starting}>
                  {starting ? 'Setting the scene…' : heir ? 'Take up the tale' : 'Begin the Adventure'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <aside className="relative z-10 hidden w-80 shrink-0 overflow-y-auto border-l border-gold-500/15 bg-ink-950/60 p-6 xl:block">
        <Preview build={build} sexMode={sexMode} rolling={rolling} image={playerCard?.hasImage ? cardImageUrl(playerCard.id) : undefined} companions={companions} />
      </aside>
    </div>
  )
}

const pickOne = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

// ---- Steps -------------------------------------------------------------------------------

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-3xl tracking-wider text-gold-300">{title}</h2>
      <p className="mt-1 text-parchment-400">{text}</p>
    </div>
  )
}

function Card({ active, onClick, children, className = '' }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`focus-ring no-drag relative cursor-pointer overflow-hidden rounded-xl border p-4 text-left transition-colors ${
        active ? 'border-gold-400/80 bg-gradient-to-b from-gold-500/15 to-ink-850 shadow-[0_0_30px_-8px_rgb(255_160_50/0.5)]' : 'border-gold-500/15 bg-ink-850/80 hover:border-gold-500/45'
      } ${className}`}
    >
      {children}
    </motion.button>
  )
}

function ModChips({ mods }: { mods: Partial<Record<string, number>> }) {
  const entries = Object.entries(mods).filter(([, v]) => v)
  if (!entries.length) return <span className="text-xs text-parchment-500">No attribute changes</span>
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span key={k} className={`rounded px-1.5 py-px text-[0.68rem] font-semibold ${v! > 0 ? 'bg-moss-400/15 text-moss-400' : 'bg-blood-500/20 text-blood-400'}`}>
          {k} {fmtMod(v!)}
        </span>
      ))}
    </span>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  // Each control needs its own sliding highlight, even when two have the same options.
  const uid = useId()
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-gold-500/20 bg-ink-900/80 p-1">
      {options.map((o) => (
        <Tip key={o.id} content={o.hint}>
          <button
            onClick={() => onChange(o.id)}
            className={`no-drag relative cursor-pointer rounded-lg px-3.5 py-1.5 text-sm transition-colors ${value === o.id ? 'text-ink-950' : 'text-parchment-300 hover:text-gold-200'}`}
          >
            {value === o.id && <motion.span layoutId={`seg-${uid}`} className="absolute inset-0 rounded-lg bg-gradient-to-b from-gold-300 to-gold-500" />}
            <span className="relative font-medium">{o.label}</span>
          </button>
        </Tip>
      ))}
    </div>
  )
}

function OriginStep({
  build,
  update,
  settings,
  setSettings,
  ageFixed = false
}: {
  build: CharacterBuild
  update: (p: Partial<CharacterBuild>) => void
  settings: CampaignSettings
  setSettings: (s: CampaignSettings) => void
  /** A child of the dead sets out at the age the story says they are. */
  ageFixed?: boolean
}) {
  const stage = AGES[build.age]
  return (
    <>
      <StepTitle title="Origin" text="Where you come from shapes what you can become. Every choice moves your limits." />
      <h3 className="mb-3 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Race</h3>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {RACE_IDS.map((r) => {
          const race = RACES[r]
          return (
            <Card key={r} active={build.race === r} onClick={() => update({ race: r })}>
              <div className="mb-2 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-gold-500/30 bg-ink-800 text-gold-300">
                  <Icon name={`race-${r}`} size={22} />
                </span>
                <span className="font-display text-lg tracking-wide text-parchment-50">{race.label}</span>
              </div>
              <p className="mb-2 text-[0.82rem] leading-snug text-parchment-300">{race.blurb}</p>
              <ModChips mods={race.attrs} />
              <p className="mt-2 text-xs text-gold-300/90">
                <span className="font-semibold">{race.trait.name}:</span> <span className="text-parchment-400">{race.trait.text}</span>
              </p>
            </Card>
          )
        })}
      </div>

      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Sex</h3>
        <div className="flex items-center gap-2 text-xs text-parchment-400">
          Sex modifiers
          <Segmented
            value={settings.sexModifiers}
            onChange={(v) => setSettings({ ...settings, sexModifiers: v })}
            options={[
              { id: 'realistic', label: 'Realistic', hint: 'Men are stronger but must prove themselves; women are welcomed but fragile, and fight mostly with magic.' },
              { id: 'off', label: 'Off', hint: 'No differences between the sexes in this campaign.' }
            ]}
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(['male', 'female'] as const).map((s) => {
          const row = SEXES[settings.sexModifiers][s]
          return (
            <Card key={s} active={build.sex === s} onClick={() => update({ sex: s })}>
              <span className="font-display text-lg tracking-wide text-parchment-50">{row.label}</span>
              <p className="my-2 text-[0.82rem] leading-snug text-parchment-300">{row.blurb}</p>
              <ModChips mods={row.attrs} />
              {settings.sexModifiers === 'realistic' && (
                <p className="mt-2 text-xs text-parchment-400">
                  Base health {row.baseHp} · Social {fmtMod(row.socialBase)} with strangers · Captured instead of killed by people {Math.round(row.captureChance * 100)}% of the time
                </p>
              )}
            </Card>
          )
        })}
      </div>

      <h3 className="mt-8 mb-3 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Age</h3>
      <div className="rounded-xl border border-gold-500/15 bg-ink-850/70 p-4">
        <AgeSlider race={build.race} value={startingAge(build)} onChange={(years) => update({ years })} who="adventurer" disabled={ageFixed} />
        {ageFixed && <p className="mt-1 text-xs text-parchment-400">Their age when they take up the tale.</p>}
        {!ageFixed && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {AGE_IDS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => update({ years: typicalAge(a, build.race) })}
                className={`no-drag focus-ring cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors touch:py-1.5 ${
                  build.age === a ? 'border-gold-300 bg-gold-400/20 text-gold-100' : 'border-gold-500/20 text-parchment-400 hover:text-gold-200'
                }`}
              >
                <span className="font-semibold">{AGES[a].label}</span> <span className="text-parchment-500">{stageYears(a, build.race)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ModChips mods={stage.attrs} />
          {(stage.skillLevels > 0 || stage.xpBonus > 0) && (
            <span className="text-[0.75rem] text-gold-300/80">{stage.xpBonus ? `+${stage.xpBonus * 100}% skill XP` : `+${stage.skillLevels} skill levels, +${stage.renown} Renown`}</span>
          )}
        </div>
      </div>
    </>
  )
}

function CallingStep({ build, update }: { build: CharacterBuild; update: (p: Partial<CharacterBuild>) => void }) {
  return (
    <>
      <StepTitle title="Calling" text={`What you did before the adventure, among the ${RACES[build.race].plural.toLowerCase()}. It sets your first skills, your gear and what you have a gift for.`} />
      <div className="grid gap-3 md:grid-cols-2">
        {RACE_BACKGROUNDS[build.race].map((id) => {
          const bg = BACKGROUNDS[id]
          return (
            <Card key={id} active={build.background === id} onClick={() => update({ background: id })}>
              <span className="font-display text-lg tracking-wide text-parchment-50">{bg.label}</span>
              <p className="my-2 text-[0.82rem] leading-snug text-parchment-300">{bg.blurb}</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(bg.skills).map(([s, lvl]) => (
                  <span key={s} className="rounded bg-gold-500/15 px-1.5 py-px text-[0.68rem] font-semibold text-gold-200">
                    {SKILLS[s as SkillId].label} {1 + (lvl as number)}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-parchment-400">
                <Icon name="bag" size={13} className="mr-1 inline -translate-y-px text-gold-400" />
                {bg.kit.map((k) => ('qty' in k && k.qty ? `${k.name} ×${k.qty}` : k.name)).join(', ')} · {bg.coins / 10} silver
              </p>
            </Card>
          )
        })}
      </div>
    </>
  )
}

/**
 * A score out of 20, with the ember mark at its cap. Given `onPick`, it can also be dragged or
 * tapped to a score (to the nearest whole point); the caller keeps that within the limits.
 */
function CapBar({ value, cap, max = 20, onPick }: { value: number; cap: number; max?: number; onPick?: (score: number) => void }) {
  const [dragging, setDragging] = useState(false)
  const bar = (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-950 ring-1 ring-white/5">
      <div className="absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgb(255_255_255/0.04)_4px_8px)]" style={{ left: `${(cap / max) * 100}%` }} />
      {/* While dragging, the gold keeps up with the finger instead of easing after it. */}
      <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold-500 to-gold-300" initial={false} animate={{ width: `${(value / max) * 100}%` }} transition={dragging ? { duration: 0 } : undefined} />
      <div className="absolute inset-y-[-2px] w-0.5 bg-ember-400 shadow-[0_0_6px_var(--color-ember-400)]" style={{ left: `calc(${(cap / max) * 100}% - 1px)` }} />
    </div>
  )
  if (!onPick) return bar
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    onPick(Math.round(((e.clientX - box.left) / box.width) * max))
  }
  // A strip taller than the bar, for fingers. The pointer is captured, so a drag keeps going off
  // the bar, and touch-none stops the page scrolling under it. A finger here sets the score, so
  // it doesn't also open the cap tooltip, which would cover the numbers while dragging.
  return (
    <div
      className="no-drag -my-3 cursor-pointer touch-none py-3 select-none"
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        pick(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e)
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e)
      }}
      onLostPointerCapture={() => setDragging(false)}
    >
      {bar}
    </div>
  )
}

function Stepper({ onMinus, onPlus, canMinus, canPlus }: { onMinus: () => void; onPlus: () => void; canMinus: boolean; canPlus: boolean }) {
  const btn = 'no-drag grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-gold-500/25 bg-ink-800 text-gold-300 transition hover:border-gold-400 disabled:cursor-not-allowed disabled:opacity-25'
  return (
    <span className="flex items-center gap-1">
      <motion.button whileTap={{ scale: 0.85 }} className={btn} onClick={onMinus} disabled={!canMinus}>
        <Icon name="minus" size={14} />
      </motion.button>
      <motion.button whileTap={{ scale: 0.85 }} className={btn} onClick={onPlus} disabled={!canPlus}>
        <Icon name="plus" size={14} />
      </motion.button>
    </span>
  )
}

function AttributesStep({ build, update, sexMode }: { build: CharacterBuild; update: (p: Partial<CharacterBuild>) => void; sexMode: SexMode }) {
  const caps = attrCapBreakdown(build, sexMode)
  const left = pointsLeft(build.attributes)
  return (
    <>
      <StepTitle title="Attributes" text="Spend 24 points. Raising a score past 14 costs 2 points. The ember mark is your limit for life." />
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <motion.div key={left} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className={`rounded-xl border px-4 py-2 font-display text-lg ${left < 0 ? 'border-blood-400/50 text-blood-400' : left === 0 ? 'border-moss-400/40 text-moss-400' : 'border-gold-400/50 text-gold-200'}`}>
          {left} point{left === 1 ? '' : 's'} left
        </motion.div>
        <Button variant="ghost" size="sm" icon="d20" onClick={() => update({ attributes: randomBuild(Math.random, sexMode, build.name, { ...build, attributes: undefined, skills: build.skills }).attributes })}>
          Spread randomly
        </Button>
        {build.race === 'human' && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-parchment-300">
            <span className="text-gold-300">Adaptable:</span> +1 cap to
            {ATTRS.map((a) => {
              const on = build.humanBonus.includes(a)
              return (
                <button
                  key={a}
                  onClick={() => update({ humanBonus: on ? build.humanBonus.filter((x) => x !== a) : [...build.humanBonus.slice(-1), a] })}
                  className={`no-drag cursor-pointer rounded-md border px-2 py-0.5 text-xs font-semibold ${on ? 'border-gold-300 bg-gold-400/20 text-gold-200' : 'border-gold-500/20 text-parchment-400 hover:text-gold-200'}`}
                >
                  {a}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="panel space-y-1 rounded-2xl p-3">
        {ATTRS.map((a) => {
          const v = build.attributes[a]
          const cap = caps[a].cap
          // The buttons and the bar both go through here, so they keep to the same limits.
          const range = attrRange(build.attributes, a, cap)
          const set = (score: number) => {
            const next = Math.max(range.min, Math.min(range.max, score))
            if (next !== v) update({ attributes: { ...build.attributes, [a]: next } })
          }
          return (
            <div key={a} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 rounded-lg px-2 py-2.5 hover:bg-white/[0.03] md:grid-cols-[10rem_1fr_auto_auto] md:gap-4 md:px-3">
              <div>
                <div className="font-display tracking-wide text-parchment-50">{ATTR_INFO[a].label}</div>
                <div className="text-[0.72rem] leading-tight text-parchment-500">{ATTR_INFO[a].blurb}</div>
              </div>
              <Tip content={<>Cap {cap}: {caps[a].sources.map((s) => `${s.label} ${s.value > 0 && s.label !== 'Base' ? '+' : ''}${s.value}`).join(', ')}</>} className="order-last col-span-3 md:order-none md:col-span-1">
                <div className="w-full md:min-w-48">
                  <CapBar value={v} cap={cap} onPick={set} />
                </div>
              </Tip>
              <div className="w-20 text-right">
                <span className="font-display text-xl text-gold-200 tabular-nums">{v}</span>
                <span className="ml-1.5 text-sm text-parchment-400">{fmtMod(mod(v))}</span>
                <div className="text-[0.68rem] text-parchment-500">cap {cap}</div>
              </div>
              <Stepper onMinus={() => set(v - 1)} onPlus={() => set(v + 1)} canMinus={v > range.min} canPlus={v < range.max} />
            </div>
          )
        })}
      </div>
    </>
  )
}

function SkillsStep({ build, update, sexMode }: { build: CharacterBuild; update: (p: Partial<CharacterBuild>) => void; sexMode: SexMode }) {
  const caps = skillCapBreakdown(build, sexMode)
  const budget = startingSkillBudget(build)
  const spent = skillLevelsSpent(build)
  const set = (s: SkillId, delta: number) => {
    const skills = { ...build.skills, [s]: Math.max(0, (build.skills[s] ?? 0) + delta) }
    if (!skills[s]) delete skills[s]
    update({ skills })
  }
  return (
    <>
      <StepTitle title="Skills" text="Skills grow only by doing. Give yourself a head start: spread a few extra levels. Caps show how far each can ever go." />
      <motion.div key={spent} initial={{ scale: 1.1 }} animate={{ scale: 1 }} className="mb-5 inline-block rounded-xl border border-gold-400/50 px-4 py-2 font-display text-lg text-gold-200">
        {budget - spent} level{budget - spent === 1 ? '' : 's'} left to spread
      </motion.div>
      <div className="grid gap-4 md:grid-cols-2">
        {SKILL_GROUPS.map((g) => (
          <div key={g} className="panel rounded-2xl p-3">
            <div className="mb-1 flex items-center gap-2 px-2 pt-1 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">
              <Icon name={GROUP_INFO[g].icon} size={15} />
              {GROUP_INFO[g].label}
            </div>
            {SKILL_IDS.filter((s) => SKILLS[s].group === g).map((s) => {
              const lvl = startingSkillLevel(build, s)
              const cap = caps[s].cap
              const limit = Math.min(START_SKILL_MAX, cap)
              return (
                <div key={s} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                  <Tip content={<>{SKILLS[s].blurb}. Uses {SKILLS[s].attr}. Cap {cap}: {caps[s].sources.map((x) => `${x.label} ${x.value}`).join(', ')}</>}>
                    <span className="text-sm text-parchment-100">
                      {SKILLS[s].label}
                      <span className="ml-1.5 text-[0.68rem] text-parchment-500">{SKILLS[s].attr}</span>
                    </span>
                  </Tip>
                  <span className="text-right text-sm tabular-nums">
                    <span className={`font-semibold ${lvl > 1 ? 'text-gold-200' : 'text-parchment-400'}`}>{lvl}</span>
                    <span className="text-parchment-500"> / {cap}</span>
                  </span>
                  <Stepper onMinus={() => set(s, -1)} onPlus={() => set(s, 1)} canMinus={(build.skills[s] ?? 0) > 0} canPlus={spent < budget && lvl < limit} />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </>
  )
}

/** The die in the corner of a box that suggests something for it (out here so it isn't rebuilt at every keystroke). */
function Roll({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <motion.button whileTap={{ rotate: 180, scale: 0.85 }} onClick={onClick} title={title} className="no-drag absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-gold-400 hover:bg-white/5 hover:text-gold-200">
      <Icon name="d20" size={18} />
    </motion.button>
  )
}

function IdentityStep({
  build,
  update,
  onNameDone,
  playerCard,
  onUnlink
}: {
  build: CharacterBuild
  update: (p: Partial<CharacterBuild>) => void
  onNameDone: () => void
  playerCard: CardSummary | null
  onUnlink: () => void
}) {
  const long = build.appearance.length > 240 || build.personality.length > 300
  return (
    <>
      <StepTitle title="Identity" text="Who are you? The Dungeon Master will use all of this." />
      {playerCard && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-gold-400/40 bg-gold-500/10 px-4 py-3 text-sm">
          <Icon name="cards" size={20} className="shrink-0 text-gold-300" />
          <span className="flex-1 text-parchment-200">
            From the card <span className="font-semibold text-gold-200">{playerCard.name}</span>. Edit anything; renaming them updates their description too.
          </span>
          <Button size="sm" variant="ghost" onClick={onUnlink}>
            Don&apos;t use the card
          </Button>
        </div>
      )}
      <div className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Name</span>
          <div className="relative">
            <input value={build.name} onChange={(e) => update({ name: e.target.value })} onBlur={onNameDone} maxLength={60} className="input pr-12 font-display text-lg tracking-wide" placeholder="Your name" />
            <Roll onClick={() => update({ name: generateName(Math.random, build.race, build.sex) })} title="Suggest a name" />
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">{playerCard ? 'Appearance & background' : 'Appearance'}</span>
          <div className="relative">
            <textarea value={build.appearance} onChange={(e) => update({ appearance: e.target.value })} maxLength={8000} rows={long ? 9 : 3} className={`input pr-12 font-story text-[1.05rem] ${long ? 'resize-y' : 'resize-none'}`} placeholder="What do people notice first?" />
            <Roll onClick={() => update({ appearance: pickOne(APPEARANCE) })} title="Suggest an appearance" />
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Personality</span>
          <div className="relative">
            <textarea value={build.personality} onChange={(e) => update({ personality: e.target.value })} maxLength={4000} rows={long ? 5 : 3} className={`input pr-12 font-story text-[1.05rem] ${long ? 'resize-y' : 'resize-none'}`} placeholder="How do you carry yourself?" />
            <Roll onClick={() => update({ personality: pickOne(PERSONALITY) })} title="Suggest a personality" />
          </div>
        </label>
      </div>
    </>
  )
}

/**
 * One setting on the Adventure step. It lives out here, not inside AdventureStep: a component
 * made inside another is a new one on every render, so React would throw every row away and
 * build it again at each click, and the page jumped back towards the top.
 */
function Row({ label, text, children }: { label: string; text: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-gold-500/10 py-4 md:grid-cols-[14rem_1fr] md:items-center">
      <div>
        <div className="font-display tracking-wide text-parchment-50">{label}</div>
        <div className="text-xs text-parchment-500">{text}</div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function AdventureStep({
  settings,
  setSettings,
  companions,
  onRemoveCompanion,
  onAddCompanion,
  useGreeting,
  setUseGreeting,
  world,
  setWorld,
  lorebooks,
  setLorebooks
}: {
  settings: CampaignSettings
  setSettings: (s: CampaignSettings) => void
  companions: CardSummary[]
  onRemoveCompanion: (c: CardSummary) => void
  onAddCompanion: () => void
  useGreeting: boolean
  setUseGreeting: (v: boolean) => void
  world: string | null
  setWorld: (w: string | null) => void
  lorebooks: string[]
  setLorebooks: (ids: string[]) => void
}) {
  // What Auto would pick, read from the chosen world and lorebooks (genre.ts), and its look.
  const [detected, setDetected] = useState<Genre>('fantasy')
  useEffect(() => {
    let live = true
    const ids = [...(world ? [WORLDS.find((w) => w.id === world)?.lorebook.id].filter((x): x is string => Boolean(x)) : []), ...lorebooks]
    if (!ids.length) {
      setDetected('fantasy')
      return
    }
    Promise.all(ids.map((id) => api.lorebook(id).catch(() => null)))
      .then((books) => {
        if (live) setDetected(detectGenre(books.flatMap((b) => (b ? [b.name, b.description, ...b.entries.map((e) => `${e.keys.join(' ')} ${e.content}`)] : []))))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [world, lorebooks])
  const genre: Genre = settings.genre === 'auto' ? detected : settings.genre
  useEffect(() => {
    if (genre === 'scifi') document.documentElement.dataset.genre = 'scifi'
    else delete document.documentElement.dataset.genre
    return () => {
      delete document.documentElement.dataset.genre
    }
  }, [genre])

  const greeter = companions[0]?.greetings ? companions[0] : null
  const [loreOpen, setLoreOpen] = useState(false)
  const [library, setLibrary] = useState<LorebookSummary[]>([])
  useEffect(() => {
    if (!loreOpen) api.lorebooks().then(setLibrary).catch(() => setLibrary([]))
  }, [loreOpen])
  const worldBook = WORLDS.find((w) => w.id === world)?.lorebook.id
  const chosen = library.filter((b) => lorebooks.includes(b.id) && b.id !== worldBook)
  const set = (p: Partial<CampaignSettings>) => setSettings({ ...settings, ...p })
  return (
    <>
      <StepTitle title="Adventure" text="How the Dungeon Master runs this campaign. You can change these later." />
      <LoreEditor
        open={loreOpen}
        onClose={() => setLoreOpen(false)}
        context="new adventure"
        attached={[...lorebooks, ...(worldBook ? [worldBook] : [])]}
        onToggleAttach={(id) => {
          if (id === worldBook) return setWorld(null)
          setLorebooks(lorebooks.includes(id) ? lorebooks.filter((x) => x !== id) : [...lorebooks, id])
        }}
      />
      <div className="panel rounded-2xl px-5">
        <Row label="Companions" text="Characters from cards who travel with you. The DM plays them.">
          <div className="flex flex-wrap items-center gap-2">
            {companions.map((c) => (
              <span key={c.id} className="flex items-center gap-2 rounded-full border border-gold-500/30 bg-ink-850 py-1 pr-1 pl-1 text-sm text-parchment-100">
                <Medallion name={c.name} race="human" size={26} badge={false} image={c.hasImage ? cardImageUrl(c.id) : undefined} />
                {c.name}
                <button onClick={() => onRemoveCompanion(c)} className="no-drag cursor-pointer rounded-full p-1 text-parchment-400 hover:bg-white/5 hover:text-blood-400" title={`Leave ${c.name} behind`}>
                  <Icon name="x" size={14} />
                </button>
              </span>
            ))}
            <Button size="sm" variant="ghost" icon="plus" onClick={onAddCompanion}>
              {companions.length ? 'Add another' : 'Bring a companion'}
            </Button>
          </div>
        </Row>
        <Row label="World" text="Where the story is set">
          <div className="flex flex-col gap-2">
            <Segmented
              value={world ?? 'none'}
              onChange={(v) => setWorld(v === 'none' ? null : v)}
              options={[{ id: 'none', label: 'The DM invents it', hint: 'A fresh world made up as you play.' }, ...WORLDS.map((w) => ({ id: w.id, label: w.name, hint: w.tagline }))]}
            />
            {world && <p className="text-xs text-parchment-400">{WORLDS.find((w) => w.id === world)?.tagline} Its lorebook comes with it, and you can read or change it.</p>}
          </div>
        </Row>
        <Row label="Lorebooks" text="Extra world knowledge, given to the DM when it comes up">
          <div className="flex flex-wrap items-center gap-2">
            {chosen.map((b) => (
              <span key={b.id} className="flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-ink-850 py-1 pr-1 pl-3 text-sm text-parchment-100">
                {b.name}
                <button onClick={() => setLorebooks(lorebooks.filter((x) => x !== b.id))} className="no-drag cursor-pointer rounded-full p-1 text-parchment-400 hover:text-blood-400" title={`Don't use ${b.name}`}>
                  <Icon name="x" size={13} />
                </button>
              </span>
            ))}
            <Button size="sm" variant="ghost" icon="scroll" onClick={() => setLoreOpen(true)}>
              {chosen.length ? 'Change' : 'Choose or import'}
            </Button>
          </div>
        </Row>
        {greeter && (
          <Row label="Opening" text="How the story begins">
            <Segmented
              value={useGreeting ? 'card' : 'dm'}
              onChange={(v) => setUseGreeting(v === 'card')}
              options={[
                {
                  id: 'card',
                  label: `${greeter.name}'s greeting`,
                  hint:
                    greeter.greetings > 1
                      ? `Starts with the card's first message. Its other ${greeter.greetings - 1 === 1 ? 'greeting is' : `${greeter.greetings - 1} greetings are`} there to flip through.`
                      : "Starts with the card's first message."
                },
                { id: 'dm', label: 'The DM sets the scene', hint: 'The Dungeon Master writes a new opening with your companions in it.' }
              ]}
            />
          </Row>
        )}
        <Row label="Tone" text="The feel of the world">
          <Segmented value={settings.tone} onChange={(tone) => set({ tone })} options={[{ id: 'grim', label: 'Grim' }, { id: 'grounded', label: 'Grounded' }, { id: 'heroic', label: 'Heroic' }, { id: 'whimsical', label: 'Whimsical' }, { id: 'horror', label: 'Horror' }]} />
        </Row>
        <Row label="Genre" text={settings.genre === 'auto' ? `Auto: ${GENRE_LABEL[detected]}${detected === 'scifi' ? ', from your lorebooks' : ''}` : 'Fantasy, or grimdark science fiction'}>
          <Segmented
            value={settings.genre}
            onChange={(genre) => set({ genre })}
            options={[
              { id: 'auto', label: 'Auto', hint: 'Read from your world and lorebooks: a far-future lorebook makes it sci-fi.' },
              { id: 'fantasy', label: 'Fantasy', hint: 'Swords, sorcery and the old kingdoms.' },
              { id: 'scifi', label: 'Sci-Fi', hint: 'A grim far future: guns, voidships, hive cities. The rules are told in its terms.' }
            ]}
          />
        </Row>
        <Row label="Content" text="How frankly the story is told">
          <Segmented
            value={settings.content}
            onChange={(content) => set({ content })}
            options={[
              { id: 'mild', label: 'Mild', hint: 'For any audience: no gore, no sex.' },
              { id: 'mature', label: 'Mature', hint: 'For adults: frank and unsanitised, sex off the page.' },
              { id: 'explicit', label: 'Explicit', hint: 'For adults, nothing held back.' }
            ]}
          />
        </Row>
        <Row label="Mercy" text="What happens at zero health">
          <Segmented
            value={settings.mercy}
            onChange={(mercy) => set({ mercy })}
            options={[
              { id: 'brutal', label: 'Brutal', hint: 'Zero health means death.' },
              { id: 'harsh', label: 'Harsh', hint: 'You go down and make death rolls. Real death is likely. (Recommended)' },
              { id: 'forgiving', label: 'Forgiving', hint: 'You are captured or left for dead, but never killed.' }
            ]}
          />
        </Row>
        <Row label="Dice" text="When you throw the dice yourself">
          <Segmented
            value={settings.rollMode}
            onChange={(rollMode) => set({ rollMode })}
            options={[
              { id: 'auto', label: 'Automatic', hint: 'All rolls happen by themselves.' },
              { id: 'dramatic', label: 'Big moments', hint: 'Routine rolls are automatic; you throw the ones that matter.' },
              { id: 'always', label: 'Always', hint: 'You throw every roll.' }
            ]}
          />
        </Row>
        <Row label="Response length" text="How much the DM writes per turn">
          <Segmented value={settings.length} onChange={(length) => set({ length })} options={[{ id: 'short', label: 'Short' }, { id: 'medium', label: 'Medium' }, { id: 'long', label: 'Long' }]} />
        </Row>
        <Row label="Fail forward" text="Narrow failures can succeed at a cost">
          <Segmented value={settings.failForward ? 'on' : 'off'} onChange={(v) => set({ failForward: v === 'on' })} options={[{ id: 'off', label: 'Off' }, { id: 'on', label: 'On' }]} />
        </Row>
        <Row label="Cultures" text="How each people lives and sees the others">
          <Segmented
            value={settings.cultures ? 'on' : 'off'}
            onChange={(v) => set({ cultures: v === 'on' })}
            options={[
              { id: 'on', label: 'On', hint: "The DM plays each people's customs." },
              { id: 'off', label: 'Off', hint: 'The DM makes up its own.' }
            ]}
          />
        </Row>
        <Row label="Ironman" text="No rerolls and no rewinds">
          <Segmented value={settings.ironman ? 'on' : 'off'} onChange={(v) => set({ ironman: v === 'on' })} options={[{ id: 'off', label: 'Off' }, { id: 'on', label: 'On' }]} />
        </Row>
        <Row label="Hunger & sleep" text="Eat and rest, or pay for it">
          <Segmented
            value={settings.survival ? 'on' : 'off'}
            onChange={(v) => set({ survival: v === 'on' })}
            options={[
              { id: 'on', label: 'On', hint: 'Go hungry or sleepless and your checks suffer. Starving, sleep heals nothing.' },
              { id: 'off', label: 'Off', hint: 'No hunger or tiredness.' }
            ]}
          />
        </Row>
        <Row label="Combat" text="How fights are played">
          <Segmented
            value={settings.combat}
            onChange={(combat) => set({ combat })}
            options={[
              { id: 'mixed', label: 'Mixed', hint: 'Quick scuffles are told in the story; real fights go on the tracker, blow by blow. (Recommended)' },
              { id: 'turn', label: 'Tracker', hint: 'Every fight goes on the tracker: rounds, enemy health, every blow rolled.' },
              { id: 'narrative', label: 'Story', hint: 'Fights are told in the story, with a roll or two deciding them.' }
            ]}
          />
        </Row>
        <Row label="Random events" text="How often the world interrupts">
          <Segmented
            value={settings.events}
            onChange={(events) => set({ events })}
            options={[
              { id: 'calm', label: 'Calm', hint: 'Rarely: the story is mostly what you make it.' },
              { id: 'normal', label: 'Normal', hint: 'Now and then: weather, strangers, trouble on the road.' },
              { id: 'eventful', label: 'Eventful', hint: 'Often: the road is rarely quiet.' },
              { id: 'chaos', label: 'Chaos', hint: 'Constantly. Good luck.' }
            ]}
          />
        </Row>
      </div>

      <h3 className="mt-8 mb-1 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Your storyteller</h3>
      <p className="mb-3 text-sm text-parchment-400">Who tells the story, and what they bring about. You can change your mind later, under Saves.</p>
      <StorytellerPicker value={settings.persona} onChange={(persona) => set({ persona })} />

      <h3 className="mt-8 mb-3 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">DM style</h3>
      <div className="panel rounded-2xl px-5">
        <Row label="Rolls" text="How often the dice come out">
          <Segmented value={settings.rolls} onChange={(rolls) => set({ rolls })} options={[{ id: 'fewer', label: 'Fewer' }, { id: 'normal', label: 'Normal' }, { id: 'more', label: 'More' }]} />
        </Row>
        <Row label="Pacing" text="Who drives the story">
          <Segmented
            value={settings.pacing}
            onChange={(pacing) => set({ pacing })}
            options={[
              { id: 'sandbox', label: 'Sandbox', hint: 'You lead; the world reacts.' },
              { id: 'guided', label: 'Guided story', hint: 'The DM keeps a plot moving and raises the stakes.' }
            ]}
          />
        </Row>
        <Row label="Perspective" text="How the story is told">
          <Segmented value={settings.perspective} onChange={(perspective) => set({ perspective })} options={[{ id: 'second', label: '“You…”' }, { id: 'third', label: 'Third person' }]} />
        </Row>
        <Row label="Acting for you" text="May the DM describe your character?">
          <Segmented
            value={settings.acting}
            onChange={(acting) => set({ acting })}
            options={[
              { id: 'never', label: 'Never', hint: 'The DM never decides what your character says, does, thinks or feels.' },
              { id: 'light', label: 'Small reactions', hint: 'A flinch or a shiver, but never your choices or words.' }
            ]}
          />
        </Row>
        <Row label="Avoid" text="Things to leave out, or fade to black">
          <LimitsField wide value={settings.limits} onSave={(limits) => set({ limits })} />
        </Row>
      </div>
    </>
  )
}

// ---- Preview -----------------------------------------------------------------------------

function Preview({ build, sexMode, rolling, image, companions }: { build: CharacterBuild; sexMode: SexMode; rolling: number; image?: string; companions: CardSummary[] }) {
  const caps = attrCapBreakdown(build, sexMode)
  const hp = maxHp(build.sex, sexMode, build.attributes.END, 1)
  const st = maxStamina(build.attributes.END, build.attributes.AGI)
  const mp = maxMana(build.attributes.ARC, 1)
  return (
    <motion.div key={rolling} initial={{ opacity: 0, rotateY: 30 }} animate={{ opacity: 1, rotateY: 0 }} transition={{ duration: 0.5 }} className="flex flex-col items-center text-center">
      <Medallion name={build.name} race={build.race} size={104} image={image} />
      <div className="mt-4 font-display text-xl tracking-wide text-gold-200">{build.name || 'Unnamed'}</div>
      <div className="text-sm text-parchment-400">
        {RACES[build.race].label} · {SEXES[sexMode][build.sex].label} · {startingAge(build)}, {AGES[build.age].label.toLowerCase()}
      </div>
      <div className="text-sm text-gold-300/80">{BACKGROUNDS[build.background].label}</div>

      <div className="gilt-rule my-5 w-full" />
      <div className="grid w-full grid-cols-3 gap-2 text-center">
        {[
          { label: 'Health', v: hp, c: 'text-blood-400', icon: 'heart' },
          { label: 'Stamina', v: st, c: 'text-moss-400', icon: 'bolt' },
          { label: 'Mana', v: mp, c: 'text-arcane-400', icon: 'sparkle' }
        ].map((x) => (
          <div key={x.label} className="rounded-lg border border-gold-500/15 bg-ink-850/80 py-2">
            <Icon name={x.icon} size={16} className={`mx-auto ${x.c}`} />
            <div className="font-display text-lg text-parchment-50">{x.v}</div>
            <div className="text-[0.65rem] tracking-wider text-parchment-500 uppercase">{x.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 w-full space-y-1.5">
        {ATTRS.map((a) => (
          <div key={a} className="grid grid-cols-[2.5rem_1fr_3.5rem] items-center gap-2 text-xs">
            <span className="text-left font-semibold text-parchment-300">{a}</span>
            <CapBar value={build.attributes[a]} cap={caps[a].cap} />
            <span className="text-right text-parchment-400 tabular-nums">
              {build.attributes[a]}
              <span className="text-parchment-500">/{caps[a].cap}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-left text-xs text-parchment-400">
        <span className="font-semibold text-gold-300">{RACES[build.race].trait.name}:</span> {RACES[build.race].trait.text}
      </p>
      {build.appearance && <p className="mt-3 line-clamp-6 text-left font-story text-[0.95rem] text-parchment-300 italic">{build.appearance}</p>}
      {companions.length > 0 && (
        <div className="mt-5 w-full text-left">
          <div className="mb-2 text-[0.68rem] font-semibold tracking-[0.14em] text-gold-400 uppercase">Travelling with</div>
          <div className="space-y-2">
            {companions.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 text-sm text-parchment-200">
                <Medallion name={c.name} race="human" size={34} badge={false} image={c.hasImage ? cardImageUrl(c.id) : undefined} />
                {c.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
