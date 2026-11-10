import { useState } from 'react'
import { motion } from 'motion/react'
import {
  ATTRS,
  BACKGROUNDS,
  fitBuild,
  generateName,
  RACE_IDS,
  RACES,
  SEXES,
  SKILL_IDS,
  SKILLS,
  startingAge,
  startingSkillLevel,
  wishesFromCalling,
  type CharacterBuild,
  type SexMode
} from '@shared/rules'
import { APPEARANCE_IDEAS, callingFor, PERSONALITY_IDEAS } from '@shared/people'
import { api } from '../api'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { AgeSlider } from '../components/AgeSlider'

const pick = (xs: string[], now: string) => {
  const rest = xs.filter((x) => x !== now)
  return rest[Math.floor(Math.random() * rest.length)] ?? now
}

/**
 * The Quick Hero (docs/spec/03-characters-and-cards.md#quick-hero): one page in the player's own
 * words, and the AI suggests the stats to match. Sex stays a choice of two (its limits matter to
 * everyone in the world), and the people one of the five (each has its own limits). The stats
 * can be changed afterwards in the step-by-step creator.
 */
export function QuickHero({
  build,
  update,
  sexMode,
  suggested,
  onSuggested,
  onAdjust,
  ageFixed
}: {
  build: CharacterBuild
  update: (p: Partial<CharacterBuild>) => void
  sexMode: SexMode
  suggested: boolean
  onSuggested: () => void
  onAdjust: () => void
  ageFixed: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (p: Partial<CharacterBuild>) => update(p)

  const suggest = async () => {
    setBusy(true)
    setError('')
    try {
      const wishes = await api.heroSuggest({
        race: build.race,
        sex: build.sex,
        years: startingAge(build),
        job: build.job ?? '',
        appearance: build.appearance,
        personality: build.personality,
        details: build.details ?? ''
      })
      update(fitBuild(build, wishes, sexMode))
      onSuggested()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  // Without the AI: what the calling closest to their job leans on.
  const byCalling = () => {
    update(fitBuild(build, wishesFromCalling(callingFor(build.job, build.race) ?? build.background), sexMode))
    setError('')
    onSuggested()
  }

  const best = SKILL_IDS.map((s) => [s, startingSkillLevel(build, s)] as const)
    .filter(([, l]) => l > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <>
      <div className="mb-6">
        <h2 className="font-display text-3xl tracking-wider text-gold-300">Quick Hero</h2>
        <p className="mt-1 text-parchment-400">Describe your hero in your own words. The AI suggests stats to match, and you can change them after.</p>
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <span className="relative block">
              <input value={build.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder="Your hero's name" className="input pr-11 font-display tracking-wide" />
              <Dice onClick={() => set({ name: generateName(Math.random, build.race, build.sex) })} title="Suggest a name" />
            </span>
          </Field>
          <Field label="Sex">
            <Toggle value={build.sex} onChange={(sex) => set({ sex })} options={(['male', 'female'] as const).map((s) => ({ id: s, label: SEXES[sexMode][s].label }))} />
          </Field>
        </div>
        <Field label="Race">
          <Toggle value={build.race} onChange={(race) => set({ race })} options={RACE_IDS.map((r) => ({ id: r, label: RACES[r].label }))} />
        </Field>
        <Field label="Age">
          <div className="rounded-xl border border-gold-500/15 bg-ink-850/60 px-4 py-3">
            <AgeSlider race={build.race} value={startingAge(build)} onChange={(years) => set({ years })} who="adventurer" disabled={ageFixed} />
          </div>
        </Field>
        <Field label="Job">
          <input value={build.job ?? ''} onChange={(e) => set({ job: e.target.value })} maxLength={80} placeholder="Sellsword, apothecary, scholar…" className="input" />
        </Field>
        <Field label="Appearance">
          <span className="relative block">
            <textarea value={build.appearance} onChange={(e) => set({ appearance: e.target.value })} maxLength={8000} rows={3} placeholder="Build, hair, eyes, scars, clothing…" className="input resize-y pr-11 font-story text-[1.02rem]" />
            <Dice onClick={() => set({ appearance: pick(APPEARANCE_IDEAS, build.appearance) })} title="Suggest an appearance" top />
          </span>
        </Field>
        <Field label="Personality">
          <span className="relative block">
            <textarea value={build.personality} onChange={(e) => set({ personality: e.target.value })} maxLength={4000} rows={3} placeholder="How they come across, their manner, how they speak…" className="input resize-y pr-11 font-story text-[1.02rem]" />
            <Dice onClick={() => set({ personality: pick(PERSONALITY_IDEAS, build.personality) })} title="Suggest a personality" top />
          </span>
        </Field>
        <Field label="Extra Details">
          <textarea value={build.details ?? ''} onChange={(e) => set({ details: e.target.value })} maxLength={4000} rows={3} placeholder="Anything else the world should know about them" className="input resize-y font-story text-[1.02rem]" />
        </Field>

        <div className="rounded-xl border border-gold-500/20 bg-ink-900/60 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={suggested ? 'secondary' : 'primary'} icon="sparkle" onClick={() => void suggest()} disabled={busy}>
              {busy ? 'Reading your hero…' : suggested ? 'Suggest Again' : 'Suggest Stats'}
            </Button>
            {suggested && (
              <Button variant="ghost" icon="sliders" onClick={onAdjust}>
                Adjust Stats
              </Button>
            )}
          </div>
          {error && (
            <p className="mt-2 text-sm text-blood-400">
              {error}{' '}
              <button type="button" onClick={byCalling} className="no-drag cursor-pointer text-gold-300 underline hover:text-gold-200">
                Use their calling's stats instead
              </button>
            </p>
          )}
          {suggested && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-1.5 text-sm">
              <p className="text-parchment-200">
                <span className="text-parchment-500">Calling:</span> {BACKGROUNDS[build.background].label}
                {build.job?.trim() && <span className="text-parchment-500"> (the closest to {build.job.trim().toLowerCase()})</span>}
              </p>
              <p className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                {ATTRS.map((a) => (
                  <span key={a} className={build.attributes[a] >= 14 ? 'text-gold-200' : build.attributes[a] <= 8 ? 'text-parchment-500' : 'text-parchment-300'}>
                    {a} {build.attributes[a]}
                  </span>
                ))}
              </p>
              {best.length > 0 && <p className="text-parchment-400">{best.map(([s, l]) => `${SKILLS[s].label} ${l}`).join(' · ')}</p>}
            </motion.div>
          )}
          {!suggested && !error && <p className="mt-2 text-xs text-parchment-500">Until then, your hero has a random set of stats.</p>}
        </div>
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">{label}</span>
      {children}
    </label>
  )
}

function Toggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`no-drag cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors touch:py-2 ${value === o.id ? 'border-gold-300 bg-gold-400/20 text-gold-100' : 'border-gold-500/20 text-parchment-300 hover:text-gold-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Dice({ onClick, title, top = false }: { onClick: () => void; title: string; top?: boolean }) {
  return (
    <motion.button
      type="button"
      whileTap={{ rotate: 180, scale: 0.85 }}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`no-drag absolute right-2 cursor-pointer rounded-md p-1.5 text-gold-400 hover:bg-white/5 hover:text-gold-200 ${top ? 'top-2' : 'top-1/2 -translate-y-1/2'}`}
    >
      <Icon name="d20" size={17} />
    </motion.button>
  )
}
