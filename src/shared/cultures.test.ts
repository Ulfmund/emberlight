import { describe, expect, it } from 'vitest'
import { peoplesBlock, playerAmongPeoples } from './cultures'
import { promptBlocks } from './inspect'
import { DEFAULT_SETTINGS, initialState, type CharacterBuild } from './rules'
import { narratorSystem } from '../server/ai/narrator'

const build: CharacterBuild = {
  name: 'Thrain Ashfall', race: 'dwarf', sex: 'female', age: 'adult', background: 'hunter', humanBonus: [],
  attributes: { STR: 12, AGI: 12, END: 13, INT: 10, ARC: 8, WIT: 12, PRE: 10 }, skills: {}, appearance: '', personality: ''
}

describe("the peoples' ways", () => {
  it('tells the DM how humans, dwarves and elves live, and what they expect of men and women', () => {
    const block = peoplesBlock(DEFAULT_SETTINGS)
    expect(block).toMatch(/^THE PEOPLES OF THIS WORLD \(unless this world's own lore says otherwise\)/)
    expect(block).toMatch(/- Humans: .*big cities are a little looser.*more and more human mages are women/)
    expect(block).toMatch(/- Dwarves: .*rarely seen outside the holds.*record-keepers, cooks, mystics, weavers and leatherworkers/)
    expect(block).toMatch(/- Elves: Elves are haughty.*Play their scorn straight.*losing to a woman is a double humiliation/)
    expect(block).toMatch(/apply to the player character too/)
  })

  it("leaves out the customs about men and women when sex differences are off, and everything when it's switched off", () => {
    const off = peoplesBlock({ ...DEFAULT_SETTINGS, sexModifiers: 'off' })
    expect(off).toContain('- Elves: Elves are haughty')
    expect(off).toContain('- Humans: Humans are the most numerous people')
    expect(off).not.toMatch(/women|Dwarves:/)
    expect(peoplesBlock({ ...DEFAULT_SETTINGS, cultures: false })).toBe('')
  })

  it('says how the peoples see the player character, when their ways make them stand out', () => {
    const R = DEFAULT_SETTINGS
    expect(playerAmongPeoples(build, R)).toMatch(/^Thrain Ashfall is a dwarf woman away from the holds, a rare sight/)
    expect(playerAmongPeoples({ ...build, background: 'shieldbearer' }, R)).toMatch(/Her trade \(hold shieldbearer\) is men's work besides\.$/)
    expect(playerAmongPeoples({ ...build, name: 'Marta', race: 'human', background: 'hunter' }, R)).toMatch(/^Marta is a woman working as a hunter, which most humans think is men's work/)
    expect(playerAmongPeoples({ ...build, name: 'Marta', race: 'human', background: 'smith' }, R)).toMatch(/^Marta is a woman working as an apprentice smith/)
    expect(playerAmongPeoples({ ...build, name: 'Marta', race: 'human', background: 'hedgewitch' }, R)).toBe('')
    expect(playerAmongPeoples({ ...build, name: 'Oswin', race: 'human', sex: 'male', background: 'hedgewitch' }, R)).toMatch(/a man in a trade his people think of as women's work \(hedge witch\)/)
    expect(playerAmongPeoples({ ...build, name: 'Ilvaine', race: 'elf', background: 'bladedancer' }, R)).toMatch(/expect scorn from her.*takes it doubly hard/)
    // Without sex differences, only what isn't about men and women is left.
    expect(playerAmongPeoples(build, { sexModifiers: 'off' })).toBe('')
    expect(playerAmongPeoples({ ...build, name: 'Ilvaine', race: 'elf', background: 'bladedancer' }, { sexModifiers: 'off' })).toBe('Ilvaine is an elf: the other peoples expect scorn from her, and meet her with wariness, resentment or awe.')
    expect(peoplesBlock(R, build)).toMatch(/to what they do\. Thrain Ashfall is a dwarf woman/)
  })

  it("is its own part of what the DM sees, before the player character", () => {
    const st = initialState(build, DEFAULT_SETTINGS)
    const blocks = promptBlocks(narratorSystem(st, DEFAULT_SETTINGS, []))
    const titles = blocks.map((b) => b.title)
    expect(titles).toContain('The peoples of this world')
    expect(titles.indexOf('The peoples of this world')).toBeLessThan(titles.indexOf('The player character'))
    const quiet = promptBlocks(narratorSystem(st, { ...DEFAULT_SETTINGS, cultures: false }, [])).map((b) => b.title)
    expect(quiet).not.toContain('The peoples of this world')
  })
})
