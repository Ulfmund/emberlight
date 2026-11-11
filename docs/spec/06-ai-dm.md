# 06 — The AI DM

## Rule of thumb

**The engine decides outcomes before the narrator writes, wherever possible.** The narrator turns decided facts into a story. The Scribe then records anything new the narrator invented (a name, a place, a rumor), within limits the engine sets.

## The turn loop

```
Player input
  │
  ├─ 1. Parse        speech vs. action, commands, OOC          (code)
  ├─ 2. Referee      does this need a roll? which skill? DC?   (AI → JSON)
  ├─ 3. Roll         auto-roll or player throws the dice        (UI + engine)
  ├─ 4. Resolve      result tiers, damage, loot, XP → events    (engine)
  ├─ 5. Events       random event check                         (engine)
  ├─ 6. Narrate      the story response, streamed               (AI → prose)
  ├─ 7. Scribe       new facts, relationships, time, rest       (AI → JSON → engine)
  └─ 8. Suggest      3 options for what to do next (optional)   (AI → JSON)
```

Each step is a separate function in `core/turn/`, so steps can be added, reordered or skipped (e.g. a pure dialogue turn with no roll skips 3–4).

### 1. Parsing player input

One message can contain both an action and speech:

> `"Stay back," I warn, drawing my sword and stepping between her and the wolf.`

- Text **in quotation marks** = what the character **says** (shown in a speech bubble with their portrait).
- Everything else = what the character **does** (shown as action narration).
- `((double parentheses))` or the **OOC** toggle = an out-of-character instruction to the DM (see below).
- A message starting with `/` = a command.

### 2. Referee (does this need a roll?)

The Referee gets the player's action, the scene, and a short sheet summary, and returns:

```json
{
  "intent": "combat | social | explore | travel | rest | gather | craft | other",
  "checks": [
    { "skill": "Athletics", "difficulty": "hard", "modifier": -2,
      "advantage": "none", "reason": "leaping the gap in the rain",
      "dramatic": true, "opposedBy": null }
  ],
  "timeCost": "moments | minutes | hours",
  "startsCombat": false
}
```

The engine checks every field (real skill, legal DC tier, modifier within −4 to +4). Talking, simple movement and anything trivial gets **no check**, so the game doesn't turn into a roll-fest.

### 3. Rolling (dice on screen)

The **Roll setting** (in the dice tray and in settings):
- **Auto:** the engine rolls everything instantly (the dice animation still plays, quickly).
- **Dramatic only** (default): routine rolls are automatic, and rolls marked `dramatic` wait for the player to **throw the dice** (click and flick on desktop, swipe or **shake the phone** on mobile).
- **Always ask:** the player throws every roll.

