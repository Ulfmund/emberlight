import { create } from 'zustand'

/**
 * Preferences for this device only (each phone or computer keeps its own): how the interface
 * looks, sounds and helps. Saved in the browser's local storage.
 */
export type Prefs = {
  /** Ghost text: a greyed-out continuation of what you're typing (costs a little model time). */
  ghost: boolean
}

const KEY = 'emberlight.prefs'
const DEFAULTS: Prefs = { ghost: false }

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
