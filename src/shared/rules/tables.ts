/**
 * The built-in fantasy ruleset's data (docs/spec/04-rules-system.md).
 * All balance numbers live here so they can be tuned without touching the logic.
 */

export const ATTRS = ['STR', 'AGI', 'END', 'INT', 'ARC', 'WIT', 'PRE'] as const
export type Attr = (typeof ATTRS)[number]
export type AttrMods = Partial<Record<Attr, number>>

export const ATTR_INFO: Record<Attr, { label: string; blurb: string }> = {
  STR: { label: 'Strength', blurb: 'Melee damage, carrying, heavy labour' },
  AGI: { label: 'Agility', blurb: 'Ranged attacks, dodging, stealth, fine handwork' },
  END: { label: 'Endurance', blurb: 'Health, stamina, resisting poison and exhaustion' },
  INT: { label: 'Intellect', blurb: 'Lore, medicine, alchemy, learning' },
  ARC: { label: 'Arcane', blurb: 'Spellcasting, mana, enchanting' },
  WIT: { label: 'Wits', blurb: 'Perception, survival, initiative' },
  PRE: { label: 'Presence', blurb: 'Persuasion, deception, bartering, leadership' }
}

// ---- Skills ---------------------------------------------------------------------------

export const SKILL_GROUPS = ['combat', 'adventuring', 'social', 'gathering', 'crafting'] as const
export type SkillGroup = (typeof SKILL_GROUPS)[number]

export const GROUP_INFO: Record<SkillGroup, { label: string; icon: string }> = {
  combat: { label: 'Combat', icon: 'sword' },
  adventuring: { label: 'Adventuring', icon: 'boot' },
  social: { label: 'Social', icon: 'speech' },
  gathering: { label: 'Gathering', icon: 'pick' },
  crafting: { label: 'Crafting', icon: 'hammer' }
}

export const SKILLS = {
  melee: { label: 'Melee', group: 'combat', attr: 'STR', blurb: 'Swords, axes, maces, spears' },
  ranged: { label: 'Ranged', group: 'combat', attr: 'AGI', blurb: 'Bows, crossbows, thrown weapons' },
  defense: { label: 'Defense', group: 'combat', attr: 'END', blurb: 'Armour, blocking, parrying' },
  spellcasting: { label: 'Spellcasting', group: 'combat', attr: 'ARC', blurb: 'Casting known spells' },
  athletics: { label: 'Athletics', group: 'adventuring', attr: 'STR', blurb: 'Climbing, swimming, forcing doors' },
  stealth: { label: 'Stealth', group: 'adventuring', attr: 'AGI', blurb: 'Sneaking, hiding, pickpocketing' },
  perception: { label: 'Perception', group: 'adventuring', attr: 'WIT', blurb: 'Noticing things' },
  survival: { label: 'Survival', group: 'adventuring', attr: 'WIT', blurb: 'Tracking, foraging, navigation' },
  lore: { label: 'Lore', group: 'adventuring', attr: 'INT', blurb: 'History, monsters, religion, magic' },
  medicine: { label: 'Medicine', group: 'adventuring', attr: 'INT', blurb: 'First aid, stabilising, curing' },
  persuasion: { label: 'Persuasion', group: 'social', attr: 'PRE', blurb: 'Convincing people' },
  deception: { label: 'Deception', group: 'social', attr: 'PRE', blurb: 'Lying, disguise, misdirection' },
  intimidation: { label: 'Intimidation', group: 'social', attr: 'PRE', blurb: 'Threats and presence' },
  bartering: { label: 'Bartering', group: 'social', attr: 'PRE', blurb: 'Buying and selling' },
  mining: { label: 'Mining', group: 'gathering', attr: 'STR', blurb: 'Ore, gems, stone' },
  woodcutting: { label: 'Woodcutting', group: 'gathering', attr: 'STR', blurb: 'Logs and timber' },
  fishing: { label: 'Fishing', group: 'gathering', attr: 'WIT', blurb: 'Rivers, lakes and sea' },
  hunting: { label: 'Hunting', group: 'gathering', attr: 'AGI', blurb: 'Trapping, skinning, hides and meat' },
  herbalism: { label: 'Herbalism', group: 'gathering', attr: 'WIT', blurb: 'Finding and harvesting herbs' },
  smithing: { label: 'Smithing', group: 'crafting', attr: 'STR', blurb: 'Smelting, weapons, armour, tools' },
  cooking: { label: 'Cooking', group: 'crafting', attr: 'WIT', blurb: 'Meals that heal and strengthen' },
  crafting: { label: 'Crafting', group: 'crafting', attr: 'AGI', blurb: 'Leather, cloth, jewellery, goods' },
  fletching: { label: 'Fletching', group: 'crafting', attr: 'AGI', blurb: 'Bows, arrows, bolts' },
  alchemy: { label: 'Alchemy', group: 'crafting', attr: 'INT', blurb: 'Potions and poisons' },
  enchanting: { label: 'Enchanting', group: 'crafting', attr: 'ARC', blurb: 'Magic properties on items' }
} as const satisfies Record<string, { label: string; group: SkillGroup; attr: Attr; blurb: string }>

