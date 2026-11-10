# 10 — Roadmap

Built in milestones. Each one ends with something playable, so the artist can test early and steer.

## Milestone 0 — Skeleton ✅ (done 2026-11-08)
- Electron + React app opens, with the theme in place (Blender-rendered logo and title art, ember effects)
- Connect to OpenAI-compatible, Ollama (native, sets context size) and Anthropic providers (presets, model list, Test button, auto-probe for Strata, context-size check and warning)
- Plain streaming chat with the narrator (hidden `<think>` reasoning, `@Name:` dialogue bubbles, word fade-in, stop, reroll)
- `.env` for dev keys, encrypted key storage in the app
- Local server only accepts requests from the app's own pages

## Milestone 1 — Playable core (the MVP) ✅ (2026-11-09)
*The smallest version that's fun:*
- Description → action turn structure; free input with **"quoted speech" + action in the same turn**
- Referee → dice → resolve → narrate loop, with **result tiers** (nat 20 vs. 15 vs. 10 read differently)
- Dice on screen: auto / dramatic only / always ask; free rerolls
- **Character creator** with race, sex, age and background caps across all attributes and skills; point-buy; quick random roll
- **Sheet** panel with cap markers and tooltips
- **Skills grow only by use (OSRS-style); level-ups give +1 attribute point and Renown** (see [04](04-rules-system.md#renown))
- HP / stamina / mana, basic damage and death (Harsh mercy)
- Dialogue bubbles with portraits, separate from narration
- Event log tied to messages: swipes, regenerate, edit, rewind all keep state correct
- Autosave, multiple campaigns, save slots
- Character Card V1/V2/V3 import (PNG, `.json`, `.charx`) into a character library: play as a card, or bring up to 3 along as DM-played companions; card greetings can open the story; embedded lorebooks trigger by keyword ✅ (0.2.0)

## Milestone 2 — Memory ✅ (0.7.0)
- Scribe job; entity registry; relationships and dispositions *(people and places with facts, status and attitude ✅ 0.3.0; factions ✅ 0.18.0; quests, notable items and ties between characters ✅ 0.21.0)*
- In-game clock; timeline; layered summaries *(clock and scene / chapter / story-so-far summaries ✅ 0.3.0; the Journal's timeline ✅ 0.21.0)*
- Budget-aware prompt assembly (lean / standard / rich) + context inspector ✅ 0.7.0
- Journal tab (People, Places, Timeline), all editable *(People, Places, Story and Pinned notes ✅ 0.4.0)*
- Lorebooks (core features + SillyTavern import) ✅ 0.6.1
- **Example world template:** a small region with a filled-in lorebook, NPC stubs and an opening scene, to copy or learn from ✅ 0.6.1 (*The Cinder Marches*: 18 entries; its people live in the lorebook and join the Journal when met)
- Name generators, banned-name stream filter, phrase list
- Rename / retcon flow ✅ 0.7.0

## Milestone 3 — Game depth ✅ (0.10.0)
- Combat modes (narrative / turn-based / mixed), ambush and initiative, enemy templates ✅ 0.9.0 (24 templates, the tracker, one-tap moves, DM-started fights)
- Inventory, equipment slots, encumbrance, money ✅ 0.8.0
- Gathering and crafting skills with recipes and nodes ✅ 0.10.0 (16 gathering spots, 28 recipes, the Bag's Make list)
- Conditions, survival needs, rest rules (auto-detected sleep) ✅ 0.8.0
- Random event tables and DM-initiated rolls (hidden checks) ✅ 0.9.0
- Death flow, Hall of the Fallen, quick new adventurer in the same world ✅ 0.10.0 (epitaphs; continue as your child)
- DM style settings, DM persona cards ✅ 0.8.0 (event frequency ✅ 0.9.0)

## Milestone 4 — Polish and reach ✅ (0.15.0)
- Full "juice" pass (including the typing runes), effects settings ✅ 0.12.0
- Suggestions + ghost text ✅ 0.11.0
- Play on Phone (QR pairing, PWA, mobile layout, shake to roll) *(QR pairing on Wi-Fi, tunnel link and mobile layout ✅ 0.5.0; home-screen app and shake to roll ✅ 0.12.0)*
- Image generation (SD WebUI/Forge, ComfyUI, OpenAI-compatible) ✅ 0.14.0 (portraits for you and the people of the story)
- Image input (vision, or a captioning fallback) ✅ 0.14.0
- Card, lorebook and campaign export; automatic backups ✅ 0.11.0 (backups since 0.1, lorebook export since 0.6.1)
- Full lorebook feature set (recursion, groups, sticky/cooldown, etc.) ✅ 0.15.0 (positions, sticky/cooldown/delay, character filters, book budgets, global books; semantic matching ✅ 0.20.0 with memory by meaning)
- Spells ✅ 0.13.0 (17 spells; learned from callings, teachers and tomes)
- UI sound effects ✅ 0.12.0

## v1.x ✅ (0.20.0; the leftovers in 0.21.0–0.23.0: quests, things and ties, the timeline, item pictures and automatic portraits, boss music and stingers)
- Ambient audio and dynamic music ([09](09-audio.md)) ✅ 0.16.0 (made on the spot, or from your own tagged tracks)
- Semantic (embedding) memory search ✅ 0.20.0 (memory by meaning: people, places, older chapters and lore recalled by what's happening, with a local embedding model)
- Faction reputation ✅ 0.18.0 (standing from hated to honoured, moved by your deeds; it counts on social checks with their people)
- Location art; a simple map of visited places ✅ 0.19.0 (wide pictures of places, emblems for factions, and the Journal's map of the way so far)
- Companions travelling with the player (AI-controlled in combat) ✅ 0.17.0 (up to four, from cards or the story; five fighting roles; healers can save you)

## 1.0 — The life sim, storytellers and peoples ✅ (1.0.0, 2026-11-09)
*Decided 2026-11-09: the life sim comes into 1.0 instead of a later v2, along with storyteller personalities and the peoples' cultures.*
- **Aging** ✅ 0.24.0: characters grow older with the calendar (some peoples much slower), and the stage of life they reach sets their caps (physical caps fall after middle age, Intellect and Arcane caps rise) ([04](04-rules-system.md#seasons-and-aging))
- **Seasons** with effects on gathering, weather and sound ✅ 0.24.0 (the DM plays winter roads as slow and a night in the open as dangerous)
- **The peoples' ways** ✅ 0.25.0: how humans, dwarves and elves live, their customs for men's and women's work, and what they think of each other ([06](06-ai-dm.md#the-peoples-ways))
- **Storytellers**, RimWorld-style ✅ 0.26.0: Whalechan, the Veteran, the Romance Writer, the Old Soul, the Mystery Writer and the Gambler join the original five; each has a voice, a habit, and leanings that shape which random events come ([03](03-characters-and-cards.md#the-dm-is-a-card-too))
- **Long time-skips** ("five years pass…") ✅ 0.27.0: from the Sheet or out of character; the engine ages, mends and trains the character, and the DM tells the years as a montage ([04](04-rules-system.md#time-skips))
- **Homes and work** ✅ 0.28.0: rent or buy a home (a night there mends fully), take up work that pays by its skill, and spend days, weeks or years at it ([04](04-rules-system.md#homes-and-work))
- **Family** ✅ 0.29.0: marry someone from the story, children born (by choice, or over years raising a family) who grow up with the calendar, and a grown child takes up the tale ([04](04-rules-system.md#family)) *(playing the next generation after a death ✅ 0.10.0)*

## 1.1 — People made like characters ✅ (1.1.0 and 1.1.1, 2026-11-10)
*Asked for 2026-11-09 by the main player: "generate NPC cards from the same criteria that the character creation process uses, and just have age be a slider."*
- **People's cards by the creator's criteria** ✅: race, sex, age, calling, appearance and personality for everyone in the Journal, written by the Scribe for someone new and kept steady after; shown on their card, told to the DM, used for their portrait, and editable with the creator's controls ([03](03-characters-and-cards.md#npcs-created-during-play))
- **Age as a slider** ✅: in years, in the creator and on people's cards, at each people's pace; the stage of life follows from it ([03](03-characters-and-cards.md#character-creator))
- **Speech tags put right** ✅ 1.0.4: an "@Name:" in the middle of a sentence, or for the player character, no longer shows in the story ([06](06-ai-dm.md#speech-lines))

## 1.2 — Lorebooks from Chub ✅ (1.2.0, 2026-11-10)
- **Find on Chub** ✅: search the lorebooks shared on chub.ai from the lorebook library (fantasy only and NSFW off to begin with, adult books screened out a second time, instructions and game systems labelled), and add one to the library with credit to its author ([07](07-memory-and-lore.md#finding-lorebooks-on-chub))

## 1.4 — Grimdark sci-fi ✅ (1.4.0, 2026-11-10)
- **Genre** ✅: Auto / Fantasy / Sci-Fi, detected from the lore; a far-future DM, the rules' words translated, gothic names, and a grimdark look ([06](06-ai-dm.md#genre))

## 1.3 — Range, Quick Hero, Content ✅ (1.3.0, 2026-11-10)
- **Range in fights** ✅: close / near / far, Close In with free swings, lean battle-log narration ([04](04-rules-system.md#range))
- **Quick Hero** ✅: a one-page creator in your own words, with AI-suggested stats fitted to the rules ([03](03-characters-and-cards.md#quick-hero))
- **Content setting** ✅: Mild, Mature (default) or Explicit, so the world isn't sanitised ([06](06-ai-dm.md#content))

## 1.2.2 — What's New ✅ (2026-11-10)
- **What's New** ✅: after an update, what changed since you last played, on each screen ([08](08-ui-ux.md#whats-new))

## 1.2.1 — Continue, and a death you can read ✅ (2026-11-10)
- **Continue** ✅: the send button with nothing typed lets the story go on without the character doing anything ([08](08-ui-ux.md#in-game-layout-desktop))
- **The death screen as a panel under the story** ✅, so the death itself can be read ([03](03-characters-and-cards.md#when-a-character-dies))

## After 1.0
*Added 2026-11-09.*
- **Multiplayer** (big): several players in one story, each with their own character, taking turns or acting together, on their own devices. Turn order, who the DM is answering, and how dice and memory work with more than one player all need designing first.
- **More built-in worlds and lorebooks** (small): a few more ready-made worlds next to *The Cinder Marches*, picked from community lorebooks (Chub). Only ones whose authors allow it (an open licence, or asking), with credit. *(1.2.0 did the other half: **Find on Chub** lets players search Chub's lorebooks and add them to their own library, with credit, so nothing is shipped with the app. See [07](07-memory-and-lore.md#finding-lorebooks-on-chub).)*
- **Sci-fi gear and foes** (medium, *added 2026-11-10*): weapons, armour and kit the engine knows in far-future terms (pistols and rifles with ammunition and reloads, blades, flak and carapace, medkits and stimms), and foes to match (gangers, cultists, mutants, servitors, alien beasts), on the current combat engine with its ranges. The step between today's translated fantasy gear and a whole ruleset.
- **A grimdark sci-fi ruleset** (big): a second rules system in the spirit of the Warhammer 40,000 tabletop RPGs (percentile characteristics, careers, wounds, corruption and insanity), for a grimdark sci-fi campaign. It would use its own names and setting, not Games Workshop's.
- **A flagship default world** (medium): *added 2026-11-10.* A ready-made world that uses every mechanic: its peoples and their ways, factions with standing, places for the map, people with full cards, quests to take up, homes and work, the seasons, and room to raise a family. It would be built from the player's and their friend's own decades of worldbuilding, so there's no licence to ask for, and sit beside *The Cinder Marches* as the default. A world today is only a lorebook, a starting place and an opening scene ([worlds.ts](../../src/shared/worlds.ts)), so this needs a richer world format first: people, factions, places and quest hooks that start in the Journal, and the world's own peoples and customs in place of the built-in ones where it has them.

## Not planned
- Text-to-speech (unless audiobook-quality becomes practical)
