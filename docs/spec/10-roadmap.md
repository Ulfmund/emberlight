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

## Milestone 2 — Memory
- Scribe job; entity registry; relationships and dispositions *(people and places with facts, status and attitude ✅ 0.3.0; factions, items and relationships between NPCs to do)*
- In-game clock; timeline; layered summaries *(clock and scene / chapter / story-so-far summaries ✅ 0.3.0; timeline view comes with the Journal)*
- Budget-aware prompt assembly (lean / standard / rich) + context inspector
- Journal tab (People, Places, Timeline), all editable *(People, Places, Story and Pinned notes ✅ 0.4.0)*
- Lorebooks (core features + SillyTavern import)
- **Example world template:** a small region with a filled-in lorebook, NPC stubs and an opening scene, to copy or learn from
- Name generators, banned-name stream filter, phrase list
- Rename / retcon flow

## Milestone 3 — Game depth
- Combat modes (narrative / turn-based / mixed), ambush and initiative, enemy templates
- Inventory, equipment slots, encumbrance, money
- Gathering and crafting skills with recipes and nodes
- Conditions, survival needs, rest rules (auto-detected sleep)
- Random event tables and DM-initiated rolls (hidden checks)
- Death flow, Hall of the Fallen, quick new adventurer in the same world
- DM style settings, DM persona cards

## Milestone 4 — Polish and reach
- Full "juice" pass (including the typing runes), effects settings
- Suggestions + ghost text
- Play on Phone (QR pairing, PWA, mobile layout, shake to roll)
- Image generation (SD WebUI/Forge, ComfyUI, OpenAI-compatible)
- Image input (vision, or a captioning fallback)
- Card, lorebook and campaign export; automatic backups
- Full lorebook feature set (recursion, groups, sticky/cooldown, etc.)
- Spells
- UI sound effects

## v1.x
- Ambient audio and dynamic music ([09](09-audio.md))
- Semantic (embedding) memory search
- Faction reputation
- Location art; a simple map of visited places
- Companions travelling with the player (AI-controlled in combat)

## v2 — Life sim (if the artist wants it)
- **Aging:** characters age over in-game time, and caps shift with it (physical caps fall after middle age, Intellect/Arcane caps rise), using the age table in [04](04-rules-system.md#attribute-caps) as stages
- Long time-skips ("five years pass…") with summarized events
- Homes, property, jobs, income from trade skills
- Seasons with effects on gathering and travel
- Family and legacy: heirs, inheritance, and playing the next generation after a death

## Not planned
- Multiplayer
- Text-to-speech (unless audiobook-quality becomes practical)
