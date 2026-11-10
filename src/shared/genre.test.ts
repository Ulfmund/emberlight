import { describe, expect, it } from 'vitest'
import { detectGenre, resolveGenre, scifiNames } from './genre'
import { DEFAULT_SETTINGS, initialState, type CharacterBuild } from './rules'
import { narratorSystem } from '../server/ai/narrator'

const build: CharacterBuild = {
  name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
}

describe('genre', () => {
  it('reads a far-future lorebook as sci-fi, and a fantasy one as fantasy', () => {
    const grim = [
      'The hive city of Varn Secundus rises from the toxic wastes, its spires lost in smog.',
      'Guardsmen carry lasguns and flak armour; the officers favour bolt pistols.',
      'Tech-priests tend the machine spirit of every voidship in orbit.',
      'Xenos raiders strike the outer planets of the sector; heretics hide in the underhive.',
      'A servitor drones the litany as the cogitator wakes.'
    ]
    expect(detectGenre(grim)).toBe('scifi')
    expect(detectGenre(['The king rides from the castle with his knights.', 'An elven wizard keeps the forest; dwarves forge swords in the mountain.', 'The tavern in the village is full of travellers on a quest.'])).toBe('fantasy')
    // A gun or two in a fantasy world isn't enough.
    expect(detectGenre(['The pirate captain keeps a pistol in his belt.', 'The king of the island has a castle and three knights.'])).toBe('fantasy')
    expect(resolveGenre('fantasy', () => grim)).toBe('fantasy')
    expect(resolveGenre('auto', () => grim)).toBe('scifi')
    let seed = 9
    expect(scifiNames(() => ((seed = (seed * 16807) % 2147483647) / 2147483647), 4)).toHaveLength(4)
  })

  it("tells the DM it's science fiction, in the setting's terms, without the fantasy peoples' ways", () => {
    const st = initialState(build, DEFAULT_SETTINGS)
    const sci = narratorSystem(st, { ...DEFAULT_SETTINGS, genre: 'scifi' }, ['Varro'])
    expect(sci).toContain('science-fiction roleplaying game, set in a grim far future')
    expect(sci).toContain('THE SETTING IS SCIENCE FICTION, NOT FANTASY')
    expect(sci).toContain('a bow or crossbow as a rifle or pistol')
    expect(sci).not.toContain('THE PEOPLES OF THIS WORLD')
    // The gear the DM sees is in the setting's words; the money is scrip.
    expect(sci).toMatch(/Wielding: rifle/)
    expect(sci).toMatch(/\d+ scrip\./)
    expect(sci).not.toMatch(/Wielding: [^.]*bow/i)
    const fan = narratorSystem(st, DEFAULT_SETTINGS, ['Wenna'])
    expect(fan).toContain('fantasy roleplaying game')
    expect(fan).not.toContain('NOT FANTASY')
  })
})