export type SkillId = keyof typeof SKILLS
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[]
export const SOCIAL_SKILLS: SkillId[] = ['persuasion', 'deception', 'intimidation', 'bartering']
export type SkillMods = Partial<Record<SkillId, number>>

// ---- Races ----------------------------------------------------------------------------

export const RACES = {
  human: {
    label: 'Human',
    plural: 'Humans',
    blurb: 'Short-lived, stubborn and everywhere. Good at whatever they set their mind to.',
    attrs: {},
    trait: { name: 'Adaptable', text: '+1 to two attribute caps of your choice, and +10% skill XP.' },
    affinities: {},
    xpBonus: 0.1,
    bonusAttrPicks: 2
  },
  dwarf: {
    label: 'Dwarf',
    plural: 'Dwarves',
    blurb: 'Broad, hardy folk of the deep halls. Patient craftsmen, poor sorcerers.',
    attrs: { STR: 2, AGI: -2, END: 3, ARC: -3, WIT: 1, PRE: -1 },
    trait: { name: 'Stoneborn', text: 'Sees in dim light. +5 to Mining and Smithing caps.' },
    affinities: { mining: 5, smithing: 5 },
    xpBonus: 0,
    bonusAttrPicks: 0
  },
  elf: {
    label: 'Elf',
    plural: 'Elves',
    blurb: 'Long-lived and aloof, with old magic in the blood. Graceful, but frail.',
    attrs: { STR: -2, AGI: 2, END: -2, INT: 1, ARC: 2, WIT: 1, PRE: -2 },
    trait: { name: 'Old Blood', text: '+5 to Spellcasting and Enchanting caps.' },
    affinities: { spellcasting: 5, enchanting: 5 },
    xpBonus: 0,
    bonusAttrPicks: 0
  },
  halfling: {
    label: 'Halfling',
    plural: 'Halflings',
    blurb: 'Small, quick and unreasonably lucky. Easy to underestimate.',
    attrs: { STR: -3, AGI: 3, ARC: -1, PRE: 1 },
    trait: { name: 'Small & Lucky', text: 'Once per day, a natural 1 is rerolled automatically.' },
    affinities: { stealth: 5 },
    xpBonus: 0,
    bonusAttrPicks: 0
  },
  orc: {
    label: 'Orc',
    plural: 'Orcs',
    blurb: 'Big, fierce and hard to kill. Not much welcomed in polite company.',
    attrs: { STR: 3, END: 2, INT: -2, ARC: -1, PRE: -2 },
    trait: { name: 'Relentless', text: 'Once per day, drop to 1 HP instead of going down.' },
    affinities: { intimidation: 5 },
    xpBonus: 0,
    bonusAttrPicks: 0
  }
} as const satisfies Record<
  string,
  {
    label: string
    plural: string
    blurb: string
    attrs: AttrMods
    trait: { name: string; text: string }
    affinities: SkillMods
    xpBonus: number
    bonusAttrPicks: number
  }
