import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, initialState, type CharacterBuild } from '@shared/rules'
import type { Provider } from '../providers'
import { ghostText, suggestActions } from './suggest'

const build: CharacterBuild = {
  name: 'Brenna Rook',
  race: 'human',
  sex: 'female',
  age: 'adult',
  background: 'hunter',
  humanBonus: ['AGI', 'WIT'],
  attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 },
  skills: {},
  appearance: '',
  personality: ''
}
const state = initialState(build, DEFAULT_SETTINGS)

/** A model that always gives the same answer, and remembers what it was asked. */
function says(answer: unknown) {
  const asked: string[] = []
  const p = {
    asked,
    async complete(_m: string, opts: { messages: { content: string }[]; schema: { parse: (x: unknown) => unknown } }) {
      asked.push(opts.messages[0].content)
      return opts.schema.parse(answer)
    }
  }
  return p as unknown as Provider & { asked: string[] }
}

describe('help with what to do', () => {
  it('offers three kinds of idea, tidied up', async () => {
    const p = says({ bold: 'Bold: I charge the bridge.', careful: '"I wait in the reeds and watch."', say: '"Who goes there?" I call.' })
    const ideas = await suggestActions(p, 'm', state, [{ role: 'assistant', content: 'A bridge, and a troll.' }])
    expect(ideas).toEqual([
      { kind: 'bold', text: 'I charge the bridge.' },
      { kind: 'careful', text: 'I wait in the reeds and watch.' },
      { kind: 'say', text: '"Who goes there?" I call.' }
    ])
    expect(p.asked[0]).toContain('A bridge, and a troll.')
    expect(p.asked[0]).toContain('Wielding Shortbow. Carrying: Shortbow, Arrows ×20, Skinning knife')
  })

  it('ghost text carries on where the player stopped, never repeating them', async () => {
    expect(await ghostText(says({ continuation: ' and nock an arrow.' }), 'm', state, [], 'I draw my bow')).toBe(' and nock an arrow.')
    // A model that echoes the start back.
    expect(await ghostText(says({ continuation: 'I draw my bow and aim at the troll' }), 'm', state, [], 'I draw my bow')).toBe(' and aim at the troll')
    // Overlap with the end of what's typed.
    expect(await ghostText(says({ continuation: 'my bow and wait' }), 'm', state, [], 'I draw my bow')).toBe(' and wait')
    // After a space, no extra space; at most twelve words.
    expect(await ghostText(says({ continuation: ' one two three four five six seven eight nine ten eleven twelve thirteen' }), 'm', state, [], 'I count ')).toBe('one two three four five six seven eight nine ten eleven twelve')
    expect(await ghostText(says({ continuation: '' }), 'm', state, [], 'I wait.')).toBe('')
  })
})
