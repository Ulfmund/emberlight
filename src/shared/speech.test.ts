import { describe, expect, it } from 'vitest'
import { tidySpeech } from './speech'

describe('speech tags', () => {
  it('takes a tag out of the middle of a sentence or a quotation', () => {
    // As the friend saw it: the player character tagged inside an old man's advice.
    expect(tidySpeech(`He scratches his beard, shaking his head. "@Branmund: "And don't take less than so-and-so, whatever you're offered."`, 'Branmund Holt')).toBe(
      `He scratches his beard, shaking his head. "And don't take less than so-and-so, whatever you're offered."`
    )
    // Anyone's name, the same way.
    expect(tidySpeech(`She laughs. "@Wenna: Not likely."`, 'Branmund')).toBe(`She laughs. "Not likely."`)
    expect(tidySpeech(`She laughs. @Wenna: Not likely.`, 'Branmund')).toBe(`She laughs. Not likely.`)
    // In the middle of a sentence it's a mention: the name stays.
    expect(tidySpeech(`He turns to @Old Tam: "Is the road safe?"`, 'Branmund')).toBe(`He turns to Old Tam: "Is the road safe?"`)
  })

  it('keeps speech lines, and puts a second speaker on a line of their own', () => {
    expect(tidySpeech(`The old man spits.\n@Old Tam: "Road's not safe after dark."`, 'Branmund')).toBe(`The old man spits.\n@Old Tam: "Road's not safe after dark."`)
    expect(tidySpeech(`The old man spits. @Old Tam: "Road's not safe."`, 'Branmund')).toBe(`The old man spits.\n@Old Tam: "Road's not safe."`)
    expect(tidySpeech(`@Old Tam: "Road's not safe." @Wenna: "It never is."`, 'Branmund')).toBe(`@Old Tam: "Road's not safe."\n@Wenna: "It never is."`)
    expect(tidySpeech(`@Old Tam: "Road's not safe."@Wenna: "It never is."`, 'Branmund')).toBe(`@Old Tam: "Road's not safe."\n@Wenna: "It never is."`)
  })

  it('tidies a speech line in bold or behind a quote mark', () => {
    expect(tidySpeech(`**@Old Tam:** "Road's not safe."`)).toBe(`@Old Tam: "Road's not safe."`)
    expect(tidySpeech(`*@Old Tam*: "Road's not safe."`)).toBe(`@Old Tam: "Road's not safe."`)
    expect(tidySpeech(`"@Old Tam: "Road's not safe."`)).toBe(`@Old Tam: "Road's not safe."`)
    expect(tidySpeech(`"@Old Tam: Road's not safe."`)).toBe(`@Old Tam: "Road's not safe."`)
  })

  it('never gives the player character a speech line', () => {
    expect(tidySpeech(`The reeve nods.\n@Branmund: "And don't trust the miller."`, 'Branmund Holt')).toBe(`The reeve nods.\n"And don't trust the miller."`)
    expect(tidySpeech(`The reeve nods. @Branmund: "Don't trust the miller."`, 'Branmund')).toBe(`The reeve nods. "Don't trust the miller."`)
  })

  it('drops the @ from a mention, and leaves other text alone', () => {
    expect(tidySpeech(`"Listen, @Branmund, the reeve's at the mill."`, 'Branmund')).toBe(`"Listen, Branmund, the reeve's at the mill."`)
    const plain = `Rain on the road.\n\n@Old Tam: "Write to tam@millbrook if you must."\nHe walks off.`
    expect(tidySpeech(plain, 'Branmund')).toBe(plain)
    expect(tidySpeech('No tags at all.')).toBe('No tags at all.')
  })
})
