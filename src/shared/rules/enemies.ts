import type { HarmSource } from './tables'

/**
 * Enemies (docs/spec/04-rules-system.md#enemies). The DM never invents enemy numbers: it names
 * a kind and a tier, and the engine builds the stat block from these templates. That stops the
 * AI from quietly going easy on the player.
 */

export type EnemyFamily = 'beast' | 'humanoid' | 'undead' | 'monster'
export const ENEMY_TIERS = ['minion', 'standard', 'elite', 'boss'] as const
export type EnemyTier = (typeof ENEMY_TIERS)[number]
export type Behavior = 'aggressive' | 'cautious' | 'cowardly' | 'fearless'

export type Loot = { item?: string; coins?: [number, number]; qty?: [number, number]; chance: number }

export type EnemyTemplate = {
  id: string
  name: string
  family: EnemyFamily
  /** Lower-case words that mean this kind in free text. */
  aliases: string[]
  /** Level-1 standard stats. */
  hp: number
  defense: number
  attack: number
  damage: [number, number, number]
  initiative: number
  stealth: number
  perception: number
  behavior: Behavior
  /** What it does when it attacks ("bites", "slashes"). */
  verb: string
  ranged?: boolean
  xp: number
  loot: Loot[]
}

const e = (x: Omit<EnemyTemplate, 'loot'> & { loot?: Loot[] }): EnemyTemplate => ({ loot: [], ...x })

