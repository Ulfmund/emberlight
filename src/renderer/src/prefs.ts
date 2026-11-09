import { create } from 'zustand'

/**
 * Preferences for this device only (each phone or computer keeps its own): how the interface
 * looks, sounds and helps. Saved in the browser's local storage.
 */
export type Effects = 'full' | 'subtle' | 'off'

export type Prefs = {
  /** Ghost text: a greyed-out continuation of what you're typing (costs a little model time). */
  ghost: boolean
  /** Animation and particles (docs/spec/08-ui-ux.md#feel-and-animation-juice). */
  effects: Effects
  /** A jolt of the screen when a big hit lands. */
  screenShake: boolean
  /** Sound effects, and how loud (0 to 1). */
  sound: boolean
  volume: number
  /** Music and ambient sound, how loud (0 to 1); and everything off at once. */
  musicVolume: number
  ambienceVolume: number
  muted: boolean
  /** Phones: shake to throw the dice. */
  shake: boolean
}

const KEY = 'emberlight.prefs'
const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const DEFAULTS: Prefs = { ghost: false, effects: reduced ? 'subtle' : 'full', screenShake: !reduced, sound: true, volume: 0.6, shake: true, musicVolume: 0.5, ambienceVolume: 0.6, muted: false }

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) }
  } catch {
    return DEFAULTS
  }
}

export const usePrefs = create<Prefs & { set(p: Partial<Prefs>): void }>((set, get) => ({
  ...load(),
  set: (p) => {
    set(p)
    const { set: _set, ...rest } = get()
    try {
      localStorage.setItem(KEY, JSON.stringify(rest))
    } catch {
      /* private browsing: preferences last for this visit only */
    }
  }
}))

/** Effects in use right now (the setting, and "subtle" at most when the OS asks for less motion). */
export function effectsLevel(): Effects {
  const e = usePrefs.getState().effects
  return reduced && e === 'full' ? 'subtle' : e
}
export const useEffectsLevel = (): Effects => {
  const e = usePrefs((p) => p.effects)
  return reduced && e === 'full' ? 'subtle' : e
}

/** A phone or tablet (no mouse to hover with). */
export const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches
