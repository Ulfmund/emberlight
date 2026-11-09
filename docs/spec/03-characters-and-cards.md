# 03 — Characters and Cards

## One kind of character, three layers

Every character (player, companion, NPC, even the DM) uses the same structure. What differs is the **role** it plays in a given campaign.

| Layer | What it is | Lives where | Shared across campaigns? |
|---|---|---|---|
| **Card** | Identity: portrait, name, description, personality, speech style, example dialogue | Character library | Yes |
| **Sheet** | Game stats: race, sex, age, attributes, skills, HP, inventory, XP, conditions | Inside a campaign | No (each campaign has its own copy) |
| **Role** | `player`, `companion`, `npc`, or `dm` | Inside a campaign | No |

So the same card (and portrait) can be a level-1 farmhand in one campaign and a veteran mage in another.

### NPCs created during play

When the Scribe notices a new named character in the story, it creates a lightweight **NPC stub**: name, short description, where they were met, and relationship to the player. A stub gets a full sheet automatically the moment it's needed (e.g. combat starts), generated from its description. Any stub can be "promoted" to a full library card with one click.

### The DM is a card too

The DM persona card controls the narrator's voice and attitude. The default is a fair, vivid, neutral DM. Alternative DM cards can change tone, harshness, or even allow refusal (e.g. "the bratty DM who argues with you"). DM cards don't have sheets.

## Card compatibility

- **Import:** Character Card V2 and V3 (PNG with embedded data, `.json`, and V3 `.charx`). This works with cards from SillyTavern, Chub, etc.
- **Export:** the same formats, so cards made here work elsewhere.
- **Embedded lorebooks** (`character_book`) are imported as a lorebook linked to that card.
- App-specific data (the default sheet template, voice settings) goes into the card's `extensions` field under our own namespace, so other apps ignore it safely.

## Character creator

A step-by-step screen with big illustrated choices. Every step shows how the choice affects stats.

1. **Race** — cards with art, a one-line flavor text, and a mini chart of stat caps.
2. **Sex** — shows its cap modifiers.
3. **Age** — young / adult / middle-aged / elder (affects caps; aging over time is a v2 feature).
4. **Background** — e.g. farmhand, apprentice smith, temple acolyte, street thief, hunter. Sets starting skills and gear.
5. **Attributes** — point-buy. Each attribute is a bar showing its current value and a **cap marker** for this character. Hovering a cap shows why ("Dwarf +2, Male +1").
6. **Skills** — spend starting skill points; caps shown the same way.
7. **Name** — typed, or generated from a culture-specific name generator (see the name ban list in [06-ai-dm.md](06-ai-dm.md#names-and-banned-words)).
8. **Appearance & personality** — short fields with suggestion buttons.
9. **Portrait** — generate, upload, or pick from the library.

**Quick create:** a single **🎲 Roll a New Adventurer** button that fills every step at random in one go. Each field has its own small dice button to reroll just that field, and a 🔒 lock to keep it while rerolling everything else. This is the fast path after a character dies.

## Editing characters (and updating the story)

Name, description and details can be edited at any time from the character panel.

When a **name** changes, the app asks which kind of change it is:
- **Retcon** ("they were always called this"): the name is updated everywhere: entity registry, lorebook, summaries, and past messages (find-and-replace, with a preview of each change before applying).
- **In-story rename** ("they've taken a new name"): the old name is kept as an alias and the change is recorded as a story event the DM knows about.

Other edits (appearance, personality) update the character's entity record, so the DM uses the new details from that point on. An optional "retcon" flag rewrites their description in the summaries too.

## When a character dies

1. A death screen (tasteful, with an animation) shows the cause, the final roll, and a short epitaph written by the DM.
2. The character is saved to the campaign's **Hall of the Fallen** (their sheet, story highlights, and the turn they died).
3. Options: **New adventurer in this world** (quick create; the world, NPCs and history carry on), **Continue as your child** (only if the character had children: pick one; they inherit the family name, a share of their parent's Renown, and whatever the story left them), **Rewind** (go back to before the fatal turn; the player chooses to cheat), or **End campaign**.
4. In the same world, the dead character can become part of the story: a grave, a rumor, a lost item that turns up again.

## Image generation

Optional. Configured once under *Settings → Images*.

| Backend | Notes |
|---|---|
| Stable Diffusion WebUI / Forge (`/sdapi/v1/txt2img`) | Local |
| ComfyUI | Local; uses a workflow file we ship, which can be replaced |
| OpenAI-compatible image APIs | Cloud |

- The prompt is built automatically from the sheet (race, sex, age, appearance) plus a **style preset** the artist can edit (e.g. "painterly fantasy portrait"). It can be edited before generating.
- Used for: player portraits, NPC portraits (optional auto-generate when an NPC is promoted), and later location art and item icons.
- Generated images are saved to the campaign's media folder and attached to the entity.

## Image input (show the AI a picture)

Drag an image into the chat or onto an entity:
- **On a character:** "This is what they look like." The image becomes the portrait, and a text description is saved to the entity so even text-only models know the appearance.
- **In the chat:** "I hand the merchant this amulet." The DM and characters react to it. The image can be saved as an **item** or **location** with its description.
- If the narrator model can see images, the image is sent directly. If not, the **Vision job** (see [02](02-models-and-backends.md)) describes it first and that text is sent instead.
