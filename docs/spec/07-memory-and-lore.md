# 07 — Memory and Lore

This is what makes or breaks long campaigns, especially on small or low-context models. Instead of hoping the model remembers, the app **keeps the facts in structured records** and gives the model only the relevant slice of them each turn.

Four memory systems work together:

| System | Holds | Written by |
|---|---|---|
| **Lorebooks** | World knowledge written up front (places, history, magic, factions) | The player / imported |
| **Entity registry** | Every character, place, faction and notable item that appears in play | The Scribe (automatically) + the player |
| **Timeline** | What happened, in order, with in-game dates | The Scribe + the Summarizer |
| **Pinned notes** | Facts the player marks "always remember" | The player (`/note`, 📌) |

---

## Lorebooks (full-featured, SillyTavern World Info compatible)

Import and export the SillyTavern World Info JSON format, plus lorebooks embedded in character cards.

Each entry supports:

| Feature | Meaning |
|---|---|
| Primary keys | Words that trigger the entry (with aliases) |
| Secondary keys + logic | AND ANY / AND ALL / NOT ANY / NOT ALL |
| Regex keys | For complex matching |
| Case-sensitive / whole-word | Matching options |
| Constant | Always included |
| Scan depth | How many recent messages are scanned for keys |
| Insertion position | Before/after character info, in the scene block, or at depth N in the chat |
| Order / priority | Which entries win when the budget is tight |
| Probability | % chance to include when triggered |
| Recursion | Entries can trigger other entries (with a depth limit and per-entry opt-out) |
| Groups | Only one entry from a group is included (with weights) |
| Sticky / cooldown / delay | Stays active N turns; can't re-trigger for N turns; only active after N messages |
| Character filter | Only applies when certain characters are present |
| Token budget | Per-lorebook and global limits |
| Semantic match (optional) | Triggers by meaning, not just keywords (needs embeddings) |

**Built (0.6.1)** (`src/shared/lore.ts`): primary keys, secondary keys with all four logics, regex keys, case-sensitive and whole-word matching, constant entries, scan depth (default 4 messages), priority, probability, groups (highest priority wins), and recursion (2 rounds, with both opt-outs). When space is short, constant entries come first, then whatever came up most recently (an entry woken by recursion ranks just behind the one that woke it), then priority; the chosen entries are written in priority order. Lore gets about 2,500 / 6,000 / 10,000 characters on lean / standard / rich models. SillyTavern World Info files and card books import, and export back to World Info. Not yet: insertion positions (everything goes in the WORLD NOTES block), sticky / cooldown / delay, character filters, semantic matching, and per-book budgets.

