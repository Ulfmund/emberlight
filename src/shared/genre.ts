import type { Rng } from './rules'

/**
 * The story's genre (docs/spec/06-ai-dm.md#genre): fantasy, or grimdark science fiction. On Auto
 * it's read from the world's lorebooks, so a far-future lorebook makes it science fiction without
 * a word. The rules stay the same; the DM tells them in the setting's terms, the names fit, and
 * the story screen takes on the look.
 */
export type Genre = 'fantasy' | 'scifi'
export type GenreSetting = 'auto' | Genre
export const GENRE_LABEL: Record<Genre, string> = { fantasy: 'Fantasy', scifi: 'Sci-Fi' }

const SCIFI = /\b(star ?ships?|space ?ships?|void ?ships?|the void|warp ?(drive|travel|storm|space)?|hyperspace|faster than light|ftl|planets?|planetary|orbit(al)?|galax(y|ies|tic)|star systems?|sectors?|segmentum|hive (world|city|cities|spire)s?|hive ?gangs?|forge worlds?|space marines?|imperium|imperial guard|astra militarum|astartes|xenos|aliens?|lasguns?|las-?(rifles?|pistols?|guns?|weapons?)|bolters?|bolt (pistols?|guns?|rounds?)|autoguns?|stub ?guns?|plasma|melta|power armou?r|flak armou?r|augmetic(s)?|bionic(s)?|cybernetic(s)?|servitors?|cogitators?|data-?slates?|vox|auspex|mechanicus|tech-?priests?|machine spirit|inquisit(or|ion)|heretic(s|al)?|heresy|psykers?|navigators?|rogue traders?|chaos (marines?|gods?)|daemons?|robots?|androids?|lasers?|blasters?|rifles?|pistols?|grenades?|shuttles?|starports?|spaceports?|reactors?|terminals?|computers?)\b/gi
const FANTASY = /\b(swords?|castles?|kings?|queens?|knights?|dragons?|elves|elven|wizards?|witch(es)?|sorcer(er|ers|ess)|magic|spells?|taverns?|inns?|villages?|kingdoms?|duchy|lords?|bows?|arrows?|forests?|goblins?|trolls?|dwarves|quests?|crowns?|realms?)\b/gi

/** Sci-fi or fantasy, from a world's lore (names, keys and text), by which it talks of more. */
export function detectGenre(texts: string[]): Genre {
  let sci = 0
  let fan = 0
  for (const t of texts) {
    sci += t.match(SCIFI)?.length ?? 0
    fan += t.match(FANTASY)?.length ?? 0
  }
  return sci >= 6 && sci > fan * 1.2 ? 'scifi' : 'fantasy'
}

export const resolveGenre = (setting: GenreSetting | undefined, texts: () => string[]): Genre => (setting === 'fantasy' || setting === 'scifi' ? setting : detectGenre(texts()))

/**
 * The rules' fantasy gear and money, in far-future words, for the DM's view of the character (a
 * "Shortbow" is a rifle, "12 silver" is scrip). The rules underneath don't change.
 */
const TERMS: [RegExp, string][] = [
  [/\b(long|short|broad|great|arming|bastard)?swords?\b/gi, 'combat blade'],
  [/\b(battle|great|hand|war)?axes?\b/gi, 'chain-axe'],
  [/\b(daggers?|dirks?|knives)\b/gi, 'combat knife'],
  [/\b(spears?|pikes?|halberds?)\b/gi, 'shock maul'],
  [/\b(maces?|clubs?|hammers?|warhammers?)\b/gi, 'power maul'],
  [/\b(long|short|hunting)?bows?\b/gi, 'rifle'],
  [/\bcrossbows?\b/gi, 'stub rifle'],
  [/\bslings?\b/gi, 'autopistol'],
  [/\b(arrows?|bolts?|sling stones?|stones)\b/gi, 'rifle rounds'],
  [/\b(leather|chain|scale|plate|padded) (armou?r|mail|shirt)\b/gi, 'flak armour'],
  [/\bshields?\b/gi, 'blast shield'],
  [/\b(healing |minor |greater )?potions?( of healing)?\b/gi, 'medi-stimm'],
  [/\b(herbs?|poultices?|salves?)\b/gi, 'medicae supplies'],
  [/\btravel rations?\b/gi, 'ration bricks'],
  [/\btorch(es)?\b/gi, 'glow-lamp'],
  [/\bspellbooks?\b/gi, 'data-slate'],
  [/\bpitchforks?\b/gi, 'shock prod']
]
export const scifiTerms = (text: string) => TERMS.reduce((t, [re, to]) => t.replace(re, to), text)

/** Gothic far-future names, for the DM to draw on (Latin and old-world roots, worn down by time). */
const SCIFI_FIRST = {
  male: ['Varro', 'Ignatius', 'Castor', 'Severin', 'Hadrian', 'Corvus', 'Tybalt', 'Marius', 'Lucan', 'Oberon', 'Dravik', 'Kasimir', 'Thaddeus', 'Ozman', 'Remus', 'Gallus', 'Sigmar', 'Brannoc', 'Jerrod', 'Vossic'],
  female: ['Kassia', 'Thessaly', 'Livia', 'Octavia', 'Severa', 'Ilsabet', 'Marta', 'Junia', 'Orsola', 'Verity', 'Cassiel', 'Agathe', 'Nerys', 'Talia', 'Halvarra', 'Prudence', 'Mireth', 'Drusa', 'Lucretia', 'Esk']
}
const SCIFI_LAST = ['Vane', 'Kord', 'Harrowgate', 'Malvex', 'Durant', 'Sollus', 'Thrane', 'Krell', 'Voss', 'Castellan', 'Morrow', 'Graves', 'Ashkarn', 'Tull', 'Ferrox', 'Daskar', 'Venn', 'Holloway', 'Strake', 'Orlov']

export function scifiNames(rng: Rng, count = 6): string[] {
  const out = new Set<string>()
  for (let i = 0; out.size < count && i < 60; i++) {
    const firsts = rng() < 0.5 ? SCIFI_FIRST.male : SCIFI_FIRST.female
    const first = firsts[Math.floor(rng() * firsts.length)]
    out.add(rng() < 0.5 ? `${first} ${SCIFI_LAST[Math.floor(rng() * SCIFI_LAST.length)]}` : first)
  }
  return [...out]
}