>
export type RaceId = keyof typeof RACES
export const RACE_IDS = Object.keys(RACES) as RaceId[]

// ---- Sex ------------------------------------------------------------------------------

export type SexId = 'male' | 'female'
export type SexMode = 'realistic' | 'off'

export type SexRow = {
  label: string
  blurb: string
  attrs: AttrMods
  affinities: SkillMods
  baseHp: number
  /** Social check modifier before Renown, with strangers and authority. */
  socialBase: number
  /** Renown needed per +1 social bonus, and the most it can give. */
  renownPer: number
  renownMax: number
  /** Chance that being downed by sentient enemies means capture instead of death. */
  captureChance: number
}

export const SEXES: Record<SexMode, Record<SexId, SexRow>> = {
  realistic: {
    male: {
      label: 'Male',
      blurb: 'Holds the physical power, but must prove himself before anyone listens.',
      attrs: { STR: 2, END: 1, PRE: -1 },
      affinities: {},
      baseHp: 10,
      socialBase: -2,
      renownPer: 12,
      renownMax: 6,
      captureChance: 0.2
    },
    female: {
      label: 'Female',
      blurb: 'Welcomed easily and listened to, but fragile in a fight. Fights mostly with magic.',
      attrs: { STR: -3, AGI: 1, END: -2, ARC: 2, WIT: 1, PRE: 2 },
      affinities: { spellcasting: 5, enchanting: 5, alchemy: 5, medicine: 5 },
      baseHp: 6,
      socialBase: 2,
      renownPer: 25,
      renownMax: 3,
      captureChance: 0.65
    }
  },
  off: {
    male: {
      label: 'Male',
      blurb: 'No modifiers in this campaign.',
      attrs: {},
      affinities: {},
      baseHp: 8,
      socialBase: 0,
      renownPer: 20,
      renownMax: 4,
      captureChance: 0.35
    },
    female: {
      label: 'Female',
      blurb: 'No modifiers in this campaign.',
      attrs: {},
      affinities: {},
      baseHp: 8,
      socialBase: 0,
      renownPer: 20,
      renownMax: 4,
      captureChance: 0.35
    }
  }
}

// ---- Age ------------------------------------------------------------------------------

export const AGES = {
  young: { label: 'Young', years: '16–20', attrs: { AGI: 1, END: 1, INT: -1, ARC: -1 }, xpBonus: 0.1, skillLevels: 0, renown: 0 },
  adult: { label: 'Adult', years: '21–35', attrs: {}, xpBonus: 0, skillLevels: 0, renown: 0 },
  middle: {
    label: 'Middle-aged',
    years: '36–55',
    attrs: { STR: -1, AGI: -1, INT: 1, ARC: 1, WIT: 1 },
    xpBonus: 0,
    skillLevels: 2,
    renown: 3
  },
  elder: {
    label: 'Elder',
    years: '56+',
    attrs: { STR: -2, AGI: -2, END: -2, INT: 2, ARC: 2, WIT: 1, PRE: 1 },
    xpBonus: 0,
    skillLevels: 5,
    renown: 8
  }
} as const satisfies Record<
  string,
  { label: string; years: string; attrs: AttrMods; xpBonus: number; skillLevels: number; renown: number }
>
export type AgeId = keyof typeof AGES
export const AGE_IDS = Object.keys(AGES) as AgeId[]

// ---- Backgrounds ----------------------------------------------------------------------

export type KitItem = { name: string; qty?: number; icon?: string }

