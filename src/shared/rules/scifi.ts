import type { ItemTemplate } from './items'
import type { EnemyTemplate } from './enemies'

/**
 * Sci-fi gear and foes (docs/spec/04-rules-system.md#sci-fi-gear-and-foes): guns, blades, armour,
 * kit and enemies of a grim far future, on the same engine as the fantasy ones. A story names
 * things freely ("a battered laspistol"); the aliases let the engine know what they are. The
 * templates' own names are generic; the aliases include the words far-future lore tends to use.
 */

const t = (x: Omit<ItemTemplate, 'aliases'> & { aliases?: string[] }): ItemTemplate => ({ aliases: [], ...x })

export const SCIFI_ITEMS: ItemTemplate[] = [
  // ---- guns ------------------------------------------------------------------------------
  t({ id: 'laser_pistol', name: 'Laser pistol', aliases: ['laspistol', 'las pistol', 'las-pistol', 'laser pistol', 'hand laser', 'las'], kind: 'weapon', icon: 'gun', weight: 1, value: 150, fit: 'hand', weapon: { dice: [1, 6], skill: 'ranged', ammo: 'cell' } }),
  t({ id: 'laser_rifle', name: 'Laser rifle', aliases: ['lasgun', 'las gun', 'lasrifle', 'las rifle', 'las-rifle', 'laser rifle', 'lascarbine', 'las carbine', 'longlas', 'long-las', 'hellgun', 'hotshot lasgun'], kind: 'weapon', icon: 'gun', weight: 3.5, value: 300, fit: 'hand', twoHanded: true, weapon: { dice: [1, 8], skill: 'ranged', ammo: 'cell' } }),
  t({ id: 'autopistol', name: 'Autopistol', aliases: ['autopistol', 'auto pistol', 'stub pistol', 'stubber', 'stub gun', 'stubgun', 'revolver', 'pistol', 'handgun', 'sidearm', 'machine pistol'], kind: 'weapon', icon: 'gun', weight: 1, value: 100, fit: 'hand', weapon: { dice: [1, 6], skill: 'ranged', ammo: 'round' } }),
  t({ id: 'autogun', name: 'Autogun', aliases: ['autogun', 'auto gun', 'autorifle', 'auto rifle', 'assault rifle', 'rifle', 'carbine', 'submachine gun', 'smg', 'gun', 'firearm', 'musket', 'stub rifle', 'hunting rifle'], kind: 'weapon', icon: 'gun', weight: 4, value: 250, fit: 'hand', twoHanded: true, weapon: { dice: [1, 8], skill: 'ranged', ammo: 'round' } }),
  t({ id: 'shotgun', name: 'Shotgun', aliases: ['shotgun', 'scattergun', 'combat shotgun', 'pump shotgun', 'blunderbuss'], kind: 'weapon', icon: 'gun', weight: 4, value: 200, fit: 'hand', twoHanded: true, weapon: { dice: [1, 10], skill: 'ranged', ammo: 'shell' } }),
  t({ id: 'heavy_pistol', name: 'Heavy pistol', aliases: ['bolt pistol', 'boltpistol', 'heavy pistol', 'hand cannon', 'heavy revolver'], kind: 'weapon', icon: 'gun', weight: 2.5, value: 800, fit: 'hand', weapon: { dice: [1, 10], skill: 'ranged', ammo: 'round' } }),
  t({ id: 'heavy_rifle', name: 'Heavy rifle', aliases: ['bolter', 'boltgun', 'bolt gun', 'bolt rifle', 'heavy rifle', 'storm bolter', 'heavy stubber'], kind: 'weapon', icon: 'gun', weight: 7, value: 1500, fit: 'hand', twoHanded: true, weapon: { dice: [2, 6], skill: 'ranged', ammo: 'round' } }),
  t({ id: 'plasma_gun', name: 'Plasma gun', aliases: ['plasma pistol', 'plasma gun', 'plasma rifle', 'plasma caster', 'plasma'], kind: 'weapon', icon: 'gun', weight: 3, value: 2500, fit: 'hand', weapon: { dice: [2, 6], skill: 'ranged', ammo: 'cell' } }),
  t({ id: 'flamer', name: 'Flamer', aliases: ['flamer', 'flamethrower', 'flame thrower', 'hand flamer', 'heavy flamer', 'burner'], kind: 'weapon', icon: 'gun', weight: 5, value: 600, fit: 'hand', twoHanded: true, weapon: { dice: [2, 4], skill: 'ranged', ammo: 'cell' } }),

  // ---- blades and mauls ------------------------------------------------------------------
  t({ id: 'combat_knife', name: 'Combat knife', aliases: ['combat knife', 'trench knife', 'bayonet', 'monoknife', 'mono-knife', 'shiv', 'boot knife'], kind: 'weapon', icon: 'dagger', weight: 0.4, value: 20, fit: 'hand', weapon: { dice: [1, 4], skill: 'melee', finesse: true } }),
  t({ id: 'combat_blade', name: 'Combat blade', aliases: ['combat blade', 'machete', 'cutlass', 'sabre-bayonet', 'officer sword', "officer's sword", 'duelling blade', 'dueling blade'], kind: 'weapon', icon: 'sword', weight: 1.2, value: 100, fit: 'hand', weapon: { dice: [1, 8], skill: 'melee' } }),
  t({ id: 'chainblade', name: 'Chainblade', aliases: ['chainsword', 'chain sword', 'chain-sword', 'chainblade', 'chain blade', 'eviscerator'], kind: 'weapon', icon: 'sword', weight: 3, value: 600, fit: 'hand', weapon: { dice: [1, 10], skill: 'melee' } }),
  t({ id: 'chain_axe', name: 'Chain-axe', aliases: ['chainaxe', 'chain axe', 'chain-axe'], kind: 'weapon', icon: 'pick', weight: 3.5, value: 500, fit: 'hand', weapon: { dice: [1, 10], skill: 'melee' } }),
  t({ id: 'power_blade', name: 'Power blade', aliases: ['power sword', 'power blade', 'power axe', 'energy blade', 'force sword', 'force axe', 'force staff', 'power fist', 'power claw', 'lightning claw'], kind: 'weapon', icon: 'sword', weight: 3, value: 4000, fit: 'hand', weapon: { dice: [2, 6], skill: 'melee' } }),
  t({ id: 'shock_maul', name: 'Shock maul', aliases: ['shock maul', 'power maul', 'shock baton', 'stun baton', 'shock prod', 'electro-prod', 'electroprod', 'shock stave', 'truncheon'], kind: 'weapon', icon: 'hammer', weight: 2, value: 150, fit: 'hand', weapon: { dice: [1, 8], skill: 'melee' } }),

  // ---- ammunition ------------------------------------------------------------------------
  t({ id: 'power_cells', name: 'Power cells', aliases: ['power cells', 'power cell', 'charge pack', 'charge packs', 'las cell', 'las cells', 'energy cell', 'energy cells', 'power pack', 'power packs', 'promethium canister', 'fuel canister'], kind: 'ammo', icon: 'bolt', weight: 0.05, value: 2, ammoKind: 'cell' }),
  t({ id: 'rounds', name: 'Rounds', aliases: ['rounds', 'round', 'bullets', 'bullet', 'ammunition', 'ammo', 'magazine', 'magazines', 'clip', 'clips', 'bolt rounds', 'bolt shells', 'solid rounds', 'stub rounds', 'cartridges', 'lead shot', 'shot'], kind: 'ammo', icon: 'arrow', weight: 0.03, value: 2, ammoKind: 'round' }),
  t({ id: 'shells', name: 'Shotgun shells', aliases: ['shotgun shells', 'shotgun shell', 'shells', 'shell', 'slugs', 'buckshot'], kind: 'ammo', icon: 'arrow', weight: 0.05, value: 2, ammoKind: 'shell' }),

  // ---- armour ----------------------------------------------------------------------------
  t({ id: 'flak_vest', name: 'Flak vest', aliases: ['flak vest', 'flak jacket', 'flak armour', 'flak armor', 'flak', 'armoured vest', 'armored vest', 'body armour', 'body armor', 'ballistic vest', 'armoured jacket'], kind: 'armor', icon: 'armor', weight: 4, value: 120, fit: 'body', armor: { bonus: 2, maxAgi: 4 } }),
  t({ id: 'mesh_armor', name: 'Mesh armour', aliases: ['mesh armour', 'mesh armor', 'mesh cloak', 'mesh vest', 'armoured bodyglove', 'bodyglove'], kind: 'armor', icon: 'armor', weight: 2, value: 600, fit: 'body', armor: { bonus: 3 } }),
  t({ id: 'carapace_armor', name: 'Carapace armour', aliases: ['carapace armour', 'carapace armor', 'carapace', 'storm trooper armour', 'stormtrooper armour', 'riot armour', 'riot armor', 'plate carrier'], kind: 'armor', icon: 'armor', weight: 12, value: 1500, fit: 'body', armor: { bonus: 4, maxAgi: 2 } }),
  t({ id: 'power_armor', name: 'Power armour', aliases: ['power armour', 'power armor', 'powered armour', 'powered armor', 'exo-armour', 'exosuit', 'exo-suit'], kind: 'armor', icon: 'armor', weight: 25, value: 20000, fit: 'body', armor: { bonus: 6, maxAgi: 1, heavy: true } }),
  t({ id: 'flak_helmet', name: 'Flak helmet', aliases: ['flak helmet', 'combat helmet', 'carapace helmet', 'helmet visor', 'respirator helm'], kind: 'armor', icon: 'armor', weight: 1, value: 40, fit: 'head', armor: { bonus: 1 } }),
  t({ id: 'riot_shield', name: 'Riot shield', aliases: ['riot shield', 'blast shield', 'suppression shield', 'boarding shield', 'storm shield'], kind: 'shield', icon: 'armor', weight: 5, value: 150, fit: 'shield', armor: { bonus: 2 } }),

  // ---- kit -------------------------------------------------------------------------------
  t({ id: 'medkit', name: 'Medi-kit', aliases: ['medkit', 'medi-kit', 'medikit', 'med kit', 'med-kit', 'first aid kit', 'medpack', 'med pack', 'field dressing', 'trauma kit'], kind: 'medicine', icon: 'bandage', weight: 0.5, value: 40, heal: [1, 6, 2], cures: ['bleeding'] }),
  t({ id: 'stimm', name: 'Stimm', aliases: ['stimm', 'stimms', 'stim', 'stims', 'combat stimm', 'medi-stimm', 'med-stimm', 'stimulant', 'injector', 'auto-injector', 'painkiller', 'painkillers'], kind: 'medicine', icon: 'flask', weight: 0.1, value: 60, heal: [2, 4, 2] }),
  t({ id: 'antitox', name: 'Antitox', aliases: ['antitox', 'anti-tox', 'detox', 'antitoxin', 'counter-agent'], kind: 'medicine', icon: 'flask', weight: 0.1, value: 40, cures: ['poisoned'] }),
  t({ id: 'ration_bricks', name: 'Ration bricks', aliases: ['ration brick', 'ration bricks', 'ration bar', 'ration bars', 'ration pack', 'ration packs', 'nutrient paste', 'protein bar', 'protein bars', 'corpse-starch', 'corpse starch', 'mre'], kind: 'food', icon: 'bread', weight: 0.4, value: 4, food: { hours: 12 } }),
  t({ id: 'recaf', name: 'Recaf', aliases: ['recaf', 'caffeine', 'hot drink', 'amasec', 'rotgut', 'grain-spirit', 'ration-spirit'], kind: 'drink', icon: 'drop', weight: 0.5, value: 3, food: { hours: 2 } }),
  t({ id: 'glow_lamp', name: 'Glow-lamp', aliases: ['glow-lamp', 'glow lamp', 'glowglobe', 'glow-globe', 'glow globe', 'lumen', 'stablight', 'stab-light', 'flashlight', 'lamp-pack', 'luminator'], kind: 'light', icon: 'candle', weight: 0.5, value: 20 }),
  t({ id: 'rebreather', name: 'Rebreather', aliases: ['rebreather', 'respirator', 'gas mask', 'filter mask', 'breather mask'], kind: 'misc', icon: 'armor', weight: 0.5, value: 50, fit: 'head' }),
  t({ id: 'data_slate', name: 'Data-slate', aliases: ['data-slate', 'dataslate', 'data slate', 'data-pad', 'datapad', 'slate', 'cogitator tablet'], kind: 'book', icon: 'scroll', weight: 0.5, value: 60 }),
  t({ id: 'vox', name: 'Vox-bead', aliases: ['vox-bead', 'vox bead', 'vox', 'vox-caster', 'vox caster', 'comm-link', 'commlink', 'comm bead', 'radio'], kind: 'misc', icon: 'speech', weight: 0.2, value: 80 }),
  t({ id: 'auspex', name: 'Auspex', aliases: ['auspex', 'scanner', 'bio-scanner', 'motion tracker', 'surveyor'], kind: 'tool', icon: 'eye', weight: 1, value: 300 }),
  t({ id: 'toolkit', name: 'Tool kit', aliases: ['tool kit', 'toolkit', 'multi-tool', 'multitool', 'combi-tool', 'combitool', 'servo-tool'], kind: 'tool', icon: 'hammer', weight: 1, value: 40, tool: ['crafting', 'smithing'] }),
  t({ id: 'frag_grenade', name: 'Frag grenade', aliases: ['frag grenade', 'grenade', 'grenades', 'frag', 'krak grenade', 'stun grenade', 'photon flash'], kind: 'misc', icon: 'bolt', weight: 0.4, value: 50 })
]

