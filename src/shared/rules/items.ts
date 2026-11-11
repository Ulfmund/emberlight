import type { ConditionId, SkillId } from './tables'
import { SCIFI_ITEMS } from './scifi'

/**
 * Items (docs/spec/04-rules-system.md#items-equipment-money): what things weigh, cost, and do.
 * The story names items freely ("a rusty sword"); `findTemplate` maps a name to the template
 * whose name or alias it contains, so the engine knows the damage, armour and weight.
 */

export type Slot = 'head' | 'body' | 'hands' | 'feet' | 'main' | 'off' | 'neck' | 'ring1' | 'ring2' | 'back'
export const SLOTS: Slot[] = ['main', 'off', 'head', 'body', 'hands', 'feet', 'back', 'neck', 'ring1', 'ring2']
export const SLOT_LABEL: Record<Slot, string> = {
  main: 'Main hand',
  off: 'Off hand',
  head: 'Head',
  body: 'Body',
  hands: 'Hands',
  feet: 'Feet',
  back: 'Back',
  neck: 'Neck',
  ring1: 'Ring',
  ring2: 'Ring'
}

/** Where an item goes when worn or held. "hand" is either hand (weapons, shields). */
export type Fit = 'hand' | 'shield' | 'head' | 'body' | 'hands' | 'feet' | 'back' | 'neck' | 'ring'

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'tool' | 'food' | 'drink' | 'medicine' | 'material' | 'ammo' | 'light' | 'clothing' | 'trinket' | 'book' | 'container' | 'misc'
export type Ammo = 'arrow' | 'bolt' | 'stone' | 'cell' | 'round' | 'shell'
/** What a quiver or a pouch of it is called, run dry ("no arrows left"). */
export const AMMO_WORD: Record<Ammo, string> = { arrow: 'arrows', bolt: 'bolts', stone: 'stones', cell: 'power cells', round: 'rounds', shell: 'shells' }

export type ItemTemplate = {
  id: string
  name: string
  /** Lower-case words that mean this item in free text ("longsword", "blade"). */
  aliases: string[]
  kind: ItemKind
  icon: string
  /** Kilograms per unit. */
  weight: number
  /** Copper per unit. */
  value: number
  fit?: Fit
  twoHanded?: boolean
  weapon?: {
    dice: [number, number]
    skill: 'melee' | 'ranged'
    /** Uses the better of STR and AGI (daggers, light blades). */
    finesse?: boolean
    ammo?: Ammo
  }
  armor?: { bonus: number; maxAgi?: number; heavy?: boolean }
  /** Skills this item is the tool for (no tool: disadvantage on those checks). */
  tool?: SkillId[]
  /** Eating it: hours of hunger relieved; a hot meal may leave you well-fed. */
  food?: { hours: number; wellFed?: boolean }
  /** Using it heals: [dice count, sides, flat]. */
  heal?: [number, number, number]
  cures?: ConditionId[]
  ammoKind?: Ammo
}

const t = (x: Omit<ItemTemplate, 'aliases'> & { aliases?: string[] }): ItemTemplate => ({ aliases: [], ...x })