export const BACKGROUNDS = {
  // No calling: nothing set in stone, so the story isn't steered by a trade (docs/spec/04-rules-system.md#no-calling).
  none: {
    label: 'No Calling',
    blurb: 'Nothing set in stone. Spread your first skills as you like, and say what you did in your own words, or nothing at all.',
    affinities: {},
    skills: {},
    kit: [{ name: 'Dagger', icon: 'dagger' }, { name: 'Travel rations', qty: 2, icon: 'bread' }],
    coins: 60
  },
  farmhand: {
    label: 'Farmhand',
    blurb: 'Up before dawn, strong from honest work, and never far from a cookpot.',
    affinities: { athletics: 5, survival: 5, cooking: 5 },
    skills: { athletics: 4, survival: 3, cooking: 3 },
    kit: [{ name: 'Pitchfork', icon: 'fork' }, { name: 'Travel rations', qty: 3, icon: 'bread' }],
    coins: 50
  },
  smith: {
    label: 'Apprentice Smith',
    blurb: 'Years at the anvil. You know metal, fire, and how to swing a hammer.',
    affinities: { smithing: 5, mining: 5, melee: 5 },
    skills: { smithing: 5, mining: 3, melee: 2 },
    kit: [{ name: "Smith's hammer", icon: 'hammer' }, { name: 'Leather apron', icon: 'armor' }],
    coins: 80
  },
  acolyte: {
    label: 'Temple Acolyte',
    blurb: 'Raised among candles and scripture. You can mend a wound and quote the saints.',
    affinities: { medicine: 5, lore: 5, persuasion: 5 },
    skills: { medicine: 4, lore: 4, persuasion: 2 },
    kit: [{ name: 'Holy symbol', icon: 'amulet' }, { name: 'Bandages', qty: 4, icon: 'bandage' }],
    coins: 60
  },
  thief: {
    label: 'Street Thief',
    blurb: 'Quick hands, quicker lies. The city taught you everything worth knowing.',
    affinities: { stealth: 5, deception: 5, crafting: 5 },
    skills: { stealth: 5, deception: 3, crafting: 2 },
    kit: [{ name: 'Dagger', icon: 'dagger' }, { name: 'Lockpicks', icon: 'key' }],
    coins: 30
  },
  hunter: {
    label: 'Hunter',
    blurb: 'At home in the wild. You track, you shoot, and you rarely go hungry.',
    affinities: { ranged: 5, hunting: 5, survival: 5 },
    skills: { ranged: 4, hunting: 4, survival: 2 },
    kit: [{ name: 'Shortbow', icon: 'bow' }, { name: 'Arrows', qty: 20, icon: 'arrow' }, { name: 'Skinning knife', icon: 'dagger' }],
    coins: 50
  },
  hedgewitch: {
    label: 'Hedge Witch',
    blurb: 'Herbs, charms and whispered words. The village fears you a little, and needs you a lot.',
    affinities: { herbalism: 5, alchemy: 5, spellcasting: 5 },
    skills: { herbalism: 4, alchemy: 3, spellcasting: 3 },
    kit: [{ name: 'Herb pouch', icon: 'herb' }, { name: 'Mortar and pestle', icon: 'flask' }],
    coins: 40
  },
  sellsword: {
    label: 'Sellsword',
    blurb: 'You fight for coin. You have the scars, the sword, and the reputation to prove it.',
    affinities: { melee: 5, defense: 5, intimidation: 5 },
    skills: { melee: 5, defense: 3, intimidation: 2 },
    kit: [{ name: 'Sword', icon: 'sword' }, { name: 'Leather armour', icon: 'armor' }],
    coins: 100
  },
  fisher: {
    label: 'Fisher',
    blurb: 'River and sea are your fields. Patient, weathered, and a fine cook.',
    affinities: { fishing: 5, cooking: 5, athletics: 5 },
    skills: { fishing: 5, cooking: 3, athletics: 2 },
    kit: [{ name: 'Fishing rod', icon: 'rod' }, { name: 'Net', icon: 'net' }],
    coins: 50
  },
  peddler: {
    label: 'Road Peddler',
    blurb: 'Town to town with a pack of odds and ends. You can sell anything to anyone, once.',
    affinities: { bartering: 5, persuasion: 5, deception: 5 },
    skills: { bartering: 5, persuasion: 3, deception: 2 },
    kit: [{ name: "Peddler's pack", icon: 'bag' }, { name: 'Trinkets', qty: 6, icon: 'amulet' }],
    coins: 90
  },

  // ---- Dwarves: deep halls, clan and craft --------------------------------------------
  delver: {
    label: 'Tunnel Delver',
    blurb: 'You worked the deep seams where the lamps gutter. You hear a bad ceiling before it falls.',
    affinities: { mining: 5, athletics: 5, perception: 5 },
    skills: { mining: 5, athletics: 3, perception: 2 },
    kit: [{ name: 'Pick', icon: 'pick' }, { name: 'Miner\'s lantern', icon: 'candle' }],
    coins: 60
  },
  runecarver: {
    label: "Rune-Carver's Apprentice",
    blurb: 'You cut the old marks into stone and steel. Most of them only hum. Some do more.',
    affinities: { enchanting: 5, crafting: 5, lore: 5 },
    skills: { enchanting: 4, crafting: 3, lore: 3 },
    kit: [{ name: 'Chisel set', icon: 'hammer' }, { name: 'Rune stones', qty: 3, icon: 'crystal' }],
    coins: 70
  },
  brewer: {
    label: 'Clan Brewer',
    blurb: 'Every hold runs on ale and grudges. You kept the first flowing and heard all of the second.',
    affinities: { cooking: 5, alchemy: 5, bartering: 5 },
    skills: { cooking: 4, alchemy: 3, bartering: 3 },
    kit: [{ name: 'Small cask of ale', icon: 'drop' }, { name: 'Travel rations', qty: 3, icon: 'bread' }],
    coins: 70
  },
  shieldbearer: {
    label: 'Hold Shieldbearer',
    blurb: 'You stood in the gate line. You know how to hold a wall of shields, and when not to.',
    affinities: { defense: 5, melee: 5, intimidation: 5 },
    skills: { defense: 5, melee: 3, intimidation: 2 },
    kit: [{ name: 'Axe', icon: 'pick' }, { name: 'Round shield', icon: 'armor' }],
    coins: 80
  },
  namekeeper: {
    label: 'Keeper of Names',
    blurb: 'You tended the ancestor halls and learned every line of the clan books by heart.',
    affinities: { lore: 5, medicine: 5, persuasion: 5 },
    skills: { lore: 4, medicine: 3, persuasion: 3 },
    kit: [{ name: 'Book of names', icon: 'scroll' }, { name: 'Bandages', qty: 3, icon: 'bandage' }],
    coins: 60
  },

  // ---- Elves: old forests and older magic ---------------------------------------------
  grovewarden: {
    label: 'Grove Warden',
    blurb: 'You walked the borders of the old woods and turned back those who meant them harm.',
    affinities: { ranged: 5, survival: 5, perception: 5 },
    skills: { ranged: 4, survival: 3, perception: 3 },
    kit: [{ name: 'Longbow', icon: 'bow' }, { name: 'Arrows', qty: 20, icon: 'arrow' }, { name: 'Green cloak', icon: 'armor' }],
    coins: 50
  },
  loreward: {
    label: "Loremaster's Ward",
    blurb: 'Raised among scrolls older than kingdoms. You read the old tongues and a few spells besides.',
    affinities: { lore: 5, spellcasting: 5, enchanting: 5 },
    skills: { lore: 5, spellcasting: 3, enchanting: 2 },
    kit: [{ name: 'Book of the old tongues', icon: 'scroll' }, { name: 'Ink and quills', icon: 'quill' }],
    coins: 60
  },
  moonsinger: {
    label: 'Moonsinger',
    blurb: 'You sang the long songs at the moon feasts. A good song moves people; a true one moves more.',
    affinities: { persuasion: 5, lore: 5, spellcasting: 5 },
    skills: { persuasion: 4, lore: 3, spellcasting: 3 },
    kit: [{ name: 'Silver harp', icon: 'star' }, { name: 'Moon-cloth', icon: 'moon' }],
    coins: 70
  },
  grovehealer: {
    label: 'Grove Healer',
    blurb: 'You know which leaf closes a wound and which one closes an eye for good.',
    affinities: { herbalism: 5, medicine: 5, alchemy: 5 },
    skills: { herbalism: 4, medicine: 4, alchemy: 2 },
    kit: [{ name: 'Herb pouch', icon: 'herb' }, { name: 'Bandages', qty: 4, icon: 'bandage' }],
    coins: 50
  },
  bladedancer: {
    label: 'Bladedancer',
    blurb: 'Years of forms under the trees. You fight like water: never where the blow lands.',
    affinities: { melee: 5, athletics: 5, defense: 5 },
    skills: { melee: 4, athletics: 3, defense: 3 },
    kit: [{ name: 'Curved blade', icon: 'sword' }, { name: 'Dancer\'s wraps', icon: 'armor' }],
    coins: 60
  },
  bowyer: {
    label: 'Bowyer',
    blurb: 'You shaped bows from living yew and fletched arrows with your own hands.',
    affinities: { fletching: 5, woodcutting: 5, ranged: 5 },
    skills: { fletching: 5, woodcutting: 3, ranged: 2 },
    kit: [{ name: 'Shortbow', icon: 'bow' }, { name: 'Arrows', qty: 20, icon: 'arrow' }, { name: 'Hatchet', icon: 'pick' }],
    coins: 60
  },

  // ---- Halflings: hearth, field and road ----------------------------------------------
  hearthcook: {
    label: 'Hearth Cook',
    blurb: 'Six meals a day for a family of twenty. You can make a feast from a pocket of turnips.',
    affinities: { cooking: 5, bartering: 5, herbalism: 5 },
    skills: { cooking: 5, bartering: 3, herbalism: 2 },
    kit: [{ name: 'Cooking pot', icon: 'flask' }, { name: 'Spice pouch', icon: 'herb' }, { name: 'Travel rations', qty: 3, icon: 'bread' }],
    coins: 60
  },
  lanewarden: {
    label: 'Lane Warden',
    blurb: 'You kept watch on the hedgerows and lanes. Nobody notices a halfling in a hedge.',
    affinities: { stealth: 5, ranged: 5, perception: 5 },
    skills: { stealth: 4, ranged: 3, perception: 3 },
    kit: [{ name: 'Sling', icon: 'bow' }, { name: 'Sling stones', qty: 20, icon: 'coin' }, { name: 'Lantern', icon: 'candle' }],
    coins: 50
  },

  // ---- Orcs: clans, hard country, and harder neighbours -------------------------------
  raider: {
    label: 'Clan Raider',
    blurb: 'You rode with the war-band. You know the weight of a cleaver and the look in a man\'s eye before he runs.',
    affinities: { melee: 5, intimidation: 5, athletics: 5 },
    skills: { melee: 5, intimidation: 3, athletics: 2 },
    kit: [{ name: 'Cleaver', icon: 'sword' }, { name: 'Hide armour', icon: 'armor' }],
    coins: 40
  },
  beasttamer: {
    label: 'Beast-Tamer',
    blurb: 'You raised the clan\'s wolves from pups. Animals trust you; people are another matter.',
    affinities: { hunting: 5, survival: 5, intimidation: 5 },
    skills: { hunting: 4, survival: 4, intimidation: 2 },
    kit: [{ name: 'Rope', icon: 'chain' }, { name: 'Dried meat', qty: 4, icon: 'bread' }, { name: 'Skinning knife', icon: 'dagger' }],
    coins: 40
  },
  bonecaller: {
    label: 'Bone-Caller',
    blurb: 'You learned the spirit-talk from the clan\'s old shaman, and the cures that go with it.',
    affinities: { spellcasting: 5, herbalism: 5, medicine: 5 },
    skills: { spellcasting: 4, herbalism: 3, medicine: 3 },
    kit: [{ name: 'Bone charms', icon: 'amulet' }, { name: 'Herb pouch', icon: 'herb' }],
    coins: 40
  },
  pitfighter: {
    label: 'Pit Fighter',
    blurb: 'Humans paid to watch you bleed. You learned to take a beating and give a worse one.',
    affinities: { melee: 5, defense: 5, athletics: 5 },
    skills: { melee: 4, defense: 4, athletics: 2 },
    kit: [{ name: 'Cudgel', icon: 'hammer' }, { name: 'Knuckle wraps', icon: 'bandage' }],
    coins: 70
  },
  scrapsmith: {
    label: 'Scrap-Smith',
    blurb: 'Your clan had no mines, only what others threw away. You make good iron out of bad.',
    affinities: { smithing: 5, crafting: 5, mining: 5 },
    skills: { smithing: 4, crafting: 4, mining: 2 },
    kit: [{ name: "Smith's hammer", icon: 'hammer' }, { name: 'Bag of scrap iron', icon: 'bag' }],
    coins: 50
  }
} as const satisfies Record<
  string,
  { label: string; blurb: string; affinities: SkillMods; skills: SkillMods; kit: KitItem[]; coins: number }