const e = (x: Omit<EnemyTemplate, 'loot'> & { loot?: EnemyTemplate['loot'] }): EnemyTemplate => ({ loot: [], ...x })

export const SCIFI_ENEMIES: EnemyTemplate[] = [
  e({ id: 'ganger', name: 'Ganger', family: 'humanoid', aliases: ['ganger', 'gangers', 'hive ganger', 'hive gangers', 'gang member', 'gangsters', 'gangster', 'scum', 'underhive scum', 'scavvy', 'scavvies', 'scavenger', 'scavengers', 'looter'], hp: 11, defense: 12, attack: 3, damage: [1, 6, 1], initiative: 1, stealth: 3, perception: 2, behavior: 'cautious', verb: 'shoots at', ranged: true, xp: 12, loot: [{ coins: [2, 14], chance: 0.8 }, { item: 'Rounds', qty: [3, 12], chance: 0.7 }, { item: 'Autopistol', chance: 0.25 }, { item: 'Combat knife', chance: 0.3 }] }),
  e({ id: 'trooper', name: 'Trooper', family: 'humanoid', aliases: ['trooper', 'troopers', 'gunman', 'gunmen', 'rifleman', 'riflemen', 'shooter', 'shooters', 'guardsman', 'guardsmen', 'militia', 'militiaman', 'conscript', 'conscripts', 'storm trooper', 'stormtrooper', 'stormtroopers', 'arbitrator', 'arbitrators', 'enforcer squad', 'traitor guard', 'traitor guardsman', 'security'], hp: 14, defense: 14, attack: 4, damage: [1, 8, 1], initiative: 1, stealth: 1, perception: 3, behavior: 'cautious', verb: 'fires at', ranged: true, xp: 18, loot: [{ coins: [3, 18], chance: 0.6 }, { item: 'Power cells', qty: [5, 20], chance: 0.7 }, { item: 'Laser rifle', chance: 0.2 }, { item: 'Flak vest', chance: 0.15 }, { item: 'Ration bricks', chance: 0.3 }] }),
  e({ id: 'mutant', name: 'Mutant', family: 'humanoid', aliases: ['mutant', 'mutants', 'mutie', 'muties', 'abhuman', 'abhumans', 'twisted one', 'malformed', 'plague walker', 'plaguebearer'], hp: 18, defense: 11, attack: 4, damage: [1, 8, 2], initiative: 0, stealth: 2, perception: 2, behavior: 'aggressive', verb: 'mauls', xp: 18, loot: [{ coins: [0, 6], chance: 0.3 }] }),
  e({ id: 'servitor', name: 'Servitor', family: 'monster', aliases: ['servitor', 'servitors', 'combat servitor', 'gun-servitor', 'automaton', 'automata', 'robot', 'robots', 'drone', 'drones', 'construct', 'cyborg', 'cyborgs', 'android', 'androids', 'skitarii', 'servo-skull'], hp: 22, defense: 14, attack: 4, damage: [1, 10, 1], initiative: 0, stealth: 0, perception: 3, behavior: 'fearless', verb: 'grinds at', xp: 24, loot: [{ item: 'Power cells', qty: [2, 8], chance: 0.5 }] }),
  e({ id: 'xeno_beast', name: 'Alien beast', family: 'beast', aliases: ['alien beast', 'xenos beast', 'xeno beast', 'hive beast', 'xeno', 'bug', 'bugs', 'gaunt', 'gaunts', 'hormagaunt', 'termagant', 'ripper', 'rippers', 'genestealer', 'genestealers', 'lictor', 'tyranid', 'tyranids', 'swarm', 'squig', 'grox'], hp: 14, defense: 13, attack: 4, damage: [1, 8, 1], initiative: 3, stealth: 4, perception: 4, behavior: 'aggressive', verb: 'rends', xp: 16 }),
  e({ id: 'xeno_warrior', name: 'Alien warrior', family: 'humanoid', aliases: ['alien', 'aliens', 'xenos', 'xenos warrior', 'alien warrior', 'eldar', 'aeldari', 'drukhari', 'dark eldar', 'tau', "t'au", 'kroot', 'necron', 'necrons'], hp: 15, defense: 15, attack: 5, damage: [1, 8, 2], initiative: 3, stealth: 3, perception: 4, behavior: 'cautious', verb: 'fires at', ranged: true, xp: 24, loot: [{ item: 'Power cells', qty: [2, 8], chance: 0.3 }] }),
  e({ id: 'daemon', name: 'Daemon', family: 'monster', aliases: ['daemon', 'daemons', 'demon', 'demons', 'warp entity', 'warp spawn', 'warpspawn', 'possessed', 'daemonette', 'bloodletter', 'horror of the warp'], hp: 26, defense: 14, attack: 6, damage: [1, 10, 3], initiative: 2, stealth: 3, perception: 4, behavior: 'fearless', verb: 'claws at', xp: 40 }),
  e({ id: 'heavy', name: 'Heavy gunner', family: 'humanoid', aliases: ['heavy gunner', 'heavy weapons team', 'gun team', 'heavy stubber team', 'ogryn', 'ogryns', 'brute', 'hulk'], hp: 28, defense: 13, attack: 5, damage: [2, 6, 2], initiative: 0, stealth: 0, perception: 2, behavior: 'aggressive', verb: 'blasts at', ranged: true, xp: 32, loot: [{ coins: [2, 12], chance: 0.5 }, { item: 'Rounds', qty: [10, 30], chance: 0.6 }] })
]

