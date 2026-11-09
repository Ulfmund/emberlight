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

*Built (0.8.0)* (`src/shared/personas.ts`): five built-in voices (the Chronicler, the Grim Bard, the Old Soldier, the Hearthkeeper, the Trickster), or any character card from the library. A card DM speaks as that character and, like the Trickster, may meet ((out-of-character)) requests in character instead of simply following them. A persona changes how the story is told, never what the dice decided.

**Storytellers** *(0.26.0)*, RimWorld-style. Each built-in DM is now a storyteller with three parts:

- **A voice**, as before. The new ones also carry a little of a life of their own (a loss, an obsession, a thing they can't help noticing) for the telling to grow from. It is never explained to the player.
- **A habit**: one line of what to show in every reply, repeated at the very end of the DM's instructions. In a real run the voice alone, told only at the top, was drowned out by the rules after it: four storytellers opened a scene with nearly the same sentence.
- **Leanings**: how often random events come (× the chance) and which kinds (× their weight); see [06](06-ai-dm.md#5-random-events). A character card has a voice but no leanings.

| Storyteller | Who they are | What they bring |
|---|---|---|
| The Chronicler | Fair, vivid, even-handed (the default) | An even mix of everything |
| Whalechan | DeepSeek Whale-chan, the community's unofficial mascot: a whale-fin maid, warm, a little tsundere, always hungry | Fewer fights; more lucky finds and odd chances; long meals, lazy hours, and words taken exactly as said |
| The Veteran | A real-world infantry veteran: how fighting really works, supply, comradeship | More fights, won by ground, numbers and nerve; marches, supplies and comrades matter |
| The Romance Writer | A romance novelist who pairs people off | More people to meet, and sparks between them; fewer fights |
| The Old Soul | An old scholar of myths in the vein of C. S. Lewis: whimsy, honour, a hopeful old-fashioned worldview | Wonders, odd friendly folk, omens that mean something; fewer pointless fights |
| The Mystery Writer | Fair-play mysteries: everyone has a secret | More discoveries and complications; clues in plain sight |
| The Gambler | Trusts only the dice | Many more random events, good and bad |
| The Grim Bard, the Old Soldier, the Hearthkeeper, the Trickster | The original voices | Omens and foul weather; fights and hard weather; quiet roads and friendly strangers; complications with a catch |

The creator's Adventure step shows them as cards to choose from (*Your storyteller*), with a character card from the library as the other choice; in-game they're under Saves (*Storyteller*), with what each brings below the name. Whalechan comes from the community project [deepseek-whalechan](https://github.com/Neko3000/deepseek-whalechan), which welcomes non-commercial fan works; only her description is used, none of the artwork.

## Card compatibility

- **Import:** Character Card V2 and V3 (PNG with embedded data, `.json`, and V3 `.charx`). This works with cards from SillyTavern, Chub, etc.
  - *Built (0.2.0):* V1 JSON too. Cards go into a **character library** (SQLite `cards` table, picture kept as-is). A card is used two ways: **Play as** (fills name, description, personality; guesses race and sex; the picture becomes the portrait) or **Bring along** (a companion the DM voices, at most 3). The card's text is copied into the campaign when it starts (`{{char}}`/`{{user}}` filled in), so deleting a card never breaks a story. A companion's `first_mes` and `alternate_greetings` can open the story as swipes. Card names are exempt from the banned-name filter. `system_prompt` and `post_history_instructions` are ignored (the DM's own rules come first).
- **Export:** the same formats, so cards made here work elsewhere.
- **Embedded lorebooks** (`character_book`) are imported as a lorebook linked to that card.
  - *Built (0.2.0), simple version:* constant entries plus entries whose keys (whole words, or `/regex/`) appear in the last four messages, highest priority first, within about 3,000 characters. The full lorebook engine comes in Milestone 2.
- App-specific data (the default sheet template, voice settings) goes into the card's `extensions` field under our own namespace, so other apps ignore it safely.

## Character creator

A step-by-step screen with big illustrated choices. Every step shows how the choice affects stats.

1. **Race** — cards with art, a one-line flavor text, and a mini chart of stat caps.
2. **Sex** — shows its cap modifiers.
3. **Age** — young / adult / middle-aged / elder (affects caps; the character grows older as the story goes on, see [04](04-rules-system.md#seasons-and-aging)).
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

*Built (0.7.0)* (`src/server/core/rename.ts`): rename your character from the pencil by their name, or anyone in the Journal with **Rename…**. A retcon replaces the name as a whole word, matching capitals exactly ("Rook" leaves the bird alone), and a lone first name too. It covers every message (each one can be unticked in the preview), the Journal (records, summaries, story so far, pinned notes), your character's description, and the adventure's title if it was the default one. An in-story rename keeps the past as it was: for your character it adds a pinned note telling the DM, and for a Journal record it keeps the old name as another name and adds a fact. Lorebooks aren't rewritten (they're shared between adventures).

Other edits (appearance, personality) update the character's entity record, so the DM uses the new details from that point on. An optional "retcon" flag rewrites their description in the summaries too.

## When a character dies

1. A death screen (tasteful, with an animation) shows the cause, the final roll, and a short epitaph written by the DM.
2. The character is saved to the campaign's **Hall of the Fallen** (their sheet, story highlights, and the turn they died).
3. Options: **New adventurer in this world** (quick create; the world, NPCs and history carry on), **Continue as your child** (only if the character had children: pick one; they inherit the family name, a share of their parent's Renown, and whatever the story left them), **Rewind** (go back to before the fatal turn; the player chooses to cheat), or **End campaign**.
4. In the same world, the dead character can become part of the story: a grave, a rumor, a lost item that turns up again.

*Built (0.10.0)*: when a character dies, the DM writes an **epitaph** (a separate small AI job), shown on the death screen. The choices:

- **A new adventurer in this world** opens the creator without the world step. They arrive a few days later with what their calling gives them. People and places stay in the Journal, but their ties and feelings toward the dead don't carry over.
- **Continue as *name*, their child**, for each living person the Journal has as the character's child. Ten years later, the child (human or not, as their parent; young; the family name filled in) inherits their parent's savings, half their Renown, and their weapon ("Brenna's shortbow"). The family is re-labelled: the dead one's other children become siblings, their spouse a parent, their parents grandparents.
- **Rewind before the fatal moment**, unless Ironman.
- **Back to the menu.**

The dead character joins the **Hall of the Fallen** (a Journal section once anyone has died): who they were, how and when they died, their deeds, the epitaph, and who took up the tale. They are also added to the Journal as a dead person, so the DM remembers them, and the narrator's prompt lists the fallen as people the world may bring up again. The successor's story starts from its own hidden opening message after the death, so rewinding to the death still shows the death, and the old branch is kept.

## Image generation

Optional. Configured once under *Settings → Images*.

| Backend | Notes |
|---|---|
| Stable Diffusion WebUI / Forge (`/sdapi/v1/txt2img`) | Local |
| ComfyUI | Local; uses a workflow file we ship, which can be replaced |
| OpenAI-compatible image APIs | Cloud |

- The prompt is built automatically from the sheet (race, sex, age, appearance) plus a **style preset** the artist can edit (e.g. "painterly fantasy portrait"). It can be edited before generating.
- Used for: player portraits, NPC portraits (painted unasked when someone comes to matter, if turned on: 0.22.0), pictures of places, emblems for factions (0.19.0) and pictures of notable things (0.22.0).
- Generated images are saved to the campaign's media folder and attached to the entity.

*Built (0.14.0)* (`src/server/images/generate.ts`, `src/shared/images.ts`): an **Images** section on the Connect screen (on the computer only, like API keys): the generator, its address, a model (a checkpoint for SD or ComfyUI, e.g. `gpt-image-1` for an images API), an API key for images APIs (encrypted with the other keys), the **art style** added to every portrait, what to leave out, size and steps, and for ComfyUI an optional workflow of your own in API format with `{{prompt}}`, `{{negative}}`, `{{seed}}`, `{{width}}`, `{{height}}`, `{{steps}}` and `{{model}}` placeholders (otherwise a basic checkpoint text-to-image graph). **Test** paints a sample. Portraits are made from the **picture dialog**: tap your character's portrait (character panel) or a person's circle in the Journal; the prompt (style + what the sheet or the Journal says about them) can be edited first. Pictures live in the save file (a `media` table) and travel with an exported adventure.

*Built (0.19.0):* **places and factions** take pictures too, from their circle in the Journal. A place is painted wide (half as wide again as tall; 1536×1024 from an images API) from a scenery prompt ("landscape painting of …, wide view, no figures"), and shows as a banner on its Journal card, on the map, and under the character panel while you're there. A faction gets an emblem ("heraldic emblem of …, a banner or crest").

*Built (0.22.0):* **notable things** (the Journal's Things) take pictures as a still life ("still life painting of …, on a plain cloth"), shown in a square frame. **Unasked portraits** (*Images → Paint people who matter*, off unless turned on): after a turn, someone who has come to matter (recorded four times or more, tied to the character, or travelling with them) and has no picture yet, and no card picture, is painted in the background with the usual portrait prompt. One at a time per story, each person tried once per run of the app; a failure is logged, never shown as an error. The picture appears with the next update of the screen.

## Image input (show the AI a picture)

Drag an image into the chat or onto an entity:
- **On a character:** "This is what they look like." The image becomes the portrait, and a text description is saved to the entity so even text-only models know the appearance.
- **In the chat:** "I hand the merchant this amulet." The DM and characters react to it. The image can be saved as an **item** or **location** with its description.
- If the narrator model can see images, the image is sent directly. If not, the **Vision job** (see [02](02-models-and-backends.md)) describes it first and that text is sent instead.

*Built (0.14.0)*: always through the **Vision job** (`src/server/ai/jobs/vision.ts`), using the connected model when it can see pictures (Claude; local vision models through LM Studio, Ollama and other OpenAI-compatible servers). **Your portrait:** upload one in the picture dialog and the DM describes how your character looks, with **Use as my appearance** to make that the character's description (a `build_edit` event). People in the Journal can be given pictures the same way, and those pictures appear in their speech bubbles. **In the story:** the picture button beside the message box attaches one to your next message; it shows in your message, and the DM gets it in words ("(The player shows a picture: …)"), as does the Referee. A model that can't see pictures just gets your words, with a note saying so.