>
export type BackgroundId = keyof typeof BACKGROUNDS
export const BACKGROUND_IDS = Object.keys(BACKGROUNDS) as BackgroundId[]

/** Which callings each people has (docs/spec/04-rules-system.md#backgrounds). Their cultures differ, so do their trades. */
export const RACE_BACKGROUNDS: Record<RaceId, BackgroundId[]> = {
  human: ['none', 'farmhand', 'smith', 'acolyte', 'thief', 'hunter', 'hedgewitch', 'sellsword', 'fisher', 'peddler'],
  dwarf: ['none', 'delver', 'smith', 'runecarver', 'brewer', 'shieldbearer', 'namekeeper'],
  elf: ['none', 'grovewarden', 'loreward', 'moonsinger', 'grovehealer', 'bladedancer', 'bowyer'],
  halfling: ['none', 'farmhand', 'hearthcook', 'peddler', 'thief', 'fisher', 'lanewarden'],
  orc: ['none', 'raider', 'beasttamer', 'bonecaller', 'pitfighter', 'scrapsmith', 'hunter']
}
export const backgroundsFor = (race: RaceId): BackgroundId[] => RACE_BACKGROUNDS[race]
/** The starting skill levels a calling gives; with no calling, they're the player's to spread. */
export const CALLING_LEVELS = 10

