import {
  BANNED_NAMES,
  CONDITIONS,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  RACES,
  RENOWN_TIERS,
  SEXES,
  AGES,
  BACKGROUNDS,
  SKILL_IDS,
  SKILLS,
  TIER_INFO,
  derived,
  ENEMY_TIERS,
  foeHealth,
  rangeOf,
  knownSpells,
  SPELLS,
  capacityKg,
  carriedKg,
  defenseValue,
  encumbrance,
  generateName,
  HUNGER_LABEL,
  mainWeapon,
  needs,
  skillLevelFromXp,
  type CampaignSettings,
  type CheckResult,
  type EnemyTier,
  type FoeSpec,
  type GameState,
  type Rng,
  type SkillId,
  type Weather,
  weatherNow,
  weatherPassed,
  ageStage,
  ageYears,
  agesBrief,
  buildNow,
  practiced,
  spanSentence,
  type SkipPlan,
  atHome,
  HOMES,
  jobLevel,
  weeklyPay,
  dateLabel,
  SEASON_INFO,
  seasonOf,
  allyHealth,
  ROLE_INFO,
  type Companion
} from '@shared/rules'
import type { ChatMessage } from '@shared/types'
import type { CardBookEntry, CastMember } from '@shared/cards'
import { formatCoins } from '../core/campaigns'
import { peoplesBlock } from '@shared/cultures'
import { scifiTerms } from '@shared/genre'

/**
 * The Narrator's prompt (docs/spec/06-ai-dm.md#6-narrate). The engine has already decided
 * what happened; the narrator turns it into story and must not change the outcome.
 */

const LENGTH = { short: '1–2 short paragraphs', medium: '2–4 paragraphs', long: '4–6 paragraphs' }
/**
 * A grim far-future story (docs/spec/06-ai-dm.md#genre). The rules underneath stay fantasy-shaped
 * (callings, items, spells), so the DM tells them in the setting's terms; the world's own lore
 * supplies the names and the particulars.
 */
const SCIFI = `THE SETTING IS SCIENCE FICTION, NOT FANTASY
- A grim far future: vast, decaying empires that spread across the stars; hive cities stacked into the smog and sprawling underhives; voidships, orbital stations and the black between worlds; faith and machine-rite side by side; old technology half understood and kept by ritual; zealots, heretics, mutants and alien things. Life is cheap and grinding, and authority is enormous, cruel and far away.
- Tell it with gothic weight: grand, grim and a little baroque. Let the scale dwarf the people in it; let dread, faith and filth sit side by side; give the setting's institutions a cold, bureaucratic menace. Plain, sardonic soldiers' talk is welcome.
- Describe the world in its own terms, never fantasy ones: guns, blades and armour, augmetics and machines, rations and stimms, uniforms and vox-casters, not taverns, swords and spellbooks, unless the setting's lore has them. Take names, places, factions, ranks and technology from the world's lore whenever it has them.
- The game's rules use fantasy words for some things. Tell each as its nearest equivalent in this setting: a sword or axe as a combat blade or chainblade, a bow or crossbow as a rifle or pistol and its arrows as ammunition, armour as flak or carapace, a spell as a psychic power or a device's function and mana as the strain of it, herbs and potions as medicae supplies and stimms, coin as the setting's currency, a calling as their trade or posting, an inn as a hab, mess or drinking den. The character's gear and money below are listed in those fantasy words: never use them in the story (no swords, bows, arrows, spells, mana, potions, or gold, silver and copper coins); say the setting's equivalent instead. The engine's numbers and outcomes stand exactly as given.
- The game's peoples are the setting's: humans as humans, and the others as its nearest kin if it has them (long-lived, aloof aliens for elves; stout miners from heavy worlds for dwarves; brutish greenskins for orcs; small, quick folk for halflings).`

const CONTENT: Record<CampaignSettings['content'], string> = {
  mild: 'Keep it suitable for any audience: danger and violence without gore, romance without sex, no crude talk beyond mild oaths.',
  mature:
    "This is fiction for adults. Tell the world frankly and don't sanitise it: people's bodies, looks and appetites, flirting and lust, crude talk and swearing, drink and squalor, cruelty, and violence with its blood and wounds shown plainly. Characters are as they would really be: the barmaid of a seedy tavern can be bawdy and showing a lot, a mercenary foul-mouthed. Sex happens off the page: lead up to it, then cut away.",
  explicit:
    "This is fiction for adults, told with nothing held back: people's bodies, looks and appetites, crude talk, cruelty, and violence with its blood and wounds shown plainly. Characters are as they would really be. When the story goes there with the player's lead, sex may be described explicitly. Never any sexual content involving anyone under 18 or who seems to be a child."
}

