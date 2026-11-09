import { normalizeEntry, type Lorebook, type LoreEntry } from './lore'

/**
 * Starter worlds (docs/spec/10-roadmap.md, Milestone 2): a small region with a filled-in
 * lorebook and an opening scene, to play in straight away or to copy and learn from.
 * Each world's lorebook is put in the library on first start, where it can be edited.
 */

export type World = {
  id: string
  name: string
  tagline: string
  /** Where the character starts. */
  start: string
  /** What the DM's first scene should be. */
  opening: string
  lorebook: Lorebook
}

const entry = (name: string, keys: string[], content: string, more: Partial<LoreEntry> = {}): LoreEntry =>
  normalizeEntry({ id: `cm_${name.toLowerCase().replace(/[^a-z]+/g, '_')}`, name, keys, content, ...more })

const MARCHES: World = {
  id: 'cinder_marches',
  name: 'The Cinder Marches',
  tagline: 'A grey border country, twenty years after the mountain buried the old capital in ash.',
  start: 'Wending',
  opening:
    "Begin at dusk on the toll bridge at Wending, as the gates are about to close. The Bridgewarden's guards are arguing with a cart of frightened miners' families down from Cragstead, where something has gone wrong in the deep workings. Give the player character a reason of their own to be on that bridge, fitting their calling, and let them decide what to do.",
  lorebook: {
    id: 'world_cinder_marches',
    name: 'The Cinder Marches (example world)',
    description:
      'A small starter region: four settlements, two powers, a handful of people and dangers. Every entry here is plain text you can change, and a good model of how to write your own.',
    entries: [
      entry(
        'The Cinder Marches',
        [],
        'THE CINDER MARCHES: a border province of the old Kingdom of Aldmere, wet green valleys under grey hills. Twenty years ago Mount Corrow erupted (the Greyfall) and buried the old provincial capital, Emberhall, in ash. The ash made the valley soil the richest in the kingdom, so farmers and fortune-seekers flooded in; it also drove beasts and worse down out of the hills. The Margrave rules from Highkeep, the crown is far away and poor, and every road has a toll. Money: gold crowns, silver shillings, copper pennies (10 pennies to a shilling, 10 shillings to a crown). Ordinary folk see a gold crown a few times in their lives.',
        { constant: true, priority: 200 }
      ),
      entry(
        'Wending',
        ['Wending', 'toll bridge', 'the bridge'],
        "WENDING: a walled market town built around a great stone toll bridge over the River Sallow, the only crossing for twenty miles. About two thousand people. Inns: the Lantern and Hook (decent, near the bridge), the Drowned Ox (cheap, rough, by the tanneries). The gates shut at dusk and open at dawn; anyone outside sleeps outside. Market day is every seventh day. Half a day's walk to Hollowmere, a hard day uphill to Cragstead, two days' ride to Highkeep.",
        { priority: 120 }
      ),
      entry(
        'Bridgewarden Orla Hask',
        ['Orla', 'Hask', 'Bridgewarden'],
        "ORLA HASK, Bridgewarden of Wending: a heavy-set woman of fifty with a soldier's limp and a ledger she never lets out of reach. She collects the Margrave's tolls and keeps the peace in town with twelve guards. Fair by her own lights, unbribable in public, quietly drowning in debt to the Margrave's tax-farmers, which makes her desperate for anything that would earn her favour at Highkeep. She distrusts the Grey Brothers and has a soft spot for the miners.",
        { priority: 110 }
      ),
      entry(
        'Hollowmere',
        ['Hollowmere', 'the mere', 'black lake'],
        "HOLLOWMERE: a fishing village of stilt houses on a deep black lake fed by hot springs, so it never freezes. Famous for eels and smoked trout. Villagers leave a fish on the jetty for 'the Lady' every evening and won't say why. People drown there more often than they should, always on still nights. The half-sunk ruin of an abbey stands in the shallows at the north end.",
        { priority: 100 }
      ),
      entry(
        'The Drowned Abbey',
        ['Drowned Abbey', 'abbey'],
        'THE DROWNED ABBEY: the old Abbey of Saint Wenna at Hollowmere, flooded when the lake rose after the Greyfall. The bell tower still stands above the water and the bell sometimes rings with no one in it. Locals say the abbess refused to leave. Her relics, and the abbey treasury, are supposed to be somewhere in the flooded crypt.',
        { priority: 90 }
      ),
      entry(
        'Old Moll',
        ['Moll', 'herb-woman', 'herbwife'],
        "OLD MOLL: Hollowmere's herb-woman and midwife, eighty if a day, sharp as a gutting knife. Sells cures, charms and advice, and will trade a secret for a secret. She was a novice at the abbey before the flood and knows what really happened there, but she will only speak of it to someone who has done her a real kindness first.",
        { priority: 90 }
      ),
      entry(
        'Cragstead',
        ['Cragstead', 'the mine', 'deep workings', 'miners'],
        "CRAGSTEAD: a muddy silver-mining camp high in the Ashen Hills, three hundred miners and their families. The Margrave owns the mine and takes half; the Miners' Fellowship fights him for the rest. Silver came easy after the Greyfall cracked the hillside open. Lately the deep workings have been 'singing' (a low humming in the rock), three miners have gone missing below, and the overseer has sealed the lowest gallery and told everyone to keep quiet.",
        { priority: 100 }
      ),
      entry(
        'The Ashen Hills',
        ['Ashen Hills', 'the hills', 'hill road'],
        'THE ASHEN HILLS: grey, steep, treeless above the pine line, still drifted with old ash that turns to paste in the rain. Dangers: greycoats (big wolves with ash-matted fur that hunt in silent packs), rockfalls, sinkholes into old lava tubes, and barrow-lights (pale lights over the ash fields that lead travellers off the path). Shepherds and prospectors live up here and trust no one.',
        { priority: 80 }
      ),
      entry(
        'Greycoats',
        ['greycoat', 'greycoats', 'wolves', 'wolf'],
        'GREYCOATS: wolves of the Ashen Hills, larger than lowland wolves, grey with ash, unnervingly quiet. They test a traveller for days before they strike, and they go for horses first. A pack is six to ten. Their pelts sell for a silver shilling each in Wending.',
        { priority: 70 }
      ),
      entry(
        'The Margrave',
        ['Margrave', 'Ruel', 'Highkeep'],
        "MARGRAVE TOBIAS RUEL rules the Marches from Highkeep, a grim fortress on a crag two days north of Wending. He is old, ill and greedy, squeezing the province to pay debts to the crown. His two heirs are at each other's throats: Lady Isolde (clever, cold, runs his spies) and Ser Gerran (popular, reckless, commands the riders). Whoever brings the Margrave good news, or silver, is welcome at Highkeep.",
        { priority: 90 }
      ),
      entry(
        'The Grey Brothers',
        ['Grey Brothers', 'Grey Brother', 'brothers', 'monk', 'monks'],
        'THE GREY BROTHERS: an order of monks in ash-grey habits who appeared after the Greyfall to bury the dead of Emberhall and never left. They run a hospice outside Wending, heal anyone for free and bury anyone who asks. Respected by the poor, mistrusted by the powerful. They go up into the ash fields of Emberhall, where no one else goes, and come back with things they do not show anyone.',
        { priority: 90 }
      ),
      entry(
        'The Free Pennies',
        ['Free Pennies', 'bandits', 'outlaws', 'Corran'],
        "THE FREE PENNIES: a band of thirty-odd outlaws in the pine woods along the Sallow, led by Captain Mags Corran, a former toll-guard. They rob the Margrave's tax wagons and toll-takers and share some of it with the villages, which hide them. They rarely kill, but they hang informers. A price of five gold crowns hangs on Mags Corran's head.",
        { priority: 90 }
      ),
      entry(
        'Emberhall',
        ['Emberhall', 'old capital', 'ash fields'],
        "EMBERHALL: the old provincial capital, buried in ash to its rooftops by the Greyfall. Thousands died. Spires and chimneys still poke out of the grey dunes. It is forbidden to enter by the Margrave's law (looters hang), and the Grey Brothers patrol it. Treasure-seekers go anyway. Some come back. They don't talk about what they heard in the buried streets.",
        { priority: 80 }
      ),
      entry(
        'Mount Corrow',
        ['Corrow', 'the mountain', 'Smoking Peak', 'Greyfall'],
        'MOUNT CORROW and THE GREYFALL: the volcano that looms over the north of the Marches. Twenty years ago it erupted without warning, burying Emberhall and blackening the sky for a season. It still smokes. The Grey Brothers say it will wake again. Old people say it erupted because something under Emberhall was disturbed.',
        { priority: 80 }
      ),
      entry(
        'Faith',
        ['Hearthfather', 'shrine', 'pray', 'prayer', 'priest', 'temple', 'gods'],
        'FAITH in the Marches: most folk keep the Hearthfather, god of homes, guests and fire, with a small shrine by every hearth; to break bread under someone\'s roof and then harm them is the worst sin there is. Fishers at Hollowmere quietly honour "the Lady" of the lake. Priests are few and poor. The Grey Brothers claim no god at all, which scandalises the priests.',
        { priority: 60 }
      ),
      entry(
        'Magic',
        ['magic', 'spell', 'witch', 'sorcery', 'sorcerer', 'ember-sight'],
        'MAGIC in the Marches is rare, quiet and feared. Hedge-witches deal in cures, curses and charms; a few people born after the Greyfall have "ember-sight" (seeing heat and fire through walls, sometimes a flash of the future in flames). The Margrave\'s law calls sorcery a hanging crime, but no one enforces it against a midwife who saved their child. Open spellcasting in a town draws a crowd and then a guard.',
        { priority: 60 }
      ),
      entry(
        'Law and custom',
        ['law', 'guards', 'sword', 'swords', 'arrest', 'gaol', 'jail'],
        "LAW AND CUSTOM: inside town walls, only the Margrave's men may carry swords; knives, staves and hunting bows are allowed. Theft means a branding, murder a hanging. Guests are sacred under a roof (see the Hearthfather). Women run most of the Marches' trade and inns; soldiering and the mines are mostly men's work, and a woman with a sword draws stares.",
        { priority: 60 }
      ),
      entry(
        'Travel',
        ['road', 'travel', 'journey', 'how far', 'miles'],
        'TRAVEL in the Marches: the river road along the Sallow is safe by day. Wending to Hollowmere: half a day on foot. Wending to Cragstead: a long day uphill, or two in rain when the ash turns to paste. Wending to Highkeep: two days on horseback, three on foot. Nobody travels the hills at night. A horse costs about three gold crowns; a night at a decent inn, three pennies; a hot meal, one.',
        { priority: 50 }
      )
    ]
  }
}

export const WORLDS: World[] = [MARCHES]
export const findWorld = (id: string) => WORLDS.find((w) => w.id === id)