// ---- Point-buy & creation -------------------------------------------------------------

export const ATTR_START = 8
export const ATTR_POINTS = 24
/** Cost of raising an attribute from `score` to `score + 1`. */
export const attrStepCost = (score: number) => (score >= 14 ? 2 : 1)
export const BASE_ATTR_CAP = 16
export const ATTR_CAP_MIN = 8
export const ATTR_CAP_MAX = 20
export const START_SKILL_LEVELS = 6
export const START_SKILL_MAX = 10
export const SKILL_MAX = 50

// ---- Checks ---------------------------------------------------------------------------

export const DIFFICULTIES = ['easy', 'moderate', 'hard', 'very_hard', 'heroic', 'legendary'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]
export const DC: Record<Difficulty, number> = { easy: 8, moderate: 12, hard: 16, very_hard: 20, heroic: 25, legendary: 30 }
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
  very_hard: 'Very hard',
  heroic: 'Heroic',
  legendary: 'Legendary'
}
/** Skill XP for a successful check at each difficulty (half on failure). */
export const CHECK_XP: Record<Difficulty, number> = { easy: 8, moderate: 15, hard: 25, very_hard: 40, heroic: 60, legendary: 90 }

export const TIERS = [
  'crit_success',
  'overwhelming',
  'clean_success',
  'narrow_success',
  'narrow_failure',
  'failure',
  'severe_failure',
  'crit_failure'
] as const
export type Tier = (typeof TIERS)[number]
export const TIER_INFO: Record<Tier, { label: string; success: boolean; guide: string }> = {
  crit_success: { label: 'Critical success', success: true, guide: 'Something extra and memorable happens: a bonus effect or unexpected advantage.' },
  overwhelming: { label: 'Overwhelming success', success: true, guide: 'Effortless and stylish, perhaps with a small bonus.' },
  clean_success: { label: 'Clean success', success: true, guide: 'Done well.' },
  narrow_success: { label: 'Narrow success', success: true, guide: 'Done, barely: visible strain, a close call.' },
  narrow_failure: { label: 'Narrow failure', success: false, guide: 'It fails, with a near-miss detail.' },
  failure: { label: 'Failure', success: false, guide: 'It fails, with a consequence.' },
  severe_failure: { label: 'Severe failure', success: false, guide: 'It fails badly, with a serious consequence.' },
  crit_failure: { label: 'Critical failure', success: false, guide: 'It fails, and something goes wrong on top: a broken tool, an alarm, an injury.' }
}