const TONE = {
  grim: 'grim and unforgiving: the world is cruel, hope is scarce',
  grounded: 'grounded and dangerous: a believable world where actions have weight',
  heroic: 'heroic and vivid: bold deeds, but real danger',
  whimsical: 'whimsical and warm, with real stakes underneath',
  horror: 'creeping horror: dread, the unknown, and fragile people'
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, '')} […]` : s)

/** Companions from imported cards, played by the DM. */
/**
 * Who travels with the player: characters from cards (their card in full) and people met in
 * the story (their record), with how each is faring.
 */
function companionBlock(state: GameState, cast: CastMember[], records: Record<string, string> = {}): string {
  const party = state.party ?? []
  if (!party.length) return ''
  const lvl = state.character.level
  const one = (a: Companion) => {
    const head = `${a.name} (${ROLE_INFO[a.role].label.toLowerCase()}; ${allyHealth(a, lvl)})`
    const m = a.card ? cast.find((x) => x.cardId === a.card) : undefined
    if (!m) return `${head}: ${records[a.id] || 'met on the road; little is known of them yet.'}`
    return [
      `${head}:`,
      m.description && clip(m.description, 4000),
      m.personality && `Personality: ${clip(m.personality, 800)}`,
      m.scenario && `Their situation: ${clip(m.scenario, 1200)}`,
      m.mesExample && `How they talk (examples only; never repeat them):\n${clip(m.mesExample.replace(/<START>/gi, '').trim(), 1500)}`
    ]
      .filter(Boolean)
      .join('\n')
  }
  return `\n\nCOMPANIONS (you play them)
${party.length === 1 ? 'This character travels' : 'These characters travel'} with the player. You voice them and decide what they do, like any other non-player character: they have their own will, can disagree, get hurt or die, and don't solve the player's problems for them. Their speech uses the @Name: line format too. In a fight the game rolls their blows and tells you what each of them did: tell it as it happened.
${party.map(one).join('\n\n')}`
}

/** Lorebook entries the recent story touches, with the world notes (and in the other places they ask for). */
export function loreBlock(entries: CardBookEntry[]): string {
  const here = entries.filter((e) => !e.position || e.position === 'scene')
  if (!here.length) return ''
  return `\n\nWORLD NOTES (background facts; use them when they matter)\n${here.map((e) => `- ${e.content.trim()}`).join('\n')}`
}

/** Entries placed before or after the character. */
function loreAt(entries: CardBookEntry[], where: 'before_char' | 'after_char'): string {
  const here = entries.filter((e) => e.position === where)
  if (!here.length) return ''
  return `${where === 'before_char' ? 'THE WORLD (keep these true)' : 'MORE ABOUT THE WORLD'}\n${here.map((e) => `- ${e.content.trim()}`).join('\n')}\n\n`
}

/** Long-term memory for the prompt: older story in summary, and people and places met. */
export type MemoryText = { story: string; people: string; notes?: string; companions?: Record<string, string>; factions?: string; quests?: string; family?: string }

function memoryBlock(m?: MemoryText): string {
  if (!m) return ''
  let out = ''
  if (m.notes?.trim()) out += `\n\nPINNED NOTES (the player wants you to always keep these true)\n${m.notes.trim()}`
  if (m.story.trim()) out += `\n\nTHE STORY SO FAR (older events, in order; the conversation continues from here)\n${m.story.trim()}`
  if (m.people.trim()) out += `\n\nPEOPLE AND PLACES FROM EARLIER (keep their names, facts and feelings consistent; people who are dead stay dead)\n${m.people.trim()}`
  if (m.quests?.trim()) out += `\n\nQUESTS THE CHARACTER HAS TAKEN ON (keep them in mind; let them come up in the story, don't force them)\n${m.quests.trim()}`
  if (m.factions?.trim()) out += `\n\nWHAT GROUPS THINK OF THE CHARACTER (let it show in how their people treat them: a welcome or a cold shoulder, help or hindrance, prices, trust)\n${m.factions.trim()}`
  return out
}

