import type { BackgroundId, RaceId } from './tables'

/** The spells each magical calling starts with (ids from spells.ts), kept apart so state.ts can use it. */
export const STARTING_SPELLS: Partial<Record<BackgroundId, string[]>> = {
  hedgewitch: ['mend', 'hex'],
  loreward: ['spark', 'light'],
  moonsinger: ['moonveil', 'courage'],
  grovehealer: ['mend', 'thorn_lash'],
  bonecaller: ['chill_touch', 'fear'],
  runecarver: ['light', 'ward_rune'],
  acolyte: ['mend']
}

/** A new character's spells: their calling's, and elves' old blood gives everyone a light. */
export function startingSpells(background: BackgroundId, race: RaceId): string[] {
  const list = [...(STARTING_SPELLS[background] ?? [])]
  if (race === 'elf' && !list.includes('light')) list.push('light')
  return list
}