// ---- Harm -----------------------------------------------------------------------------

export const SEVERITIES = ['none', 'light', 'serious', 'deadly'] as const
export type Severity = (typeof SEVERITIES)[number]
export const HARM_SOURCES = ['sentient', 'beast', 'environment', 'magic'] as const
export type HarmSource = (typeof HARM_SOURCES)[number]
/** Damage dice per severity: [count, sides, flat]. */
export const HARM_DICE: Record<Exclude<Severity, 'none'>, [number, number, number]> = {
  light: [1, 4, 0],
  serious: [1, 8, 1],
  deadly: [2, 8, 2]
}
/** Damage multiplier by failure tier (successes take no harm). */
export const HARM_MULT: Partial<Record<Tier, number>> = {
  narrow_failure: 0.5,
  failure: 1,
  severe_failure: 1.5,
  crit_failure: 2
}

// ---- Levels & Renown ------------------------------------------------------------------

export const LEVEL_MAX = 30
/** Share of skill XP that also counts as character XP. */
export const SKILL_TO_CHAR_XP = 0.25
/**
 * Practice in a time-skip counts this much as much towards the character's level as skill XP
 * earned in the story: years of quiet work make someone skilled, not a hero.
 */
export const PRACTICE_TO_CHAR_SHARE = 1 / 3
export const RENOWN_PER_LEVEL = 2
export const RENOWN_MAX = 100
export const RENOWN_TIERS: { min: number; label: string }[] = [
  { min: 90, label: 'Legendary' },
  { min: 75, label: 'Famous' },
  { min: 50, label: 'Renowned' },
  { min: 30, label: 'Respected' },
  { min: 15, label: 'Known' },
  { min: 5, label: 'Local name' },
  { min: 0, label: 'Nobody' }
]