/** The DM's persona, resolved by the caller (a built-in one, or a character card). */
export type PersonaText = { name: string; voice: string; ooc: 'follow' | 'argue'; fromCard?: boolean; habit?: string }

export function narratorSystem(
  state: GameState,
  settings: CampaignSettings,
  names: string[],
  cast: CastMember[] = [],
  lore: CardBookEntry[] = [],
  memory?: MemoryText,
  persona?: PersonaText
): string {
  const c = state.character
  // The character as they are now: their age moves through the years (calendar.ts).
  const b = buildNow(state)
  const d = derived(state, settings)
  const sex = SEXES[settings.sexModifiers][b.sex]
  const skills = SKILL_IDS.map((s) => [s, skillLevelFromXp(c.skillXp[s] ?? 0)] as const)
    .filter(([, l]) => l >= 3)
    .sort((a, b2) => b2[1] - a[1])
    .slice(0, 8)
    .map(([s, l]) => `${SKILLS[s].label} ${l}`)
    .join(', ')
  const tier = RENOWN_TIERS.find((t) => c.renown >= t.min)!.label
  const deeds = c.deeds.slice(-4).map((x) => x.text).join('; ')
  const hour = Math.floor(state.time.minute / 60)
  const timeOfDay = hour < 5 ? 'night' : hour < 8 ? 'dawn' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 20 ? 'evening' : 'night'

  // Gear, load and needs (docs/spec/04-rules-system.md#items-equipment-money).
  const weapon = mainWeapon(c)
  const worn = c.inventory.filter((i) => i.equipped && i.equipped !== 'main').map((i) => i.name)
  const load = encumbrance(c)
  const need = needs(state, settings.survival)
  const tiredness = need.exhaustion ? `exhausted (level ${need.exhaustion}, awake ${need.hoursAwake} hours)` : need.hoursAwake >= 14 ? `tired (awake ${need.hoursAwake} hours)` : 'rested'
  // In a far-future story the gear is told in its terms before the DM ever sees a sword (genre.ts).
  const says = (t: string) => (settings.genre === 'scifi' ? scifiTerms(t) : t)
  const gear = says(`Wielding: ${weapon.unarmed ? 'nothing (bare fists)' : weapon.name}. Wearing: ${worn.join(', ') || 'ordinary clothes'}. Defense ${defenseValue(c).total}.`)
  const carrying = says(`Carrying: ${c.inventory.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || 'nothing'}; ${settings.genre === 'scifi' ? `${c.coins} scrip` : formatCoins(c.coins)}.`) + (load !== 'none' ? ` ${load === 'overloaded' ? 'OVERLOADED' : 'ENCUMBERED'}: carrying ${carriedKg(c)} kg of a comfortable ${capacityKg(c)} kg.` : '')
  const body = settings.survival ? `\nHunger: ${HUNGER_LABEL[need.hunger].toLowerCase()} (last proper meal ${need.hoursSinceMeal} hours ago). Tiredness: ${tiredness}.` : ''
  // Magic (docs/spec/04-rules-system.md#spells-v1-simple): what they know, and what can be taught.
  const known = knownSpells(state)
  const magic = `\n${known.length ? `Spells known: ${known.map((sp) => `${sp.name} (${sp.cost} mana: ${sp.blurb.replace(/\.$/, '')})`).join('; ')}.` : 'Knows no spells.'} The spells that exist, if a teacher or a tome ever offers one: ${SPELLS.map((sp) => sp.name).join(', ')}. Name a spell plainly when the character learns it.`

  const voice = persona?.voice.trim()
    ? persona.fromCard
      ? `\n\nYOUR VOICE AS DM\nYou are ${persona.name}, telling this story as its Dungeon Master. ${persona.voice.trim()}\nYour voice changes how the story is told, never what the dice decided.`
      : `\n\nYOUR VOICE AS DM\n${persona.voice.trim()}\nYour voice changes how the story is told, never what the dice decided.`
    : ''
  const third = settings.perspective === 'third'
  const ooc =
    persona?.ooc === 'argue'
      ? 'Text in ((double parentheses)) is the player talking to you out of character. You may push back, bargain, or grant it with a twist, in your own voice; never lie about what the dice decided, and never treat it as something the character said.'
      : "Text in ((double parentheses)) is an out-of-character instruction to you: follow it and don't treat it as story."
  const acting =
    settings.acting === 'light'
      ? `The player controls their character's choices, words and decisions. You may describe small involuntary reactions (a flinch, a shiver, a racing heart), but never what ${third ? b.name : 'they'} decide, say or think. Describe the world, other people, and the results of the character's actions, then stop and let the player act.`
      : "The player controls their character completely. Never decide, say, think or feel anything on the player character's behalf. Describe the world, other people, and the results of the character's actions, then stop and let the player act."
  const pacing =
    settings.pacing === 'guided'
      ? 'Keep a story moving: give the character a clear goal, raise the stakes, and steer gently toward the next turn of the plot, without taking choices away from the player.'
      : "Let the player lead. Offer hooks and let the world react to what they do, but don't push a plot on them."
  // Grimdark science fiction (genre.ts): resolved before this, so 'auto' never reaches here as sci-fi.
  const scifi = settings.genre === 'scifi'
  // The peoples' ways (cultures.ts): the world's defaults, unless its lore says otherwise. They're
  // a fantasy world's villages and crafts, so a far-future story goes by its own lore instead.
  const peoples = scifi ? '' : peoplesBlock(settings, b)
  const limits = settings.limits.trim() ? `\n- Content to avoid, or to fade to black instead of describing: ${settings.limits.trim().replace(/\s+/g, ' ')}.` : ''
  // How frankly to tell it. Left unsaid, models sanitise everyone (a seedy tavern's barmaid turns PG).
  const content = CONTENT[settings.content] ?? CONTENT.mature

  // Fights (docs/spec/04-rules-system.md#combat): on the tracker, the engine owns every blow.
  const cb = state.combat
  const fight = cb
    ? `\n\nTHE FIGHT (the game engine runs it)
Round ${cb.round}. ${cb.foes.map((f) => `${f.name}: ${foeHealth(f)}, ${rangeOf(f)}`).join('; ')}.
Only these foes are in the fight. The [GAME ENGINE] block says what every blow did: narrate exactly that, in order. Never add attacks, wounds, deaths or enemies of your own, and never end the fight yourself; the engine says when it's over. Keep each foe where the engine says it is (close: within reach; near: a few strides off; far: a bowshot away). End each reply at a moment where the character must act.
While the fight lasts, keep it lean, like a battle log: two to four short sentences a round, one beat for each blow that matters, plain and quick. Save the scenery for after.`
    : settings.combat !== 'narrative' && c.status === 'alive'
      ? `\n\nSTARTING A FIGHT
If enemies attack the character on their own (not because of what the player just did: the game engine handles that), end your reply with one line in this form, and stop before any blow lands:
[[FIGHT: 2 bandit, 1 bandit captain (elite) | ambush]]
List who attacks: how many of each and what they are. Mark a veteran or a big beast (elite), a legendary foe (boss), and weak ones (minion), and anyone not within a blade's reach as (near) or (far), like [[FIGHT: 1 bandit archer (far)]]. Add "| ambush" if they strike from hiding. The engine then runs the fight. Never use it when the [GAME ENGINE] block says a fight has begun.`
      : ''
  const askRoll = cb
    ? ''
    : `\n\nASKING FOR A ROLL
If something happens to the character that they might notice, resist or react to without having chosen to act (an ambush, a lie, a trap, a pickpocket), you may end your reply with exactly one line in this form, and then stop without revealing the outcome:
[[ROLL: skill | difficulty | short reason]]
Skills: ${SKILL_IDS.join(', ')}. Difficulty: ${DIFFICULTIES.join(', ')}. Use this sparingly, at most once every few turns.`

  return `You are the Dungeon Master of a ${TONE[settings.tone]} ${scifi ? 'science-fiction roleplaying game, set in a grim far future' : 'fantasy roleplaying game'}.${voice}

HOW TO RUN THE GAME
- ${third ? `Write in third person about ${b.name}, present tense` : 'Write in second person ("you"), present tense'}, vivid but economical. Aim for ${cb ? 'two to four short sentences while the fight lasts' : LENGTH[settings.length]}.
- ${acting}
- In the player's messages, text "in quotation marks" is what the character says aloud; everything else is what they do. ${ooc}
- ${pacing}
- ${content}${limits}
- A game engine rolls the dice. When the player's message ends with a [GAME ENGINE] block, it states what happened. Narrate exactly that outcome. Never turn a failure into a success or a success into a failure, never ignore damage, and never rescue the character at the last moment.${settings.failForward ? ' On a narrow failure, the character may succeed at a cost instead.' : ''}
- Match the outcome's strength: a critical success is memorable and brings something extra; a narrow success is a close call; a critical failure goes wrong in a way that matters.
- Stay in the story. Never write out-of-character notes, questions or ((bracketed)) asides yourself. If the player's action doesn't quite fit the scene (it mentions someone who isn't there, or an item they don't have), interpret it in the most sensible way the scene allows and narrate that; what the dice decided still stands.
- Play fair and play hard. The world does not bend to protect the player. Non-player characters have their own goals and act in their own interest.
- IMPORTANT FORMAT RULE: every time a non-player character speaks, put their words on a separate line that starts with @ and their name, then a colon, then the quoted words. The app turns these lines into speech bubbles with portraits. For example:
  The old man spits into the river.
  @Old Tam: "Road's not safe after dark."
  Never write speech inline like: "Road's not safe," the old man says. The @Name is whoever is speaking, never whoever they speak to, and never ${b.name}. It only ever starts a line: never put it inside a sentence or inside quotation marks.
- For new characters, prefer names from this list: ${names.join(', ')}. Never use these overused names: ${BANNED_NAMES.slice(0, 10).join(', ')}.
- People the story already knows keep who they are: their race, sex, age, calling, looks and manner as their record below gives them. ${agesBrief()}
- Avoid stock phrases ("a shiver ran down your spine", "a testament to", "barely above a whisper").${askRoll}${fight}

${scifi ? `${SCIFI}

` : ''}${peoples ? `${peoples}

` : ''}${loreAt(lore, 'before_char')}THE PLAYER CHARACTER
${b.name}: ${RACES[b.race].label.toLowerCase()}, ${sex.label.toLowerCase()}, ${ageYears(state)} years old (${AGES[b.age].label.toLowerCase()}), ${b.job?.trim() || BACKGROUNDS[b.background].label.toLowerCase()}.${b.appearance ? `\nAppearance: ${b.appearance}` : ''}${b.personality ? `\nPersonality: ${b.personality}` : ''}${b.details?.trim() ? `\nAlso: ${b.details.trim()}` : ''}
Level ${c.level}. Health ${c.hp}/${d.maxHp}, stamina ${c.stamina}/${d.maxStamina}${d.maxMana ? `, mana ${c.mana}/${d.maxMana}` : ''}.${c.conditions.length ? `\nConditions: ${c.conditions.map((x) => CONDITIONS[x].label).join(', ')}.` : ''}
Best skills: ${skills || 'none trained yet'}.
Renown: ${tier}${deeds ? `, known for: ${deeds}` : ''}. ${renownGuide(tier, b.sex, settings)}
${gear}
${carrying}${body}${magic}
${c.status === 'downed' ? 'STATUS: DOWNED: unconscious and dying.\n' : c.status === 'dead' ? 'STATUS: DEAD.\n' : ''}
${loreAt(lore, 'after_char')}WHERE AND WHEN
Day ${state.time.day} (${dateLabel(state.time.day).toLowerCase()}), ${timeOfDay}${state.location ? `, at ${state.location}` : ''}.${skyLine(state)} ${SEASON_INFO[seasonOf(state.time.day)].dm}${lifeBlock(state)}${memory?.family?.trim() ? `\n\nFAMILY\n${memory.family.trim()}` : ''}${memoryBlock(memory)}${fallenBlock(state, third)}${companionBlock(state, cast, memory?.companions)}${loreBlock(lore)}${persona?.habit?.trim() ? `\n\nYOUR VOICE IN EVERY REPLY\n${persona.habit.trim()}` : ''}`
}

