import { AGE_SCALE, AGES, ageBands, ageRange, stageAt, type AgeId, type RaceId } from '@shared/rules'

/**
 * An age in years on a slider (docs/spec/03-characters-and-cards.md#character-creator): the
 * creator's for an adventurer, the Journal's for anyone. The stage of life it falls in, which
 * sets an adventurer's limits, shows beside the number; the track is marked where each stage
 * begins for this people (an elf of 135 is a young adult).
 */
export function AgeSlider({
  race,
  value,
  onChange,
  who,
  disabled = false,
  unknown = false,
  label = 'Age in years'
}: {
  race: RaceId
  value: number
  onChange: (years: number) => void
  who: 'adventurer' | 'anyone'
  disabled?: boolean
  /** Not known yet: the slider sits at a typical age, dimmed, until it's moved. */
  unknown?: boolean
  label?: string
}) {
  const { min, max } = ageRange(race, who)
  const v = Math.min(max, Math.max(min, Math.round(value)))
  const span = Math.max(1, max - min)
  const at = (years: number) => `${((years - min) / span) * 100}%`
  // Where each stage begins (and, for anyone, where childhood ends).
  const marks = ageBands(race, who)
    .map((b) => b.from)
    .filter((from) => from > min)
  const grown = Math.round(16 * (AGE_SCALE[race] ?? 1))
  if (who === 'anyone' && grown > min && !marks.includes(grown)) marks.push(grown)
  return (
    <div className={unknown ? 'opacity-60' : undefined}>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-2xl tracking-wide text-parchment-50 tabular-nums">{unknown ? '?' : v}</span>
        <span className="text-sm text-gold-300">{unknown ? 'Not known' : stageLabel(v, race, who)}</span>
      </div>
      <div className="relative mt-1">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={v}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          aria-valuetext={unknown ? 'Not known' : `${v} years, ${stageLabel(v, race, who).toLowerCase()}`}
          className="no-drag relative z-10 h-8 w-full cursor-pointer accent-[var(--color-gold-400)] disabled:cursor-default disabled:opacity-60 touch:h-10"
        />
        <div className="pointer-events-none absolute inset-x-2 bottom-0 h-1.5">
          {marks.map((m) => (
            <span key={m} className="absolute top-0 h-1.5 w-px bg-gold-400/50" style={{ left: at(m) }} />
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[0.68rem] text-parchment-500 tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

/** "Adult", or for the Journal, "Child" before someone has come of age. */
export function stageLabel(years: number, race: RaceId, who: 'adventurer' | 'anyone'): string {
  if (who === 'anyone' && years / (AGE_SCALE[race] ?? 1) < 16) return years / (AGE_SCALE[race] ?? 1) < 2 ? 'Baby' : 'Child'
  return AGES[stageAt(years, race)].label
}

/** The years a stage of life spans for this people ("21–35"). */
export function stageYears(age: AgeId, race: RaceId): string {
  const band = ageBands(race, 'adventurer').find((b) => b.age === age)
  if (!band) return ''
  const { max } = ageRange(race, 'adventurer')
  return band.to >= max ? `${band.from}+` : `${band.from}–${band.to}`
}