// ---- Conditions -----------------------------------------------------------------------

export const CONDITIONS = {
  bleeding: { label: 'Bleeding', icon: 'drop', text: 'Losing blood. Needs bandaging or Medicine.' },
  poisoned: { label: 'Poisoned', icon: 'skull', text: 'Disadvantage on physical checks until cured.' },
  exhausted: { label: 'Exhausted', icon: 'moon', text: '−1 to all checks. Sleep removes it.' },
  hungry: { label: 'Hungry', icon: 'bread', text: '−1 to physical checks until you eat.' },
  frightened: { label: 'Frightened', icon: 'eye', text: 'Disadvantage on checks near the source of fear.' },
  wounded: { label: 'Badly wounded', icon: 'drop', text: 'Below a quarter of your health.' },
  captured: { label: 'Captured', icon: 'chain', text: 'A prisoner. Weapons taken.' },
  well_fed: { label: 'Well-fed', icon: 'bread', text: '+1 to physical checks until your next long rest.' },
  inspired: { label: 'Inspired', icon: 'star', text: 'Advantage on your next check.' },
  hidden: { label: 'Hidden', icon: 'eye', text: 'Unseen for now.' }
} as const
export type ConditionId = keyof typeof CONDITIONS
export const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[]

// ---- Settings -------------------------------------------------------------------------

export type Mercy = 'brutal' | 'harsh' | 'forgiving'
export type RollMode = 'auto' | 'dramatic' | 'always'