const SKY: Record<Weather, string> = { clear: '', rain: 'It is raining', storm: 'A storm is raging', fog: 'Thick fog lies over everything', snow: 'Snow is falling' }
const SKY_PASSED: Record<Weather, string> = { clear: '', rain: 'The rain has stopped', storm: 'The storm has blown over', fog: 'The fog has lifted', snow: 'The snow has stopped falling' }

/** The weather, so the story keeps to it (and lets it pass when its time is up). */
function skyLine(state: GameState): string {
  if (state.placeKind === 'underground') return ''
  const outside = state.placeKind === 'indoors' ? ' outside' : ''
  const now = weatherNow(state)
  if (now && SKY[now]) return ` ${SKY[now]}${outside}.`
  const passed = weatherPassed(state)
  return passed ? ` ${SKY_PASSED[passed]}.` : ''
}

/** Earlier characters of this story who died (the Hall of the Fallen). */
function fallenBlock(state: GameState, third: boolean): string {
  const fallen = state.fallen ?? []
  if (!fallen.length) return ''
  const me = state.character.build.name
  const lines = fallen.map((f) => {
    const kin = f.heirIsChild && f.heir === me ? ` ${third ? `${me}'s` : "The player character's"} ${f.sex === 'female' ? 'mother' : 'father'}.` : ''
    return `- ${f.name}, ${RACES[f.race].label.toLowerCase()} ${BACKGROUNDS[f.background].label.toLowerCase()}, died on day ${f.day}: ${f.cause}.${f.deeds.length ? ` Known for: ${f.deeds.slice(-2).join('; ')}.` : ''}${kin}`
  })
  return `\n\nTHE FALLEN (earlier adventurers of this story, now dead; the world remembers them, and they may come up: a grave, a rumour, a debt, a belonging found)\n${lines.join('\n')}`
}

