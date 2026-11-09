import { BACKGROUNDS, type BackgroundId, type CampaignSettings, type CharacterBuild, type RaceId } from './rules'

/**
 * The peoples' ways (docs/spec/06-ai-dm.md#the-peoples-ways): how humans, dwarves and elves
 * live, what they expect of men and women, and what they think of the other peoples. The DM is
 * told them as the world's defaults; a world's own lore may say otherwise. The customs about
 * men's and women's work follow the campaign's sex setting: with it off, they're left out (the
 * rest stays). The whole block can be switched off in the campaign settings.
 */

export type Culture = {
  /** Who they are, whatever the sex setting. */
  ways?: string
  /** What they expect of men and women (only with the realistic sex setting). */
  customs?: string
}

export const CULTURES: Partial<Record<RaceId, Culture>> = {
  human: {
    ways: 'Humans are the most numerous people, and their customs differ from nation to nation and from city to village.',
    customs:
      'They keep strict roles for men and women and look askance at anyone who breaks them, though how strict depends on the nation and the place. The big cities are a little looser: a woman may keep a shop or the accounts, or speak at a guild meeting. In the countryside and small towns the old ways hold: men plough, smith, soldier and lead; women keep the house, the hearth, the herbs and the children. Magic is the exception: more and more human mages are women, and that is accepted. Human women mostly prefer work that is neither fighting nor heavy labour.'
  },
  dwarf: {
    customs:
      "Dwarves keep strict roles for men and women and look askance at anyone, of any people, who breaks them. They are fiercely protective of their women, who are rarely seen outside the holds; a stranger who asks after them is not welcome. Inside the holds, dwarf women work as hard as the men, as record-keepers, cooks, mystics, weavers and leatherworkers. They are every bit as diligent, and the work is divided rather than shared, so nobody steps on anybody's toes."
  },
  elf: {
    ways:
      'Elves are haughty, condescending and certain they are better than every other people, and mostly they are right. There are few of them, so they never spend elven lives needlessly. To an elf, insulting the other peoples is not rudeness but a necessity, and they do it often and well. Play their scorn straight: sincere, cutting and dignified. The player may find it funny, but in the world it is no joke, and only very rarely should the telling let the humour show.',
    customs: 'They send their women to fight the other peoples without a second thought, knowing that losing to a woman is a double humiliation for a human or a dwarf, and they make the most of it.'
  }
}

const PLURAL: Partial<Record<RaceId, string>> = { human: 'Humans', dwarf: 'Dwarves', elf: 'Elves' }

/** Trades that, by a people's customs, belong to the other sex (for the player character's line). */
const ROLES: Partial<Record<RaceId, { mens: BackgroundId[]; womens: BackgroundId[] }>> = {
  human: { mens: ['smith', 'hunter', 'sellsword'], womens: ['hedgewitch'] },
  dwarf: { mens: ['delver', 'smith', 'shieldbearer'], womens: ['namekeeper'] }
}

/**
 * How the peoples see the player character, when their ways make them stand out: a dwarf woman
 * on the road, a woman hunting in a human village, an elf anywhere. The general line alone
 * wasn't enough for a model to notice (a real run had a village shrug at a woman with a bow).
 */
export function playerAmongPeoples(b: Pick<CharacterBuild, 'name' | 'race' | 'sex' | 'background'>, settings: Pick<CampaignSettings, 'sexModifiers'>): string {
  const customs = settings.sexModifiers === 'realistic'
  const trade = BACKGROUNDS[b.background].label.toLowerCase()
  const roles = ROLES[b.race]
  const out: string[] = []
  if (b.race === 'elf') out.push(`${b.name} is an elf: the other peoples expect scorn from ${b.sex === 'female' ? 'her' : 'him'}, and meet ${b.sex === 'female' ? 'her' : 'him'} with wariness, resentment or awe.`)
  if (customs && b.race === 'elf' && b.sex === 'female') out.push('Among elves a woman who fights is nothing unusual; a human or dwarf who loses to her takes it doubly hard.')
  if (customs && b.race === 'dwarf' && b.sex === 'female') out.push(`${b.name} is a dwarf woman away from the holds, a rare sight: dwarves who meet her are shocked, protective or disapproving, and want to know why she left.`)
  if (customs && b.sex === 'female' && roles?.mens.includes(b.background)) {
    out.push(
      b.race === 'dwarf'
        ? `Her trade (${trade}) is men's work besides.`
        : `${b.name} is a woman working as ${/^[aeiou]/.test(trade) ? 'an' : 'a'} ${trade}, which most humans think is men's work: in the countryside and small towns people stare, doubt her, haggle harder or give advice nobody asked for; in the big cities, a little less.`
    )
  }
  if (customs && b.sex === 'male' && roles?.womens.includes(b.background)) out.push(`${b.name} is a man in a trade his people think of as women's work (${trade}), and people remark on it.`)
  return out.join(' ')
}

/** The DM's block on the peoples, or nothing when it's switched off. */
export function peoplesBlock(settings: Pick<CampaignSettings, 'cultures' | 'sexModifiers'>, player?: Pick<CharacterBuild, 'name' | 'race' | 'sex' | 'background'>): string {
  if (settings.cultures === false) return ''
  const lines: string[] = []
  for (const [race, c] of Object.entries(CULTURES) as [RaceId, Culture][]) {
    const text = [c.ways, settings.sexModifiers === 'realistic' ? c.customs : undefined].filter(Boolean).join(' ')
    if (text) lines.push(`- ${PLURAL[race]}: ${text}`)
  }
  if (!lines.length) return ''
  const pc = player ? playerAmongPeoples(player, settings) : ''
  return `THE PEOPLES OF THIS WORLD (unless this world's own lore says otherwise)
${lines.join('\n')}
These ways apply to the player character too: people react to who they are and to what they do.${pc ? ` ${pc}` : ''}`
}