export const ITEMS: ItemTemplate[] = [
  // ---- weapons -------------------------------------------------------------------------
  t({ id: 'dagger', name: 'Dagger', aliases: ['dagger', 'knife', 'dirk', 'stiletto', 'shiv'], kind: 'weapon', icon: 'dagger', weight: 0.5, value: 20, fit: 'hand', weapon: { dice: [1, 4], skill: 'melee', finesse: true } }),
  t({ id: 'skinning_knife', name: 'Skinning knife', aliases: ['skinning knife', 'hunting knife'], kind: 'weapon', icon: 'dagger', weight: 0.3, value: 10, fit: 'hand', weapon: { dice: [1, 4], skill: 'melee', finesse: true }, tool: ['hunting'] }),
  t({ id: 'shortsword', name: 'Shortsword', aliases: ['shortsword', 'short sword', 'gladius'], kind: 'weapon', icon: 'sword', weight: 1, value: 60, fit: 'hand', weapon: { dice: [1, 6], skill: 'melee', finesse: true } }),
  t({ id: 'sword', name: 'Sword', aliases: ['sword', 'longsword', 'long sword', 'arming sword', 'broadsword', 'blade'], kind: 'weapon', icon: 'sword', weight: 1.5, value: 120, fit: 'hand', weapon: { dice: [1, 8], skill: 'melee' } }),
  t({ id: 'curved_blade', name: 'Curved blade', aliases: ['curved blade', 'scimitar', 'sabre', 'saber', 'falchion'], kind: 'weapon', icon: 'sword', weight: 1, value: 90, fit: 'hand', weapon: { dice: [1, 6], skill: 'melee', finesse: true } }),
  t({ id: 'greatsword', name: 'Greatsword', aliases: ['greatsword', 'great sword', 'two-handed sword', 'claymore', 'zweihander'], kind: 'weapon', icon: 'sword', weight: 3, value: 300, fit: 'hand', twoHanded: true, weapon: { dice: [2, 6], skill: 'melee' } }),
  t({ id: 'axe', name: 'Axe', aliases: ['axe', 'battleaxe', 'battle axe', 'war axe', 'hand axe', 'handaxe'], kind: 'weapon', icon: 'pick', weight: 1.5, value: 60, fit: 'hand', weapon: { dice: [1, 8], skill: 'melee' }, tool: ['woodcutting'] }),
  t({ id: 'hatchet', name: 'Hatchet', aliases: ['hatchet', 'wood axe', 'woodaxe', 'woodcutter axe'], kind: 'weapon', icon: 'pick', weight: 1, value: 25, fit: 'hand', weapon: { dice: [1, 6], skill: 'melee' }, tool: ['woodcutting'] }),
  t({ id: 'greataxe', name: 'Greataxe', aliases: ['greataxe', 'great axe', 'poleaxe'], kind: 'weapon', icon: 'pick', weight: 3.5, value: 200, fit: 'hand', twoHanded: true, weapon: { dice: [1, 12], skill: 'melee' } }),
  t({ id: 'cleaver', name: 'Cleaver', aliases: ['cleaver'], kind: 'weapon', icon: 'sword', weight: 2, value: 40, fit: 'hand', weapon: { dice: [1, 8], skill: 'melee' } }),
  t({ id: 'cudgel', name: 'Cudgel', aliases: ['cudgel', 'club', 'cosh', 'bludgeon', 'truncheon'], kind: 'weapon', icon: 'hammer', weight: 1, value: 5, fit: 'hand', weapon: { dice: [1, 6], skill: 'melee' } }),
  t({ id: 'mace', name: 'Mace', aliases: ['mace', 'morningstar', 'flail'], kind: 'weapon', icon: 'hammer', weight: 2, value: 80, fit: 'hand', weapon: { dice: [1, 8], skill: 'melee' } }),
  t({ id: 'hammer', name: "Smith's hammer", aliases: ["smith's hammer", 'smiths hammer', 'smith hammer', 'hammer', 'forge hammer'], kind: 'weapon', icon: 'hammer', weight: 1.5, value: 30, fit: 'hand', weapon: { dice: [1, 6], skill: 'melee' }, tool: ['smithing'] }),
  t({ id: 'warhammer', name: 'Warhammer', aliases: ['warhammer', 'war hammer', 'maul'], kind: 'weapon', icon: 'hammer', weight: 2.5, value: 120, fit: 'hand', weapon: { dice: [1, 8], skill: 'melee' } }),
  t({ id: 'spear', name: 'Spear', aliases: ['spear', 'pike', 'javelin', 'boar spear', 'trident'], kind: 'weapon', icon: 'sword', weight: 1.5, value: 15, fit: 'hand', weapon: { dice: [1, 6], skill: 'melee' } }),
  t({ id: 'staff', name: 'Staff', aliases: ['staff', 'quarterstaff', 'walking stick', 'stave'], kind: 'weapon', icon: 'rod', weight: 2, value: 5, fit: 'hand', twoHanded: true, weapon: { dice: [1, 6], skill: 'melee' } }),
  t({ id: 'pitchfork', name: 'Pitchfork', aliases: ['pitchfork', 'hayfork', 'fork', 'scythe', 'sickle'], kind: 'weapon', icon: 'fork', weight: 2, value: 8, fit: 'hand', twoHanded: true, weapon: { dice: [1, 6], skill: 'melee' } }),
  t({ id: 'pick', name: 'Pick', aliases: ['pick', 'pickaxe', 'pick axe', 'mattock'], kind: 'tool', icon: 'pick', weight: 3, value: 40, fit: 'hand', twoHanded: true, weapon: { dice: [1, 6], skill: 'melee' }, tool: ['mining'] }),
  t({ id: 'shortbow', name: 'Shortbow', aliases: ['shortbow', 'short bow', 'hunting bow', 'bow'], kind: 'weapon', icon: 'bow', weight: 1, value: 120, fit: 'hand', twoHanded: true, weapon: { dice: [1, 6], skill: 'ranged', ammo: 'arrow' } }),
  t({ id: 'longbow', name: 'Longbow', aliases: ['longbow', 'long bow', 'war bow', 'yew bow'], kind: 'weapon', icon: 'bow', weight: 1.5, value: 250, fit: 'hand', twoHanded: true, weapon: { dice: [1, 8], skill: 'ranged', ammo: 'arrow' } }),
  t({ id: 'crossbow', name: 'Crossbow', aliases: ['crossbow', 'arbalest'], kind: 'weapon', icon: 'bow', weight: 3, value: 300, fit: 'hand', twoHanded: true, weapon: { dice: [1, 10], skill: 'ranged', ammo: 'bolt' } }),
  t({ id: 'sling', name: 'Sling', aliases: ['sling'], kind: 'weapon', icon: 'bow', weight: 0.2, value: 5, fit: 'hand', weapon: { dice: [1, 4], skill: 'ranged', ammo: 'stone' } }),
  t({ id: 'arrows', name: 'Arrows', aliases: ['arrows', 'arrow', 'quiver'], kind: 'ammo', icon: 'arrow', weight: 0.05, value: 1, ammoKind: 'arrow' }),
  t({ id: 'bolts', name: 'Crossbow bolts', aliases: ['bolts', 'bolt', 'quarrels', 'crossbow bolts'], kind: 'ammo', icon: 'arrow', weight: 0.07, value: 2, ammoKind: 'bolt' }),
  t({ id: 'sling_stones', name: 'Sling stones', aliases: ['sling stones', 'sling stone', 'sling bullets', 'stones'], kind: 'ammo', icon: 'coin', weight: 0.05, value: 0, ammoKind: 'stone' }),

  // ---- armour --------------------------------------------------------------------------
  t({ id: 'leather_apron', name: 'Leather apron', aliases: ['leather apron', 'apron', "smith's apron"], kind: 'armor', icon: 'armor', weight: 1, value: 15, fit: 'body', armor: { bonus: 1 } }),
  t({ id: 'padded_armor', name: 'Padded jack', aliases: ['padded jack', 'gambeson', 'padded armour', 'padded armor', 'quilted coat'], kind: 'armor', icon: 'armor', weight: 3, value: 50, fit: 'body', armor: { bonus: 1 } }),
  t({ id: 'leather_armor', name: 'Leather armour', aliases: ['leather armour', 'leather armor', 'leathers', 'leather jerkin', 'jerkin', 'brigandine'], kind: 'armor', icon: 'armor', weight: 5, value: 100, fit: 'body', armor: { bonus: 2, maxAgi: 4 } }),
  t({ id: 'hide_armor', name: 'Hide armour', aliases: ['hide armour', 'hide armor', 'furs', 'hides'], kind: 'armor', icon: 'armor', weight: 6, value: 60, fit: 'body', armor: { bonus: 3, maxAgi: 3 } }),
  t({ id: 'chain_shirt', name: 'Chain shirt', aliases: ['chain shirt', 'chainmail', 'chain mail', 'mail shirt', 'hauberk', 'ringmail', 'ring mail'], kind: 'armor', icon: 'armor', weight: 10, value: 500, fit: 'body', armor: { bonus: 4, maxAgi: 2 } }),
  t({ id: 'plate_armor', name: 'Plate armour', aliases: ['plate armour', 'plate armor', 'plate mail', 'full plate', 'breastplate', 'cuirass'], kind: 'armor', icon: 'armor', weight: 20, value: 3000, fit: 'body', armor: { bonus: 6, maxAgi: 0, heavy: true } }),
  t({ id: 'dancers_wraps', name: "Dancer's wraps", aliases: ["dancer's wraps", 'dancers wraps', 'wraps'], kind: 'armor', icon: 'armor', weight: 0.5, value: 40, fit: 'body', armor: { bonus: 1 } }),
  t({ id: 'leather_cap', name: 'Leather cap', aliases: ['leather cap', 'cap', 'hood'], kind: 'armor', icon: 'armor', weight: 0.5, value: 10, fit: 'head', armor: { bonus: 0 } }),
  t({ id: 'iron_helm', name: 'Iron helm', aliases: ['iron helm', 'helm', 'helmet', 'steel cap', 'kettle hat'], kind: 'armor', icon: 'armor', weight: 2, value: 80, fit: 'head', armor: { bonus: 1 } }),
  t({ id: 'gloves', name: 'Gloves', aliases: ['gloves', 'gauntlets', 'mittens', 'knuckle wraps'], kind: 'clothing', icon: 'bandage', weight: 0.3, value: 10, fit: 'hands' }),
  t({ id: 'boots', name: 'Boots', aliases: ['boots', 'travel boots', 'riding boots'], kind: 'clothing', icon: 'boot', weight: 1.5, value: 30, fit: 'feet' }),
  t({ id: 'cloak', name: 'Cloak', aliases: ['cloak', 'cape', 'mantle', 'green cloak', 'oilskin'], kind: 'clothing', icon: 'armor', weight: 1.5, value: 20, fit: 'back' }),
  t({ id: 'round_shield', name: 'Round shield', aliases: ['round shield', 'shield', 'targe'], kind: 'shield', icon: 'armor', weight: 4, value: 50, fit: 'shield', armor: { bonus: 2 } }),
  t({ id: 'buckler', name: 'Buckler', aliases: ['buckler'], kind: 'shield', icon: 'armor', weight: 1.5, value: 30, fit: 'shield', armor: { bonus: 1 } }),

  // ---- tools & gear --------------------------------------------------------------------
  t({ id: 'fishing_rod', name: 'Fishing rod', aliases: ['fishing rod', 'rod', 'fishing pole'], kind: 'tool', icon: 'rod', weight: 1, value: 10, tool: ['fishing'] }),
  t({ id: 'net', name: 'Net', aliases: ['fishing net', 'net'], kind: 'tool', icon: 'net', weight: 2, value: 15, tool: ['fishing'] }),
  t({ id: 'mortar', name: 'Mortar and pestle', aliases: ['mortar and pestle', 'mortar', 'pestle'], kind: 'tool', icon: 'flask', weight: 1, value: 20, tool: ['alchemy'] }),
  t({ id: 'herb_pouch', name: 'Herb pouch', aliases: ['herb pouch', 'herbal pouch', 'herb bag'], kind: 'tool', icon: 'herb', weight: 0.3, value: 5, tool: ['herbalism'] }),
  t({ id: 'chisel_set', name: 'Chisel set', aliases: ['chisel set', 'chisels', 'chisel', 'carving tools'], kind: 'tool', icon: 'hammer', weight: 1, value: 30, tool: ['crafting', 'enchanting'] }),
  t({ id: 'sewing_kit', name: 'Sewing kit', aliases: ['sewing kit', 'needle and thread', "tanner's tools", 'awl'], kind: 'tool', icon: 'bandage', weight: 0.3, value: 10, tool: ['crafting'] }),
  t({ id: 'fletching_knife', name: 'Fletching knife', aliases: ['fletching knife', "fletcher's knife", 'whittling knife'], kind: 'tool', icon: 'dagger', weight: 0.2, value: 8, tool: ['fletching'] }),
  t({ id: 'cooking_pot', name: 'Cooking pot', aliases: ['cooking pot', 'pot', 'kettle', 'skillet', 'pan'], kind: 'tool', icon: 'flask', weight: 1.5, value: 15, tool: ['cooking'] }),
  t({ id: 'spice_pouch', name: 'Spice pouch', aliases: ['spice pouch', 'spices', 'salt'], kind: 'tool', icon: 'herb', weight: 0.2, value: 20, tool: ['cooking'] }),
  t({ id: 'lockpicks', name: 'Lockpicks', aliases: ['lockpicks', 'lock picks', "thieves' tools", 'thieves tools'], kind: 'tool', icon: 'key', weight: 0.1, value: 30 }),
  t({ id: 'rope', name: 'Rope', aliases: ['rope', 'cord', 'twine'], kind: 'tool', icon: 'chain', weight: 2, value: 5 }),
  t({ id: 'lantern', name: 'Lantern', aliases: ["miner's lantern", 'lantern', 'lamp'], kind: 'light', icon: 'candle', weight: 1, value: 25 }),
  t({ id: 'torch', name: 'Torch', aliases: ['torch', 'torches'], kind: 'light', icon: 'candle', weight: 0.5, value: 1 }),
  t({ id: 'tinderbox', name: 'Tinderbox', aliases: ['tinderbox', 'flint and steel', 'flint'], kind: 'tool', icon: 'candle', weight: 0.2, value: 5, tool: ['cooking', 'survival'] }),
  t({ id: 'bedroll', name: 'Bedroll', aliases: ['bedroll', 'blanket', 'sleeping roll'], kind: 'misc', icon: 'moon', weight: 2, value: 5 }),
  t({ id: 'harp', name: 'Silver harp', aliases: ['silver harp', 'harp', 'lyre', 'lute', 'flute', 'fiddle'], kind: 'trinket', icon: 'star', weight: 1.5, value: 300 }),
  t({ id: 'holy_symbol', name: 'Holy symbol', aliases: ['holy symbol', 'amulet', 'pendant'], kind: 'trinket', icon: 'amulet', weight: 0.1, value: 10, fit: 'neck' }),
  t({ id: 'bone_charms', name: 'Bone charms', aliases: ['bone charms', 'bone charm', 'fetish', 'charms'], kind: 'trinket', icon: 'amulet', weight: 0.2, value: 5, fit: 'neck' }),
  t({ id: 'ring', name: 'Ring', aliases: ['ring', 'signet'], kind: 'trinket', icon: 'coin', weight: 0.02, value: 50, fit: 'ring' }),
  t({ id: 'trinkets', name: 'Trinkets', aliases: ['trinkets', 'trinket', 'baubles', 'knick-knacks'], kind: 'trinket', icon: 'amulet', weight: 0.1, value: 10 }),
  t({ id: 'book', name: 'Book', aliases: ['book of names', 'book of the old tongues', 'book', 'tome', 'journal', 'scroll'], kind: 'book', icon: 'scroll', weight: 1, value: 50 }),
  t({ id: 'ink', name: 'Ink and quills', aliases: ['ink and quills', 'ink', 'quill', 'quills'], kind: 'tool', icon: 'quill', weight: 0.2, value: 15 }),
  t({ id: 'pack', name: "Peddler's pack", aliases: ["peddler's pack", 'pack', 'backpack', 'satchel', 'rucksack'], kind: 'container', icon: 'bag', weight: 1, value: 10 }),
  t({ id: 'rune_stones', name: 'Rune stones', aliases: ['rune stones', 'rune stone', 'runestones', 'runes'], kind: 'material', icon: 'crystal', weight: 0.3, value: 15 }),
  t({ id: 'moon_cloth', name: 'Moon-cloth', aliases: ['moon-cloth', 'moon cloth', 'silk'], kind: 'material', icon: 'moon', weight: 0.2, value: 40 }),

  // ---- food & drink --------------------------------------------------------------------
  t({ id: 'rations', name: 'Travel rations', aliases: ['travel rations', 'rations', 'ration', 'trail food', 'provisions', 'hardtack', 'waybread'], kind: 'food', icon: 'bread', weight: 0.5, value: 5, food: { hours: 12 } }),
  t({ id: 'dried_meat', name: 'Dried meat', aliases: ['dried meat', 'jerky', 'smoked meat', 'salt pork'], kind: 'food', icon: 'bread', weight: 0.3, value: 4, food: { hours: 8 } }),
  t({ id: 'bread', name: 'Bread', aliases: ['bread', 'loaf', 'bun', 'cheese', 'apple', 'apples', 'sausage', 'pie'], kind: 'food', icon: 'bread', weight: 0.3, value: 2, food: { hours: 6 } }),
  t({ id: 'cooked_fish', name: 'Cooked fish', aliases: ['cooked fish', 'cooked trout', 'smoked trout', 'grilled fish', 'fried eel', 'smoked eel'], kind: 'food', icon: 'bread', weight: 0.3, value: 6, food: { hours: 12, wellFed: true } }),
  t({ id: 'roast_meat', name: 'Roast meat', aliases: ['roast meat', 'roasted meat', 'cooked meat', 'roast rabbit', 'venison steak'], kind: 'food', icon: 'bread', weight: 0.4, value: 8, food: { hours: 14, wellFed: true } }),
  t({ id: 'stew', name: 'Hearty stew', aliases: ['hearty stew', 'stew', 'pottage', 'soup', 'hot meal'], kind: 'food', icon: 'bread', weight: 0.5, value: 6, food: { hours: 16, wellFed: true } }),
  t({ id: 'ale', name: 'Small cask of ale', aliases: ['small cask of ale', 'cask of ale', 'ale', 'beer', 'mead', 'wine', 'cider'], kind: 'drink', icon: 'drop', weight: 1, value: 10, food: { hours: 2 } }),
  t({ id: 'water', name: 'Waterskin', aliases: ['waterskin', 'water skin', 'water flask', 'canteen', 'flask of water'], kind: 'drink', icon: 'drop', weight: 1, value: 2 }),

  // ---- medicine ------------------------------------------------------------------------
  t({ id: 'bandages', name: 'Bandages', aliases: ['bandages', 'bandage', 'linen strips', 'dressing'], kind: 'medicine', icon: 'bandage', weight: 0.1, value: 3, heal: [1, 4, 0], cures: ['bleeding'] }),
  t({ id: 'healing_draught', name: 'Healing draught', aliases: ['healing draught', 'healing potion', 'potion of healing', 'health potion', 'tonic', 'potion'], kind: 'medicine', icon: 'flask', weight: 0.3, value: 60, heal: [2, 4, 2] }),
  t({ id: 'healing_salve', name: 'Healing salve', aliases: ['healing salve', 'salve', 'poultice', 'ointment'], kind: 'medicine', icon: 'herb', weight: 0.1, value: 20, heal: [1, 6, 1], cures: ['bleeding'] }),
  t({ id: 'antidote', name: 'Antidote', aliases: ['antidote', 'antivenom', 'anti-venom'], kind: 'medicine', icon: 'flask', weight: 0.2, value: 40, cures: ['poisoned'] }),

  // ---- materials (gathering and crafting) ----------------------------------------------
  t({ id: 'copper_ore', name: 'Copper ore', aliases: ['copper ore'], kind: 'material', icon: 'crystal', weight: 2, value: 3 }),
  t({ id: 'tin_ore', name: 'Tin ore', aliases: ['tin ore'], kind: 'material', icon: 'crystal', weight: 2, value: 3 }),
  t({ id: 'iron_ore', name: 'Iron ore', aliases: ['iron ore'], kind: 'material', icon: 'crystal', weight: 2, value: 6 }),
  t({ id: 'silver_ore', name: 'Silver ore', aliases: ['silver ore'], kind: 'material', icon: 'crystal', weight: 2, value: 20 }),
  t({ id: 'coal', name: 'Coal', aliases: ['coal', 'charcoal'], kind: 'material', icon: 'crystal', weight: 1, value: 2 }),
  t({ id: 'rough_gem', name: 'Rough gem', aliases: ['rough gem', 'uncut gem', 'gem', 'gemstone', 'crystal'], kind: 'material', icon: 'crystal', weight: 0.1, value: 80 }),
  t({ id: 'bronze_bar', name: 'Bronze bar', aliases: ['bronze bar', 'bronze ingot'], kind: 'material', icon: 'crystal', weight: 1, value: 15 }),
  t({ id: 'iron_bar', name: 'Iron bar', aliases: ['iron bar', 'iron ingot', 'pig iron', 'scrap iron', 'bag of scrap iron'], kind: 'material', icon: 'crystal', weight: 1, value: 25 }),
  t({ id: 'silver_bar', name: 'Silver bar', aliases: ['silver bar', 'silver ingot'], kind: 'material', icon: 'crystal', weight: 1, value: 120 }),
  t({ id: 'logs', name: 'Logs', aliases: ['pine logs', 'logs', 'log', 'firewood', 'timber', 'wood'], kind: 'material', icon: 'pick', weight: 3, value: 2 }),
  t({ id: 'oak_logs', name: 'Oak logs', aliases: ['oak logs', 'oak log', 'oak'], kind: 'material', icon: 'pick', weight: 3, value: 5 }),
  t({ id: 'yew_logs', name: 'Yew logs', aliases: ['yew logs', 'yew log', 'yew staves', 'yew'], kind: 'material', icon: 'pick', weight: 2, value: 12 }),
  t({ id: 'raw_fish', name: 'Raw fish', aliases: ['raw fish', 'trout', 'fish', 'perch', 'carp', 'pike fish', 'salmon'], kind: 'material', icon: 'drop', weight: 0.5, value: 2 }),
  t({ id: 'raw_eel', name: 'Raw eel', aliases: ['raw eel', 'eel', 'eels'], kind: 'material', icon: 'drop', weight: 0.5, value: 3 }),
  t({ id: 'raw_meat', name: 'Raw meat', aliases: ['raw meat', 'venison', 'rabbit', 'hare', 'game meat', 'carcass', 'meat'], kind: 'material', icon: 'bread', weight: 1, value: 3 }),
  t({ id: 'hide', name: 'Animal hide', aliases: ['animal hide', 'hide', 'pelt', 'pelts', 'fur', 'wolf pelt', 'deer hide'], kind: 'material', icon: 'armor', weight: 2, value: 10 }),
  t({ id: 'leather', name: 'Leather', aliases: ['leather', 'tanned leather', 'leather strips'], kind: 'material', icon: 'armor', weight: 1, value: 12 }),
  t({ id: 'feathers', name: 'Feathers', aliases: ['feathers', 'feather', 'fletching feathers', 'goose feathers'], kind: 'material', icon: 'quill', weight: 0.01, value: 0 }),
  t({ id: 'arrow_shafts', name: 'Arrow shafts', aliases: ['arrow shafts', 'shafts', 'arrow shaft'], kind: 'material', icon: 'arrow', weight: 0.02, value: 0 }),
  t({ id: 'bowstring', name: 'Bowstring', aliases: ['bowstring', 'bow string', 'sinew'], kind: 'material', icon: 'chain', weight: 0.05, value: 5 }),
  t({ id: 'cloth', name: 'Cloth', aliases: ['cloth', 'linen', 'wool', 'flax', 'rags'], kind: 'material', icon: 'bandage', weight: 0.5, value: 4 }),
  t({ id: 'common_herbs', name: 'Common herbs', aliases: ['common herbs', 'herbs', 'herb', 'yarrow', 'feverfew', 'thyme', 'sage'], kind: 'material', icon: 'herb', weight: 0.05, value: 1 }),
  t({ id: 'healing_moss', name: 'Healing moss', aliases: ['healing moss', 'bloodmoss', 'woundwort', 'moss'], kind: 'material', icon: 'herb', weight: 0.05, value: 6 }),
  t({ id: 'nightshade', name: 'Nightshade', aliases: ['nightshade', 'belladonna', 'deathcap', 'hemlock'], kind: 'material', icon: 'herb', weight: 0.05, value: 10 }),
  t({ id: 'empty_vial', name: 'Empty vial', aliases: ['empty vial', 'vial', 'vials', 'bottle', 'flask'], kind: 'material', icon: 'flask', weight: 0.1, value: 2 }),
  // ---- grim far-future gear (scifi.ts) ----------------------------------------------
  ...SCIFI_ITEMS
]