function renownGuide(tier: string, sex: 'male' | 'female', settings: CampaignSettings) {
  const known = tier !== 'Nobody' && tier !== 'Local name'
  if (settings.sexModifiers === 'off') return known ? 'People may have heard of them.' : 'Strangers do not know them.'
  if (sex === 'male')
    return known
      ? 'His reputation precedes him; people who have heard of him take him more seriously.'
      : 'Strangers and officials do not know him and give him little respect until he proves himself.'
  return known
    ? 'People have heard of her and doors open readily.'
    : 'People are generally welcoming and willing to hear her out, but she is not taken seriously as a fighter.'
}

/** The engine's results for this turn, written for the narrator. */
export function engineNotes(
  before: GameState,
  after: GameState,
  settings: CampaignSettings,
  checks: CheckResult[],
  deathRoll?: { roll: number; success: boolean },
  /** More for the narrator (a fight blow by blow, a random event), after the checks. */
  extra: string[] = []
): string {
  const lines: string[] = []
  const max = derived(after, settings).maxHp
  if (deathRoll) {
    lines.push(`Death roll while unconscious: ${deathRoll.roll} (${deathRoll.success ? 'still clinging to life' : 'slipping away'}).`)
  }
  for (const ch of checks) {
    const t = TIER_INFO[ch.tier]
    lines.push(
      `${SKILLS[ch.skill].label} check (${ch.reason}; ${DIFFICULTY_LABEL[ch.difficulty]}): rolled ${ch.kept}${ch.bonus ? ` ${ch.bonus >= 0 ? '+' : '−'} ${Math.abs(ch.bonus)}` : ''} = ${ch.total} vs ${ch.dc} → ${t.label.toUpperCase()}. ${t.guide}${ch.kept === 20 ? ' (A natural 20!)' : ch.kept === 1 ? ' (A natural 1.)' : ''}`
    )
    if (ch.damage) lines.push(`The character takes ${ch.damage} damage from this. Health now ${Math.max(0, after.character.hp)}/${max}.`)
  }
  lines.push(...extra)
  const a = after.character
  const b = before.character
  if (a.status === 'dead' && b.status !== 'dead') lines.push('THE CHARACTER IS DEAD. Narrate their death plainly. Do not undo it or offer a miraculous escape.')
  else if (a.status === 'downed' && b.status !== 'downed') lines.push('The character is DOWNED: they collapse, unconscious and dying. Narrate it; do not save them.')
  else if (a.status === 'alive' && b.status === 'downed') lines.push('The character has stabilised: still badly hurt, barely conscious.')
  if (a.conditions.includes('captured') && !b.conditions.includes('captured'))
    lines.push('The character is CAPTURED: overpowered and taken prisoner by their enemies, weapons taken. Narrate waking up as a prisoner.')
  if (a.hp === 1 && b.hp > 1 && a.build.race === 'orc' && a.traitUsedDay !== b.traitUsedDay && !a.conditions.includes('captured'))
    lines.push('The blow should have dropped them, but orcish fury keeps them on their feet (1 health left).')
  if (a.level > b.level) lines.push(`(The character has reached level ${a.level}. Don't mention numbers; at most a hint of growing confidence.)`)
  return lines.join('\n')
}

