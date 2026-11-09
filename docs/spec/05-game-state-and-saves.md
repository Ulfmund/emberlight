# 05 — Game State and Saves

## Event log (the core idea)

Game state is never edited directly. Every change is recorded as an **event**, and the current state is worked out by replaying the events. (This is called "event sourcing".)

```ts
type GameEvent = {
  id: string
  campaignId: string
  messageId: string      // the message that caused it
  seq: number            // order within the campaign
  type: string           // "damage", "heal", "item_add", "skill_xp", "rest", "manual_edit", ...
  payload: unknown       // checked against a Zod schema for that type
  source: "engine" | "ai" | "player"
  createdAt: number
}
```

- **State = the starting state + every active event, in order.** A snapshot is saved every N events so loading stays fast.
- Each event shows in a **Change Log** panel ("−6 HP: goblin's rusty blade", "+12 Mining XP") with an undo button.
- New event types are added by registering a type, a schema and an `apply(state, payload)` function in `core/state/events/`. Nothing else has to change.

## Messages, swipes and branches

- Every message (player or DM) has an id. The events it caused are tied to that id.
- **Regenerate / swipe:** creates a new version of the message. Only the events from the **currently selected** version are active, so switching swipes switches state.
- **Edit a past message:** the player can choose to re-run the turn from there, or just fix the text and keep its events.
- **Rewind:** go back to any message. Everything after it becomes an inactive branch (kept, not deleted). The player can return to it from the **Timeline** view.
- **Dice rolls are events too**, so rerolls and swipes don't secretly keep the old result.

## What's in a campaign

```
Campaign
├─ settings        (ruleset options, DM style, mercy, combat mode, survival toggle, ironman)
├─ world           (setting description, starting location)
├─ lorebooks[]     (linked world/character lorebooks; see 07)
├─ entities[]      (characters, places, factions, items: the memory registry; see 07)
├─ sheets[]        (game stats for characters in this campaign)
├─ messages[]      (with swipes and branches)
├─ events[]        (the event log)
├─ snapshots[]     (cached state for speed)
├─ timeline[]      (summaries and key events; see 07)
├─ media/          (portraits, item images, location art)
└─ saves[]         (named save slots)
```

## Saves

- **Autosave** after every turn. The player never loses progress.
- **Save slots:** a named bookmark at a specific message ("Before the dragon"). Loading one sets the active branch to that point. Because everything is in the event log, slots are tiny and instant.
- **Multiple campaigns:** a campaign picker on the home screen, with cover art, character portrait, last played time, and play-time stats.

## Storage and export

- **Storage:** one SQLite database file in the app's user-data folder, plus a `media/` folder for images. SQLite is a single, very robust file. There's no database server to install.
- **Backups:** the app keeps rolling automatic backups (last 7 days) of the database.
- **Campaign export:** a single `.rpcampaign` file (a zip containing `campaign.json` and the `media/` folder). It's portable, readable, and easy to back up or send to a friend. Import is drag-and-drop.
- **Card export:** standard Character Card V2/V3 PNG (see [03](03-characters-and-cards.md)).
- **Lorebook export:** SillyTavern-compatible World Info JSON.
- Exports never include API keys.
- Every file format has a `version` field, and the app migrates old versions forward automatically.

*Built:* rolling **backups** (one a day, kept for 7 days, in `backups/`, since 0.1). *0.11.0* (`src/server/core/portable.ts`): **campaign export** from the download button on each adventure in Your Adventures: an `.rpcampaign` zip of `campaign.json` (format `emberlight-campaign`, version 1: the whole story tree with every branch, the event log with rerolled results, save slots, the lorebooks it uses (built-in worlds by reference) and its character cards) and the cards' portraits under `media/`. **Import** with the Import button or by dropping the file on that screen: it comes in as a new adventure with new ids (so the same file can come in twice), message ids inside events and meta are carried over, a card or lorebook already in the library is reused, and a file from a newer version of the app is refused with a note to update. **Card export** from the library (a PNG card with the portrait, written as V2 `chara` and, for V3 cards, `ccv3` text chunks; JSON when there's no PNG portrait), and **Save as a character card** on the Sheet tab, which turns the character being played into a V2 card. Lorebook export (World Info JSON) came in 0.6.1.