const BY_ID = new Map(ITEMS.map((x) => [x.id, x]))
export const itemTemplate = (id: string | undefined) => (id ? BY_ID.get(id) : undefined)

/** Lower case, possessives and punctuation dropped: "Smith's Hammer!" → "smith hammer". */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const ALIASES: { alias: string; item: ItemTemplate }[] = ITEMS.flatMap((item) =>
  [item.name, ...item.aliases].map((a) => ({ alias: norm(a), item }))
).sort((a, b) => b.alias.length - a.alias.length)

/**
 * The template an item name means: the longest name or alias found in it as whole words
 * ("Rusty iron sword" → Sword; "Bag of scrap iron" → Iron bar). Undefined if nothing fits.
 */
export function findTemplate(name: string): ItemTemplate | undefined {
  const n = ` ${norm(name)} `
  const singular = ` ${norm(name).replace(/s\b/g, '')} `
  for (const { alias, item } of ALIASES) {
    if (!alias) continue
    if (n.includes(` ${alias} `) || singular.includes(` ${alias.replace(/s\b/g, '')} `)) return item
  }
  return undefined
}

/** Weight of one unit of an item the engine knows nothing about. */
export const UNKNOWN_WEIGHT = 0.5

/** Coins weigh something too: 100 coins to the kilogram. */
export const COINS_PER_KG = 100