export const ENEMIES: EnemyTemplate[] = [
  // ---- beasts --------------------------------------------------------------------------
  e({ id: 'wolf', name: 'Wolf', family: 'beast', aliases: ['wolf', 'wolves', 'wild dog', 'hound', 'jackal', 'coyote'], hp: 11, defense: 12, attack: 3, damage: [1, 6, 1], initiative: 2, stealth: 3, perception: 4, behavior: 'aggressive', verb: 'bites', xp: 12 }),
  e({ id: 'greycoat', name: 'Greycoat', family: 'beast', aliases: ['greycoat', 'greycoats', 'dire wolf', 'warg', 'great wolf'], hp: 18, defense: 13, attack: 4, damage: [1, 8, 2], initiative: 2, stealth: 4, perception: 5, behavior: 'aggressive', verb: 'savages', xp: 20 }),
  e({ id: 'boar', name: 'Boar', family: 'beast', aliases: ['boar', 'wild boar', 'hog', 'pig'], hp: 15, defense: 11, attack: 3, damage: [1, 8, 1], initiative: 0, stealth: 0, perception: 2, behavior: 'fearless', verb: 'gores', xp: 14 }),
  e({ id: 'bear', name: 'Bear', family: 'beast', aliases: ['bear', 'cave bear', 'grizzly', 'brown bear'], hp: 30, defense: 12, attack: 5, damage: [2, 6, 2], initiative: 0, stealth: 1, perception: 3, behavior: 'aggressive', verb: 'mauls', xp: 35 }),
  e({ id: 'rat', name: 'Giant rat', family: 'beast', aliases: ['giant rat', 'rat', 'rats', 'vermin'], hp: 5, defense: 11, attack: 2, damage: [1, 4, 0], initiative: 2, stealth: 4, perception: 3, behavior: 'cowardly', verb: 'bites', xp: 4 }),
  e({ id: 'spider', name: 'Giant spider', family: 'beast', aliases: ['giant spider', 'spider', 'spiders', 'crawler'], hp: 14, defense: 13, attack: 4, damage: [1, 6, 1], initiative: 3, stealth: 5, perception: 4, behavior: 'aggressive', verb: 'bites', xp: 18 }),
  e({ id: 'snake', name: 'Viper', family: 'beast', aliases: ['viper', 'snake', 'adder', 'serpent'], hp: 6, defense: 13, attack: 4, damage: [1, 4, 1], initiative: 3, stealth: 5, perception: 3, behavior: 'cautious', verb: 'strikes', xp: 8 }),
  e({ id: 'bird', name: 'Carrion bird', family: 'beast', aliases: ['carrion bird', 'crow', 'crows', 'raven', 'bird', 'hawk', 'eagle'], hp: 5, defense: 13, attack: 3, damage: [1, 4, 0], initiative: 4, stealth: 2, perception: 6, behavior: 'cowardly', verb: 'claws', xp: 4 }),

  // ---- people --------------------------------------------------------------------------
  e({ id: 'bandit', name: 'Bandit', family: 'humanoid', aliases: ['bandit', 'bandits', 'brigand', 'outlaw', 'highwayman', 'cutthroat', 'robber', 'raider', 'pirate', 'smuggler', 'free pennies', 'free penny'], hp: 11, defense: 12, attack: 3, damage: [1, 6, 1], initiative: 1, stealth: 2, perception: 2, behavior: 'cautious', verb: 'slashes at', xp: 12, loot: [{ coins: [2, 14], chance: 0.8 }, { item: 'Dagger', chance: 0.3 }, { item: 'Travel rations', chance: 0.3 }] }),
  e({ id: 'archer', name: 'Archer', family: 'humanoid', aliases: ['archer', 'bowman', 'crossbowman', 'marksman', 'sniper', 'hunter'], hp: 9, defense: 12, attack: 4, damage: [1, 6, 1], initiative: 2, stealth: 3, perception: 4, behavior: 'cautious', verb: 'shoots at', ranged: true, xp: 12, loot: [{ coins: [1, 8], chance: 0.6 }, { item: 'Arrows', qty: [3, 10], chance: 0.7 }, { item: 'Shortbow', chance: 0.2 }] }),
  e({ id: 'thug', name: 'Thug', family: 'humanoid', aliases: ['thug', 'brawler', 'ruffian', 'bruiser', 'drunk', 'enforcer', 'heavy'], hp: 13, defense: 11, attack: 3, damage: [1, 6, 2], initiative: 0, stealth: 0, perception: 1, behavior: 'cowardly', verb: 'swings at', xp: 10, loot: [{ coins: [1, 10], chance: 0.7 }, { item: 'Cudgel', chance: 0.3 }] }),
  e({ id: 'guard', name: 'Guard', family: 'humanoid', aliases: ['guard', 'guards', 'soldier', 'soldiers', 'watchman', 'sentry', 'militia', 'man-at-arms', 'constable', 'rider', 'riders'], hp: 16, defense: 15, attack: 4, damage: [1, 8, 1], initiative: 0, stealth: 0, perception: 3, behavior: 'cautious', verb: 'cuts at', xp: 18, loot: [{ coins: [5, 25], chance: 0.8 }, { item: 'Sword', chance: 0.25 }, { item: 'Iron helm', chance: 0.15 }] }),
  e({ id: 'knight', name: 'Knight', family: 'humanoid', aliases: ['knight', 'champion', 'paladin', 'sellsword', 'mercenary', 'duellist', 'duelist'], hp: 26, defense: 18, attack: 5, damage: [1, 8, 3], initiative: 0, stealth: -2, perception: 2, behavior: 'fearless', verb: 'strikes at', xp: 40, loot: [{ coins: [20, 80], chance: 0.9 }, { item: 'Sword', chance: 0.4 }, { item: 'Round shield', chance: 0.3 }] }),
  e({ id: 'cultist', name: 'Cultist', family: 'humanoid', aliases: ['cultist', 'cultists', 'zealot', 'fanatic', 'acolyte', 'witch', 'warlock', 'necromancer', 'sorcerer', 'mage'], hp: 10, defense: 11, attack: 4, damage: [1, 8, 0], initiative: 1, stealth: 2, perception: 2, behavior: 'fearless', verb: 'lashes out at', xp: 14, loot: [{ coins: [1, 10], chance: 0.6 }, { item: 'Dagger', chance: 0.4 }, { item: 'Bone charms', chance: 0.2 }] }),
  e({ id: 'orc', name: 'Orc raider', family: 'humanoid', aliases: ['orc', 'orcs', 'orc raider', 'half-orc', 'warband', 'war-band'], hp: 15, defense: 13, attack: 4, damage: [1, 8, 2], initiative: 1, stealth: 1, perception: 2, behavior: 'aggressive', verb: 'hacks at', xp: 18, loot: [{ coins: [1, 10], chance: 0.6 }, { item: 'Cleaver', chance: 0.25 }, { item: 'Hide armour', chance: 0.1 }] }),
  e({ id: 'goblin', name: 'Goblin', family: 'humanoid', aliases: ['goblin', 'goblins', 'kobold', 'imp', 'gremlin'], hp: 7, defense: 13, attack: 3, damage: [1, 6, 0], initiative: 3, stealth: 4, perception: 3, behavior: 'cowardly', verb: 'stabs at', xp: 8, loot: [{ coins: [0, 6], chance: 0.6 }, { item: 'Dagger', chance: 0.2 }] }),
  e({ id: 'villager', name: 'Villager', family: 'humanoid', aliases: ['villager', 'villagers', 'farmer', 'peasant', 'mob', 'townsfolk', 'miner', 'miners', 'fisherman', 'servant', 'commoner'], hp: 8, defense: 10, attack: 1, damage: [1, 4, 0], initiative: 0, stealth: 0, perception: 1, behavior: 'cowardly', verb: 'flails at', xp: 4, loot: [{ coins: [0, 5], chance: 0.5 }] }),

  // ---- the dead ------------------------------------------------------------------------
  e({ id: 'skeleton', name: 'Skeleton', family: 'undead', aliases: ['skeleton', 'skeletons', 'bones', 'dead soldier', 'barrow-wight'], hp: 12, defense: 13, attack: 3, damage: [1, 6, 1], initiative: 0, stealth: 0, perception: 1, behavior: 'fearless', verb: 'hacks at', xp: 14 }),
  e({ id: 'ghoul', name: 'Ghoul', family: 'undead', aliases: ['ghoul', 'ghouls', 'zombie', 'zombies', 'corpse', 'walking dead', 'revenant'], hp: 16, defense: 12, attack: 4, damage: [1, 6, 2], initiative: 1, stealth: 2, perception: 2, behavior: 'aggressive', verb: 'claws at', xp: 20 }),
  e({ id: 'drowned', name: 'Drowned one', family: 'undead', aliases: ['drowned one', 'drowned', 'drowner', 'drowned dead', 'lake-thing', 'river-thing'], hp: 14, defense: 11, attack: 4, damage: [1, 6, 1], initiative: 1, stealth: 4, perception: 2, behavior: 'fearless', verb: 'drags at', xp: 18 }),
  e({ id: 'wraith', name: 'Wraith', family: 'undead', aliases: ['wraith', 'ghost', 'spectre', 'specter', 'shade', 'phantom', 'barrow-light', 'barrow light'], hp: 20, defense: 14, attack: 5, damage: [1, 8, 2], initiative: 2, stealth: 5, perception: 4, behavior: 'fearless', verb: 'reaches for', xp: 30 }),

  // ---- monsters ------------------------------------------------------------------------
  e({ id: 'troll', name: 'Troll', family: 'monster', aliases: ['troll', 'ogre', 'giant', 'hill giant'], hp: 40, defense: 13, attack: 6, damage: [2, 6, 4], initiative: -1, stealth: 0, perception: 2, behavior: 'fearless', verb: 'smashes at', xp: 60 }),
  e({ id: 'horror', name: 'Horror', family: 'monster', aliases: ['horror', 'monster', 'creature', 'beast', 'thing', 'abomination', 'fiend', 'demon'], hp: 22, defense: 13, attack: 5, damage: [1, 10, 2], initiative: 1, stealth: 3, perception: 3, behavior: 'fearless', verb: 'tears at', xp: 30 }),
  e({ id: 'wyrm', name: 'Young wyrm', family: 'monster', aliases: ['young wyrm', 'wyrm', 'drake', 'dragon', 'wyvern', 'basilisk'], hp: 45, defense: 16, attack: 6, damage: [2, 8, 3], initiative: 1, stealth: 1, perception: 5, behavior: 'fearless', verb: 'bites at', xp: 90 })
]