/** Where the character lives and what they do for a living (life.ts), when they have either. */
function lifeBlock(state: GameState): string {
  const { home, job } = state
  if (!home && !job) return ''
  const lines: string[] = []
  if (home) lines.push(`Home: ${HOMES[home.kind].label.toLowerCase()} in ${home.place}${home.kind === 'room' ? '' : ', their own'} (since day ${home.since}).${atHome(state) ? ' They are at home now.' : ''}`)
  else lines.push('No home of their own: they live at inns and on the road.')
  if (job) lines.push(`Work: ${job.title} in ${job.place} (${SKILLS[job.skill].label} ${jobLevel(state, job)}), paid about ${formatCoins(weeklyPay(state, job))} a week${job.board ? ', with room and board' : ''} (since day ${job.since}).`)
  return `\n\nHOME AND WORK\n${lines.join('\n')}`
}

/** The DM's orders for a time-skip (skips.ts): a montage, not scenes, ending back in the present. */
export function skipNote(before: GameState, after: GameState, plan: SkipPlan, born: string[] = []): string[] {
  const name = after.character.build.name
  const stage = ageStage(after)
  const grew = stage !== ageStage(before) ? `, ${AGES[stage].label.toLowerCase()} now` : ''
  const lines = [
    `TIME SKIP: ${spanSentence(plan.days).replace(/\.$/, '')}, from ${dateLabel(before.time.day).toLowerCase()} to ${dateLabel(after.time.day).toLowerCase()}. ${name} is ${ageYears(after)} years old${grew}.`,
    plan.doing.trim() ? `How they spend the time (the player's words): ${plan.doing.trim()}` : `The player didn't say how ${name} spends the time: choose what fits them and the story so far.`
  ]
  const grown = practiced(before, after, plan.practise).filter((p) => p.to > p.from)
  if (grown.length) lines.push(`Practice over that time: ${grown.map((p) => `${SKILLS[p.skill].label} ${p.from} → ${p.to}`).join(', ')}.`)
  if (plan.working && before.job) {
    const money = after.character.coins - before.character.coins
    lines.push(`They spend it at work, as ${before.job.title} in ${before.job.place}: ${money > 0 ? `they put by ${formatCoins(money)} after the cost of living` : money < 0 ? `the pay didn't cover the cost of living; their savings fell by ${formatCoins(-money)}` : 'the pay just covered the cost of living'}.`)
  }
  if (born.length) lines.push(`Born to them in that time: ${born.join('; ')}. Weave the births into the telling.`)
  else if (plan.family) lines.push('They hoped for children, but none came in that time.')
  if (after.party.length) lines.push(`Travelling with them when it began: ${after.party.map((a) => a.name).join(', ')}. Say whether they stayed through it, and how they fared.`)
  lines.push(
    plan.days >= 7 ? `${name} is rested, fed and healed.` : `${name} has slept and eaten.`,
    plan.days >= 28
      ? "Write it as a montage, not as scenes: a few short paragraphs that move through the time (the seasons turning, how they live and what they do, what became of the people they know: news, a wedding or a death, a newcomer, and how the places around them changed). Keep to what the story has set up: no great wars or deaths of major characters unless the story has led there. Then end in the present, on a morning after the time has passed, with something new for the player to act on."
      : 'Tell these days briefly, in a paragraph or two (the work, a small moment or two, a face they see each day), and end in the present, on the morning after, with something for the player to act on.'
  )
  return lines
}

/** A short reminder of past rolls, so the story keeps track of what happened. */
export function pastRollNote(checks: CheckResult[]) {
  if (!checks.length) return ''
  return `\n\n[Rolls: ${checks.map((c) => `${SKILLS[c.skill].label}: ${TIER_INFO[c.tier].label.toLowerCase()}`).join('; ')}]`
}

/**
 * Trims the story to fit the model's context. Keeps the first message (the opening) and
 * as many recent messages as fit in the character budget.
 */
export function fitHistory(messages: ChatMessage[], budgetChars: number): ChatMessage[] {
  if (!messages.length) return messages
  const out: ChatMessage[] = []
  let used = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const len = messages[i].content.length
    if (used + len > budgetChars && out.length >= 2) break
    out.unshift(messages[i])
    used += len
  }
  // The API wants the conversation to start with the player.
  while (out.length && out[0].role !== 'user') out.shift()
  return out
}