The roll result shows its breakdown (`d20 14 + Athletics 3 − rain 2 = 15 vs DC 16`) and its **tier** (see [04](04-rules-system.md#degrees-of-success)). A **free reroll** button sits next to it unless Ironman mode is on.

### DM-initiated rolls ("Roll a perception check")

The narrator can end a response by asking for a roll, e.g. when something is lurking, an NPC is lying, or a trap is armed. It does this with a structured request:

```json
{ "requestCheck": { "skill": "Perception", "difficulty": "hard", "hidden": true,
                    "reason": "something is following you" } }
```

The UI shows a big glowing **🎲 Roll Perception** button. After the roll, the narrator writes a short continuation based on the result. `hidden: true` means the DC and the reason are kept secret (only the roll is shown), so the player doesn't learn what they failed to notice.

The player can also roll any skill at any time by clicking it on their sheet ("I search the room" + click Perception).

### 4. Resolve

The engine applies results as events: damage, HP and stamina costs, loot (rolled from loot tables **before** narration, so the narrator says "you find 12 copper and a bone charm" rather than inventing a fortune), XP, conditions, crafting outputs, and enemy actions (turn-based mode).

### 5. Random events

*Built in 0.9.0* (`src/shared/rules/encounters.ts`). About 33 events, sorted by **where** (town or village, road, the wild, water, ruins and the deep, or anywhere) and **time of day**, with weights.

- **Chance each turn:** by **event frequency** (a campaign setting: Calm 3%, Normal 7%, Eventful 14%, Chaos 25%), then ×2.5 when travelling, ×1.3 when exploring, ×3 when **resting in the wild** (×0.3 resting in town), ×0.7 in a settlement, ×1.3 at night in the wild, and +10% after a critical failure. At most 60%. Never in a fight, and never within three turns of the last event or fight.
- **Kinds:** encounter, weather, wanderer, discovery, omen, complication, opportunity. Only events marked as able to happen while asleep come up on a rest.
- **The storyteller's leanings** (since 0.26.0) multiply the chance (the Gambler ×1.5, the Hearthkeeper ×0.8, Whalechan ×0.85) and each kind's weight (the Romance Writer brings wanderers ×2 and encounters ×0.6; the Veteran encounters ×1.5; the Mystery Writer discoveries ×1.8). See [03](03-characters-and-cards.md#the-dm-is-a-card-too).
- **Seasons** (since 0.24.0): snow only in winter, and rain and storms the rest of the year.
- The chosen event is passed to the narrator as a directive ("RANDOM EVENT: work it into the scene now"). Some ask the narrator for a DM-initiated roll (a pickpocket, a collapsing floor).
- **Encounters** bring foes. When the campaign's combat mode would track them, the fight is set up straight away; an ambush first rolls a hidden Perception check, so being alert matters. Otherwise the narrator is told to tell any fight in prose.
- A reroll keeps the turn's event: it rolls the dice again, not the world.

### 6. Narrate

The narrator gets the assembled context (see [07](07-memory-and-lore.md#prompt-assembly)) plus a **"This turn"** block:

```
Player action: leaps the gap. Says: "Stay back."
Resolved: Athletics check — NARROW SUCCESS (d20 15 + 3 − 2 = 16 vs DC 16).
Effects: −3 stamina.
Introduce: a wolf pack's howl from the treeline (random event).
```

**Dialogue format.** Narrators are asked to write character speech as its own line, `@Name: "…"`. That lets the UI show a portrait and bubble for each speaker, while narration stays as normal paragraphs. If a model doesn't follow the format, a fallback attributes quotes to the nearest named speaker, and the Scribe corrects it.

### Speech lines

*Built (1.0.4)* (`src/shared/speech.ts`). Models (DeepSeek among them; the same happens on Perchance) sometimes put the tag in the wrong place: inside a sentence or a quotation (`He shakes his head. "@Branmund: "And don't…`), in bold, or with the player character's name, often for the person being spoken to. The DM is told the tag names whoever speaks, never whoever they speak to and never the player character, and only ever starts a line. What still slips through is put right when the reply is saved, when older replies are sent back to the DM, and on screen (so replies from before 1.0.4 read right too):

- A tag at the start of a line stays a speech bubble, tidied of bold or a stray quote mark.
- A tag after a finished sentence, with quoted words after it, starts a new line: the DM forgot one.
- Any other tag where a sentence starts is taken out, so the words read as plain story.
- A tag with the player character's name never makes a bubble (the DM never speaks for them).
- In the middle of a sentence ("turns to @Old Tam"), it's a mention: it loses only the @.

### 7. Scribe

After the narration, the Scribe extracts structured updates:
- New or changed **entities** (characters, places, factions, items), with descriptions.
- **Relationship** changes (limited size per scene).
- **Time passed**, **location changes**, **rest/sleep** (the engine applies rest rules automatically: "you slept, so HP and stamina recover").
- **Quest** updates, **important events** for the timeline.
- **Scene tags** for audio (forest, night, rain, combat, tavern…).
- Items or coin the narrator handed out beyond what the engine resolved. These are accepted only within the loot limits for the character's level; anything over is flagged in the change log for the player to accept or reject.

Every update is an event with `source: "ai"`, shown in the change log with undo.

### 8. Suggestions

- **💡 Suggest** button: three options in different flavors (e.g. *bold action*, *careful action*, *something to say*). Clicking one puts it in the input box to edit or send.
- **Autocomplete** (ghost text; optional): while typing, a pause shows a greyed-out continuation. **Tab** (desktop) or a tap (mobile) accepts it. It's on by default only if the model is fast enough (from the capability profile).

*Built (0.11.0)* (`src/server/ai/jobs/suggest.ts`): the **Ideas** button (a lightbulb beside Act) asks for one bold action, one careful one and one thing to say, written in the player's voice from the last few messages, the character's gear and any fight. Picking one puts it in the box to edit. **Ghost text** is off by default, because every pause is a small request to the model: a switch under the box turns it on for that device. After 0.9 seconds without typing (at least four characters, cursor at the end), the model continues the sentence (at most twelve words); echoes of what's typed are trimmed. Tab or a tap on "add the grey words" accepts it; Escape or more typing clears it.

---

## Out-of-character instructions and commands

### OOC directives

`((make it start raining))`, `((skip ahead to the city))`, `((introduce a rival adventurer))`. The DM treats these as instructions from the player, not as in-world speech. **By default the DM follows them.** A DM card can override this (e.g. a contrary DM persona who argues back).

### Commands

| Command | Does | Button |
|---|---|---|
| `/roll 2d6+3` | Roll any dice | 🎲 |
| `/check stealth` | Roll a skill check | (click skill on sheet) |
| `/rest short` · `/rest long` | Rest | 🏕️ |
| `/recap` | DM summarizes the story so far | 📜 |
| `/suggest` | Get suggestions | 💡 |
| `/ooc …` | Out-of-character instruction | 💬 OOC toggle |
| `/set hp 12` | Manually set a value | (pencil on sheet) |
| `/give rope` | Add an item | (+ in inventory) |
| `/undo` · `/reroll` | Undo last turn / reroll last roll | ↩️ · 🔄 |
| `/note …` | Pin a fact to memory | 📌 |
| `/image` | Generate a picture of the current scene | 🖼️ |

Commands are registered in one place (`core/turn/commands.ts`). Adding one is a single entry.

---

## DM style settings

Under *Campaign → DM Style*, as simple choices with icons:

| Setting | Options (default **bold**) |
|---|---|
| Tone | Grim · **Grounded** · Heroic · Whimsical · Horror |
| Response length | Short · **Medium** · Long |
| Mercy | Brutal · **Harsh** · Forgiving (see [04](04-rules-system.md#death)) |
| Fail forward | **Off** · On |
| Acting for the player | **Never** (DM describes the world and the results of rolls, never the player character's choices, speech or feelings) · Light (minor reactions allowed) |
| Pacing | **Sandbox** · Guided story |
| Event frequency | Calm · **Normal** · Eventful · Chaos |
| Roll frequency | Fewer · **Normal** · More |
| Perspective | **Second person** ("you") · Third person |
| Storyteller | **The Chronicler** · ten other built-in storytellers · any character card (see [03](03-characters-and-cards.md#the-dm-is-a-card-too)) |
| Content limits | Free-text list of things to avoid or fade to black |
| Cultures | **On** · Off (see [below](#the-peoples-ways)) |

*Built (0.8.0):* all of these except event frequency (it arrives with random events), in the creator's Adventure step and in-game under Saves. Roll frequency is told to the Referee; the rest to the narrator.

## The peoples' ways

*Built (0.25.0).* Unless the world's own lore says otherwise, the DM is told how the peoples live, in a block of its own ("THE PEOPLES OF THIS WORLD"), and plays it straight:

- **Humans** are the most numerous people, and their customs differ by nation and place. They keep strict roles for men and women and look askance at anyone who breaks them. The big cities are a little looser; the countryside and small towns hold to the old ways. Magic is the exception: more and more human mages are women. Human women mostly prefer work that is neither fighting nor heavy labour.
- **Dwarves** keep strict roles too, and guard their women closely: a dwarf woman is rarely seen outside the hold. Inside, the women work as hard as the men, as record-keepers, cooks, mystics, weavers and leatherworkers. The work is divided rather than shared.
- **Elves** are haughty, condescending and (mostly rightly) sure they are better than everyone else. There are few of them, and they never waste elven lives. To them, insulting the other peoples is a necessity. They send their women to fight the other peoples, knowing that losing to a woman is a double humiliation for a human or a dwarf. The DM plays all this straight: the player may find it funny, but the elves never do.

These ways apply to the player character too: a dwarf woman on the road is a rare and remarked-on sight. The customs about men and women follow the [sex setting](04-rules-system.md#attribute-caps): with it **Off** they're left out, and the rest stays. Halflings and orcs have no notes yet, so the DM makes up its own. A campaign can switch the whole block off (*Cultures*, in the creator's Adventure step and in-game under Saves). Code: `src/shared/cultures.ts`.

## No favoritism

The artist's top complaint is that the AI goes easy on the player. Several layers deal with it:

1. **The engine owns the numbers.** Enemy stats come from templates, damage is rolled, and death is a state the narrator must respect ("if the engine says the character is downed, they are downed").
2. **The narrator is told the outcome** and is instructed to write it faithfully, with no last-second rescues and no softening of failures.
3. **NPCs act in their own interest.** The prompt says so explicitly, and disposition values back it up mechanically.
4. **Fairness check** (debug panel): flags responses where the narrator contradicts the engine (e.g. describes a hit missing), so prompts can be tuned.
5. The player can still choose mercy for themselves with a reroll or an edit. That's their call, not the AI's.

## Names and banned words

Models overuse the same names (Kael, Elara, Lyra, Seraphina, Thorne…) and phrases ("a shiver ran down her spine"). This is handled by the engine, so it works on every model:

1. **Names are supplied, not invented.** Each narrator prompt includes a short list of fresh names from the engine's culture-specific name generators (`core/rules/tables/names/`), so the model has good names to use.
2. **Stream filter.** While the response streams, every completed word is checked against the ban list. A banned name is swapped for a generated one, and the swap is remembered so the character keeps the same new name for the whole campaign.
3. **Logit bias** is added where the server supports it (llama.cpp-based servers), as an extra layer.
4. **Phrase list:** each banned phrase is either **Reduce** (the prompt says to avoid it; it's tracked in stats) or **Ban** (triggers a rewrite of that sentence or a regenerate).
5. Both lists are editable in settings, with a starter preset.

## Content

*Built (1.3.0)*. A campaign setting, **Mild**, **Mature** (the default) or **Explicit**, told to the DM as one line. Left unsaid, models write everyone PG however grim the tone (a seedy tavern's barmaid came out sanitised on DeepSeek), so Mature says plainly that the story is for adults: bodies, appetites, crude talk, cruelty and violence shown frankly, characters as they'd really be, sex off the page. Explicit lets sex be described when the player leads there, and never anything sexual involving anyone under 18 or who seems to be a child. Mild keeps it for any audience. The player's own **limits** still apply on top.

## Genre

*Built (1.4.0)* (`src/shared/genre.ts`). A campaign setting, **Auto** (the default), **Fantasy** or **Sci-Fi**. On Auto the story's lorebooks and its characters' books are read for far-future words (voidships, hive cities, las-weapons, xenos, augmetics, planets…) against fantasy ones; enough of the first makes it sci-fi. The answer is remembered until a book changes.

In a sci-fi story:
- **The DM** is told the game is "a science-fiction roleplaying game, set in a grim far future", and gets a block on the setting: decaying star-spanning empires, hive cities, voidships, faith and machine-rite, zealots, heretics and aliens, told with gothic weight and scale; names, places and technology come from the lore.
- **The rules stay the same**, so their fantasy words are translated: the character's gear and money are rewritten before the DM sees them (a Shortbow is a rifle, Arrows rifle rounds, Leather armour flak armour, a Healing potion a medi-stimm, coins one count of scrip), and the DM is told the rest (a spell as a psychic power or a device's function, a calling as a trade or posting). The peoples' fantasy customs are left out; the other peoples become the setting's nearest kin.
- **Names** for new people are gothic far-future ones. **Ideas**, **Autocomplete** and **pictures** ("grimdark science fiction") follow the genre.
- **The look:** the story screen (and the creator, once the genre is chosen or detected) wears gunmetal and brass, hazard red, a phosphor glow and faint scanlines; the thinking runes become machine glyphs.
- Sci-fi items and foes the engine knows: 1.5.0, see [04](04-rules-system.md#sci-fi-gear-and-foes). A ruleset of its own is still to come.
