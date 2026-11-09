import type { Rng } from './character'
import type { RaceId, SexId } from './tables'

/**
 * Culture-flavoured name generator (docs/spec/06-ai-dm.md#names-and-banned-words).
 * Built from syllables so names feel related within a race without repeating.
 */
type Parts = { start: string[]; mid: string[]; end: Record<SexId, string[]>; surname: string[] }

const PARTS: Record<RaceId, Parts> = {
  human: {
    start: ['Al', 'Bran', 'Cer', 'Da', 'Ed', 'Gar', 'Hal', 'Is', 'Jor', 'Mar', 'Ned', 'Os', 'Rho', 'Sib', 'Tam', 'Wil', 'Bet', 'Col', 'Fen', 'Mae'],
    mid: ['', '', 'e', 'a', 'ri', 'wy', 'li', 'do'],
    end: { male: ['ric', 'win', 'ton', 'mund', 'bert', 'ard', 'ock', 'en'], female: ['wen', 'ith', 'a', 'is', 'ette', 'ly', 'na', 'ra'] },
    surname: ['Ashby', 'Brook', 'Cotter', 'Dunmore', 'Fallow', 'Greaves', 'Hollin', 'Marsh', 'Pell', 'Rook', 'Sallow', 'Thatcher', 'Wren', 'Yarrow']
  },
  dwarf: {
    start: ['Bar', 'Bor', 'Dur', 'Grim', 'Hal', 'Kor', 'Mor', 'Thor', 'Ul', 'Vond', 'Brun', 'Dag', 'Hild', 'Ing'],
    mid: ['', '', 'a', 'i', 'o'],
    end: { male: ['in', 'grim', 'dak', 'rek', 'li', 'gar', 'mund'], female: ['dis', 'hild', 'a', 'run', 'rid', 'wyn'] },
    surname: ['Anvilborn', 'Deepdelver', 'Stonehand', 'Coalbeard', 'Ironvein', 'Hammerfell', 'Greyforge', 'Oakenshield']
  },
  elf: {
    start: ['Ae', 'Cal', 'Eri', 'Fae', 'Ith', 'Lae', 'Mir', 'Nai', 'Syl', 'Thal', 'Vae', 'Yl', 'Ser', 'Ilu'],
    mid: ['', 'a', 'ri', 'the', 'lo', 'ni'],
    end: { male: ['rion', 'dil', 'ndor', 'thas', 'vir', 'las'], female: ['wyn', 'iel', 'ra', 'nis', 'thae', 'liss'] },
    surname: ['of the Silverwood', 'Moonwhisper', 'Starbough', 'of Ithrael', 'Dawnmere', 'Leafsong']
  },
  halfling: {
    start: ['Bil', 'Cor', 'Dun', 'Fol', 'Hob', 'Mer', 'Nel', 'Pip', 'Ros', 'Tod', 'Wil', 'Lob', 'Pim', 'Dais'],
    mid: ['', '', 'o', 'i'],
    end: { male: ['bo', 'do', 'kin', 'ry', 'wick', 'ger'], female: ['ly', 'sy', 'ie', 'bell', 'ana', 'wise'] },
    surname: ['Underhay', 'Brandybank', 'Goodbarrel', 'Tealeaf', 'Hollowbottom', 'Applecross', 'Burrows']
  },
  orc: {
    start: ['Gor', 'Kra', 'Mug', 'Ruk', 'Shag', 'Thrak', 'Uz', 'Grosh', 'Yag', 'Bol', 'Dra', 'Ghar'],
    mid: ['', '', 'a', 'u'],
    end: { male: ['ash', 'gul', 'nak', 'rok', 'th', 'zug'], female: ['ra', 'sha', 'ka', 'gra', 'zha', 'nai'] },
    surname: ['Skullsplitter', 'of the Red Hand', 'Bonechewer', 'Ironjaw', 'the Scarred', 'Ashfang']
  }
}

/** Names that language models overuse. Never generated, and swapped out of DM text. */
export const BANNED_NAMES = [
  'Kael', 'Elara', 'Lyra', 'Seraphina', 'Thorne', 'Aria', 'Kira', 'Zephyr', 'Elias', 'Eldric', 'Aldric',
  'Vex', 'Lira', 'Elowen', 'Kaelen', 'Mira', 'Aelin', 'Theron', 'Lysandra', 'Isolde', 'Rowan', 'Selene'
]
const BANNED = new Set(BANNED_NAMES.map((n) => n.toLowerCase()))

const p = <T>(rng: Rng, xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]

export function generateName(rng: Rng, race: RaceId, sex: SexId, withSurname = true): string {
  const parts = PARTS[race]
  for (let i = 0; i < 20; i++) {
    const first = (p(rng, parts.start) + p(rng, parts.mid) + p(rng, parts.end[sex]))
      .toLowerCase()
      // Smooth awkward joins: no doubled vowels ("Edaa") or triple letters.
      .replace(/([aeiouy])\1+/g, '$1')
      .replace(/(.)\1\1+/g, '$1$1')
    const clean = first.charAt(0).toUpperCase() + first.slice(1)
    if (BANNED.has(clean.toLowerCase()) || clean.length < 3 || clean.length > 11) continue
    return withSurname ? `${clean} ${p(rng, parts.surname)}` : clean
  }
  return withSurname ? `Tam ${p(rng, parts.surname)}` : 'Tam'
}

/** A handful of fresh names for the narrator to use for new characters. */
export function nameSuggestions(rng: Rng, count = 6): string[] {
  const races = Object.keys(PARTS) as RaceId[]
  const out = new Set<string>()
  let guard = 0
  while (out.size < count && guard++ < 100) {
    const race = rng() < 0.6 ? 'human' : p(rng, races)
    out.add(generateName(rng, race, rng() < 0.5 ? 'male' : 'female', false))
  }
  return [...out]
}