// ---- DM-initiated rolls -----------------------------------------------------------------

const ROLL_TAG = /\[\[\s*ROLL\s*:\s*([^|\]]+?)\s*\|\s*([^|\]]+?)\s*\|\s*([^\]]*?)\s*\]\]/i

export function extractRollRequest(text: string): {
  text: string
  request?: { skill: SkillId; difficulty: (typeof DIFFICULTIES)[number]; reason: string; hidden: boolean }
} {
  const m = ROLL_TAG.exec(text)
  if (!m) return { text }
  const cleaned = text.replace(ROLL_TAG, '').trimEnd()
  const skill = m[1].trim().toLowerCase().replace(/\s+/g, '') as SkillId
  const difficulty = m[2].trim().toLowerCase().replace(/\s+/g, '_') as (typeof DIFFICULTIES)[number]
  if (!SKILL_IDS.includes(skill)) return { text: cleaned }
  return {
    text: cleaned,
    request: {
      skill,
      difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'moderate',
      reason: m[3].trim().slice(0, 120) || 'something is happening',
      // Noticing things shouldn't tell the player what they're noticing.
      hidden: skill === 'perception'
    }
  }
}

// ---- DM-started fights --------------------------------------------------------------------

const FIGHT_TAG = /\[\[\s*FIGHT\s*:\s*([^|\]]+?)\s*(?:\|\s*([^\]]*?)\s*)?\]\]/i
const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, some: 2, several: 3 }