const BY_ID = new Map(ENEMIES.map((x) => [x.id, x]))
export const enemyTemplate = (id: string) => BY_ID.get(id)

const norm = (s: string) => s.toLowerCase().replace(/['’]s\b/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()
const ALIASES = ENEMIES.flatMap((t) => [t.name, ...t.aliases].map((a) => ({ alias: norm(a), t }))).sort((a, b) => b.alias.length - a.alias.length)

/** The enemy a description means ("three bandits", "a cave bear"). Unknown: a generic foe of its kind. */
export function findEnemy(text: string): EnemyTemplate | undefined {
  const n = ` ${norm(text)} `
  const singular = ` ${norm(text).replace(/(?<=\w)(es|s)\b/g, '')} `
  for (const { alias, t } of ALIASES) {
    if (n.includes(` ${alias} `) || singular.includes(` ${alias.replace(/(?<=\w)(es|s)\b/g, '')} `)) return t
  }
  return undefined
}

/** Words that make a foe tougher than the usual of its kind. */
export const TIER_WORDS: Record<Exclude<EnemyTier, 'standard'>, RegExp> = {
  minion: /\b(lackey|lackeys|minion|minions|whelp|whelps|pup|pups|runt|runts|scrawny|weak|young|apprentice|recruit|recruits|boy|boys)\b/i,
  elite: /\b(captain|leader|chief|chieftain|sergeant|veteran|alpha|elder|champion|lieutenant|bodyguard|huge|great)\b/i,
  boss: /\b(king|queen|lord|warlord|matriarch|patriarch|ancient|dread|master)\b/i
}

export const TIER_MODS: Record<EnemyTier, { hp: number; attack: number; defense: number; damage: number; xp: number }> = {
  minion: { hp: 0.4, attack: -2, defense: -1, damage: -2, xp: 0.3 },
  standard: { hp: 1, attack: 0, defense: 0, damage: 0, xp: 1 },
  elite: { hp: 1.8, attack: 2, defense: 1, damage: 1, xp: 2.5 },
  boss: { hp: 3.5, attack: 3, defense: 2, damage: 2, xp: 6 }
}

export const HARM_FROM: Record<EnemyFamily, HarmSource> = { beast: 'beast', humanoid: 'sentient', undead: 'magic', monster: 'beast' }