/**
 * A fantasy calling's starting kit in far-future terms, for a hero starting a sci-fi story
 * (the same strength of thing: a bow is a rifle and its arrows power cells).
 */
const KIT: Record<string, string> = {
  dagger: 'Combat knife',
  skinning_knife: 'Combat knife',
  shortsword: 'Combat blade',
  sword: 'Combat blade',
  curved_blade: 'Combat blade',
  greatsword: 'Chainblade',
  axe: 'Chain-axe',
  hatchet: 'Combat blade',
  greataxe: 'Chain-axe',
  cleaver: 'Combat blade',
  cudgel: 'Shock maul',
  mace: 'Shock maul',
  hammer: 'Tool kit',
  warhammer: 'Shock maul',
  spear: 'Shock maul',
  staff: 'Shock maul',
  pitchfork: 'Shock maul',
  shortbow: 'Laser rifle',
  longbow: 'Laser rifle',
  crossbow: 'Autogun',
  sling: 'Autopistol',
  arrows: 'Power cells',
  bolts: 'Rounds',
  sling_stones: 'Rounds',
  leather_apron: 'Flak vest',
  padded_armor: 'Flak vest',
  leather_armor: 'Flak vest',
  hide_armor: 'Flak vest',
  dancers_wraps: 'Mesh armour',
  chain_shirt: 'Mesh armour',
  plate_armor: 'Carapace armour',
  iron_helm: 'Flak helmet',
  round_shield: 'Riot shield',
  buckler: 'Riot shield',
  rations: 'Ration bricks',
  dried_meat: 'Ration bricks',
  bread: 'Ration bricks',
  ale: 'Recaf',
  healing_draught: 'Stimm',
  bandages: 'Medi-kit',
  healing_salve: 'Medi-kit',
  antidote: 'Antitox',
  torch: 'Glow-lamp',
  lantern: 'Glow-lamp',
  book: 'Data-slate',
  ink: 'Data-slate',
  chisel_set: 'Tool kit',
  sewing_kit: 'Tool kit'
}
export const scifiKitItem = (templateId: string | undefined, name: string) => (templateId && KIT[templateId]) || name

const SCIFI_IDS = new Set(SCIFI_ITEMS.map((i) => i.id))
/** Gear that's already far-future (it needs no translating for the DM). */
export const isScifiItem = (templateId: string | undefined) => Boolean(templateId && SCIFI_IDS.has(templateId))