/** Finds a [[FIGHT: 2 bandit, 1 wolf (elite) | ambush]] tag: who attacks, and whether from hiding. */
export function extractFight(text: string): { text: string; fight?: { foes: FoeSpec[]; ambush: boolean } } {
  const m = FIGHT_TAG.exec(text)
  if (!m) return { text }
  const cleaned = text.replace(new RegExp(`[ \t]*${FIGHT_TAG.source}`, 'i'), '').trimEnd()
  const foes: FoeSpec[] = []
  for (const part of m[1].split(/,|\band\b|\+/i)) {
    const tier = /\((minion|standard|elite|boss)\)/i.exec(part)?.[1].toLowerCase() as EnemyTier | undefined
    const range = /\((close|near|far)\)/i.exec(part)?.[1].toLowerCase() as FoeSpec['range']
    const rest = part.replace(/\([^)]*\)/g, '').trim()
    const num = /^(\d+|an?|one|two|three|four|five|six|some|several)\s+(.+)$/i.exec(rest)
    const count = num ? Number(num[1]) || COUNT_WORDS[num[1].toLowerCase()] || 1 : 1
    const kind = (num ? num[2] : rest).trim()
    if (!kind) continue
    foes.push({ kind: kind.slice(0, 60), count: Math.max(1, Math.min(6, count)), tier: tier && ENEMY_TIERS.includes(tier) ? tier : undefined, ...(range ? { range } : {}) })
  }
  if (!foes.length) return { text: cleaned }
  return { text: cleaned, fight: { foes: foes.slice(0, 6), ambush: /ambush|hidden|surprise|unseen/i.test(m[2] ?? '') } }
}

// ---- Banned-name filter -----------------------------------------------------------------

/**
 * Swaps overused names as the text streams. The same banned name always becomes the same
 * replacement within a campaign (seeded by campaign id), so characters keep their names.
 */
export class NameFilter {
  private pending = ''
  private banned: Set<string>

  /** `allowed`: names that must never be swapped (the player's, and imported characters'). */
  constructor(
    private campaignId: string,
    allowed: string[] = []
  ) {
    const keep = new Set(allowed.flatMap((n) => n.split(/[^A-Za-z]+/)).filter(Boolean))
    this.banned = new Set(BANNED_NAMES.filter((n) => !keep.has(n)))
  }

  private replacement(name: string): string {
    let h = 2166136261
    for (const ch of this.campaignId + name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
    let a = h >>> 0
    const rng: Rng = () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    return generateName(rng, 'human', 'female', false).replace(/^./, (c) => c.toUpperCase())
  }

  private swap(s: string) {
    return s.replace(/\b[A-Z][a-z]+\b/g, (w) => (this.banned.has(w) ? this.replacement(w) : w))
  }

  push(chunk: string): string {
    const s = this.pending + chunk
    // Hold back a trailing word that might still be growing.
    const m = /[A-Za-z]+$/.exec(s)
    const cut = m ? m.index : s.length
    this.pending = s.slice(cut)
    return this.swap(s.slice(0, cut))
  }

  flush(): string {
    const s = this.swap(this.pending)
    this.pending = ''
    return s
  }

  /** For whole texts (e.g. the saved copy). */
  apply(text: string) {
    return this.swap(text)
  }
}