Lorebooks can be linked to a **campaign** (world lore), a **card** (a character's personal lore), or kept **global**. The editor is a friendly form with a list on the left and the entry on the right, plus a "test" box: type a sentence and see which entries would fire.

*Built (0.6.1):* a library of lorebooks (SQLite `lorebooks` table), attached to a campaign at creation (Adventure step) or later (Journal → Lore). Campaigns read their lorebooks live, so edits apply on the next turn. The editor saves by itself, can export, and has the test box. Card books stay linked to their card. "Global" books are not built yet.

---

## Entity registry

Every named thing in the story gets a record:

```ts
type Entity = {
  id: string
  kind: "character" | "place" | "faction" | "item" | "creature"
  name: string                 // canonical spelling
  aliases: string[]            // nicknames, titles, old names
  summary: string              // one line, used in lean prompts
  description: string          // fuller, used when there's room
  facts: { text: string; importance: 1|2|3|4|5; pinned: boolean; sourceMessageId: string }[]
  status: "alive" | "dead" | "missing" | "destroyed" | "unknown"
  firstSeen: { messageId: string; gameTime: GameTime; placeId?: string }
  lastSeen:  { messageId: string; gameTime: GameTime; placeId?: string }
  locationId?: string          // where they are now, if known
  image?: string
  sheetId?: string             // if they have game stats
}

type Relationship = {
  fromId: string; toId: string
  kind: string                 // "sister of", "owes money to", "sworn enemy"
  disposition?: number         // −100..100, for characters toward the player
  since: GameTime
  history: { gameTime: GameTime; change: string; messageId: string }[]
}
```

**Built (0.3.0):** people and places (`kind: person | place`; factions and items come later). Records are events (`entity`), so they follow the branch being played: rewinding past a meeting forgets it. The Scribe sends name, other names, a one-line summary, up to 2 new facts, status and attitude (hostile → devoted, instead of a −100..100 number for now). Matching: people by name or alias, with titles ignored ("Tam" = "Old Tam"); places by exact name ("Hollin's Ford" ≠ "Hollin's Ford inn"). When a stranger recorded under a description gives their name, the record is renamed and the description kept as another name. At most 12 facts per record (newest kept); guesses ("possibly…") are never stored. Code: `src/shared/memory.ts`, Scribe in `src/server/ai/jobs/scribe.ts`.

**Name consistency:**
- The registry holds the **canonical spelling**. Every prompt includes "Names in this scene" with the correct spellings.
- The Scribe checks names in new responses against the registry with fuzzy matching ("Brena" vs. "Brenna") and corrects misspellings in the displayed text.
- Renames follow the rules in [03](03-characters-and-cards.md#editing-characters-and-updating-the-story).

---

## Timeline

- An **in-game clock and calendar**: day count, season, time of day. Time moves when the Referee or Scribe reports time passing, or on rest and travel.
- **Event entries:** `{ gameTime, messageRange, summary, participants[], place, importance }`. They are always stored and shown **in order**, so the model is never asked to work out the sequence itself.
- **Summaries in layers:**
  - **Scene:** a few sentences, written when the scene changes (new location, time skip, combat ends).
  - **Chapter:** a paragraph made from about 5–10 scenes.
  - **Arc / "Story so far":** a short running summary of the whole campaign.
- Summaries can be edited by the player. The edited version becomes the truth.

**Built (0.3.0):** scene, chapter and story-so-far summaries (`src/server/ai/jobs/summarizer.ts`), written in the background after a turn so play never waits:
- Summarizing starts once the story fills 40% of the model's context (so short campaigns on big models never pay for it).
- A **scene** covers 10–16 story messages, ending early when the character arrives somewhere new; the newest 2 messages are never summarized yet.
- A **chapter** is made from 6 scenes, and the **story so far** is rewritten after each chapter.
- Each summary is an event on the last message it covers, so it survives rerolls and swipes of later messages and disappears with a rewind past it.
- Editing summaries comes with the Journal.

---

## Prompt assembly

Each turn, `core/memory/assemble.ts` builds the prompt to fit the model's **actual context size** (from the capability profile). It adds blocks in priority order until the budget runs out:

| Priority | Block | Lean (≤8k) | Standard (8–32k) | Rich (32k+) |
|---|---|---|---|---|
| 1 | DM rules + style + rules summary | Compact | Full | Full |
| 1 | "This turn" block (input, resolved rolls, effects, directives) | ✓ | ✓ | ✓ |
| 1 | Player sheet summary (HP, conditions, key gear) | One line | Short | Full |
| 2 | Scene: location, time, weather, who's present (one-line cards, dispositions), names in scene | ✓ | ✓ | ✓ |
| 2 | Pinned notes | ✓ | ✓ | ✓ |
| 3 | Story so far (arc summary) | Short | ✓ | ✓ |
| 3 | Recent messages | 2–4 | 10–20 | As many as fit |
| 4 | Relevant entities (mentioned recently or in the input), with relationships | Summaries | Descriptions | Descriptions + facts |
| 4 | Relevant timeline events (involving present characters or place), in order | Top 3 | Top 10 | More |
| 5 | Triggered lorebook entries | By priority | ✓ | ✓ |
| 6 | Recent chapter summaries | — | ✓ | ✓ |
| 7 | Example dialogue from cards | — | Some | ✓ |

**How relevant memory is found:**
1. **Keyword and alias matching** against the registry and lorebooks (always on, works with every model).
2. **Recency and presence:** characters in the scene and the current place are always relevant.
3. **Semantic search** (optional): if the server provides embeddings (LM Studio and Ollama both do), memories are also matched by meaning.

**Built so far (0.3.0):** the narrator prompt gets "THE STORY SO FAR" (the arc, then chapters, then scenes after the last chapter, newest first when space is short; 12–18% of the context) and "PEOPLE AND PLACES FROM EARLIER" (the current place, anyone mentioned in the last 6 messages, then the most recently seen; 6 / 10 / 14 records with 2 / 4 / 6 facts for lean / standard / rich). A summary is left out while its messages still fit word for word, so nothing is said twice. The full block-by-block budgeter and the inspector are still to do. The context size set on the Connect screen is now honoured for every model, including Claude (to cap cost).

**Context inspector** (Advanced): shows exactly what went into the last prompt, block by block, with token counts. It's essential for debugging "why did the DM forget X?".

---

## Journal (what the player sees)

A **📖 Journal** tab with sub-tabs, all editable:
- **People:** portraits, one-liners, status, relationship meter, "last seen at…"
- **Places:** visited locations, with notes and optional art
- **Factions**
- **Quests:** active / done / failed
- **Timeline:** a scrollable, chronological story timeline with chapter headers
- **Hall of the Fallen:** dead characters

Correcting something in the Journal corrects the AI's memory, since the Journal *is* the memory.

**Built (0.4.0):** a Journal overlay (button on the character panel) with **People**, **Places**, **Story** (the story so far, then chapters with their scenes, then scenes since the last chapter) and **Pinned** notes. Everything is editable: name, other names, description, facts, feelings and status; summary titles and text; the story so far. People and places can be forgotten. Pinned notes go into every prompt ("PINNED NOTES"). Journal changes are player events (`entity_edit`, `entity_forget`, `summary_edit`, `arc`, `note`, `note_remove`) tied to the very first message, so they survive rerolls, rewrites and rewinds; a correction to someone who doesn't exist on the current branch does nothing there. A renamed record keeps its old name as another name, so the AI's later mentions still find it. Factions, quests and the Hall of the Fallen come later.
