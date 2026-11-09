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

Event tables live in `core/events/tables/`, sorted by **location type** (road, forest, town, dungeon, mountain, coast…), **time of day**, and **danger level**.

- **Triggers:** a chance each turn based on time passing, travel, **resting in the wild**, or noise (critical failures, combat).
- **Kinds:** encounter, weather change, wandering NPC, discovery, omen, complication, opportunity.
- The chosen event is passed to the narrator as a directive ("introduce: a wounded courier stumbles onto the road"). An ambush event first sets up a hidden Perception check, so being alert matters.
- **Event frequency** is a DM setting: Calm / Normal / Eventful / Chaos.

### 6. Narrate

The narrator gets the assembled context (see [07](07-memory-and-lore.md#prompt-assembly)) plus a **"This turn"** block:

```
Player action: leaps the gap. Says: "Stay back."
Resolved: Athletics check — NARROW SUCCESS (d20 15 + 3 − 2 = 16 vs DC 16).
Effects: −3 stamina.
Introduce: a wolf pack's howl from the treeline (random event).
```

**Dialogue format.** Narrators are asked to write character speech as its own line, `@Name: "…"`. That lets the UI show a portrait and bubble for each speaker, while narration stays as normal paragraphs. If a model doesn't follow the format, a fallback attributes quotes to the nearest named speaker, and the Scribe corrects it.

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
- **Ghost text** (optional): while typing, a pause shows a greyed-out continuation. **Tab** (desktop) or a tap (mobile) accepts it. It's on by default only if the model is fast enough (from the capability profile).

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
| Content limits | Free-text list of things to avoid or fade to black |

*Built (0.8.0):* all of these except event frequency (it arrives with random events), in the creator's Adventure step and in-game under Saves. Roll frequency is told to the Referee; the rest to the narrator.

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
