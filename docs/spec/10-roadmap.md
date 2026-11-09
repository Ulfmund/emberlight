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

## Milestone 3 — Game depth
- Combat modes (narrative / turn-based / mixed), ambush and initiative, enemy templates ✅ 0.9.0 (24 templates, the tracker, one-tap moves, DM-started fights)
- Inventory, equipment slots, encumbrance, money ✅ 0.8.0
- Gathering and crafting skills with recipes and nodes ✅ 0.10.0 (16 gathering spots, 28 recipes, the Bag's Make list)
- Conditions, survival needs, rest rules (auto-detected sleep) ✅ 0.8.0
- Random event tables and DM-initiated rolls (hidden checks) ✅ 0.9.0
- Death flow, Hall of the Fallen, quick new adventurer in the same world ✅ 0.10.0 (epitaphs; continue as your child)
- DM style settings, DM persona cards ✅ 0.8.0 (event frequency ✅ 0.9.0)

## Milestone 4 — Polish and reach
- Full "juice" pass (including the typing runes), effects settings ✅ 0.12.0
- Suggestions + ghost text ✅ 0.11.0
- Play on Phone (QR pairing, PWA, mobile layout, shake to roll) *(QR pairing on Wi-Fi, tunnel link and mobile layout ✅ 0.5.0; home-screen app and shake to roll ✅ 0.12.0)*
- Image generation (SD WebUI/Forge, ComfyUI, OpenAI-compatible) ✅ 0.14.0 (portraits for you and the people of the story)
- Image input (vision, or a captioning fallback) ✅ 0.14.0
- Card, lorebook and campaign export; automatic backups ✅ 0.11.0 (backups since 0.1, lorebook export since 0.6.1)
- Full lorebook feature set (recursion, groups, sticky/cooldown, etc.) ✅ 0.15.0 (positions, sticky/cooldown/delay, character filters, book budgets, global books; semantic matching ✅ 0.20.0 with memory by meaning)
- Spells ✅ 0.13.0 (17 spells; learned from callings, teachers and tomes)
- UI sound effects ✅ 0.12.0

## v1.x
- Ambient audio and dynamic music ([09](09-audio.md)) ✅ 0.16.0 (made on the spot, or from your own tagged tracks)
- Semantic (embedding) memory search ✅ 0.20.0 (memory by meaning: people, places, older chapters and lore recalled by what's happening, with a local embedding model)
- Faction reputation ✅ 0.18.0 (standing from hated to honoured, moved by your deeds; it counts on social checks with their people)
- Location art; a simple map of visited places ✅ 0.19.0 (wide pictures of places, emblems for factions, and the Journal's map of the way so far)
- Companions travelling with the player (AI-controlled in combat) ✅ 0.17.0 (up to four, from cards or the story; five fighting roles; healers can save you)

## 1.0 — The life sim, storytellers and peoples
*Decided 2026-11-09: the life sim comes into 1.0 instead of a later v2, along with storyteller personalities and the peoples' cultures.*
- **Aging** ✅ 0.24.0: characters grow older with the calendar (some peoples much slower), and the stage of life they reach sets their caps (physical caps fall after middle age, Intellect and Arcane caps rise) ([04](04-rules-system.md#seasons-and-aging))
- **Seasons** with effects on gathering, weather and sound ✅ 0.24.0 (the DM plays winter roads as slow and a night in the open as dangerous)
- **The peoples' ways** ✅ 0.25.0: how humans, dwarves and elves live, their customs for men's and women's work, and what they think of each other ([06](06-ai-dm.md#the-peoples-ways))
- **Storytellers**, RimWorld-style ✅ 0.26.0: Whalechan, the Veteran, the Romance Writer, the Old Soul, the Mystery Writer and the Gambler join the original five; each has a voice, a habit, and leanings that shape which random events come ([03](03-characters-and-cards.md#the-dm-is-a-card-too))
- **Long time-skips** ("five years pass…") ✅ 0.27.0: from the Sheet or out of character; the engine ages, mends and trains the character, and the DM tells the years as a montage ([04](04-rules-system.md#time-skips))
- **Homes and work** ✅ 0.28.0: rent or buy a home (a night there mends fully), take up work that pays by its skill, and spend days, weeks or years at it ([04](04-rules-system.md#homes-and-work))
- Family and legacy: marriage, children growing up, heirs and inheritance *(playing the next generation after a death ✅ 0.10.0)*

## Not planned
- Multiplayer
- Text-to-speech (unless audiobook-quality becomes practical)
