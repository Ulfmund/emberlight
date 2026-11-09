# 08 — UI and UX

The goal is that it **looks and feels like a game**: clear panels, icons for everything, short tooltips, and satisfying feedback on every action. Nothing should feel like a settings dump.

## First run (under 3 minutes to playing)

1. **Connect a model:** big preset buttons (LM Studio, Ollama, Claude…), a model dropdown, Test ✓.
2. **Create a character:** guided creator or 🎲 *Roll a New Adventurer*.
3. **Pick a world:** the built-in starter world, "generate one for me", or blank.
4. **Play.**

## Home screen

- A big **▶ Continue** button for the last campaign.
- Campaign cards: cover art, character portrait, name, level, last played.
- Character library, lorebook library, settings.

## In-game layout (desktop)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ☰  The Ashen Road   ·  📍 Millbrook Crossing  ·  🌙 Night, Day 12  ·  🌧  │
├──────────────┬───────────────────────────────────────┬───────────────────┤
│  [portrait]  │  Narration paragraph, no portrait…    │ [Sheet][Bag]      │
│  Brenna, Lv4 │                                       │ [Journal][Quests] │
│  ♥ ████░ 18  │  (o) Old Tam                          │ [Nearby][Log]     │
│  ⚡ ███░ 12  │      ╭─────────────────────╮          │                   │
│  ✦ ██░░  6   │      │ "Road's not safe…"  │          │  tab contents:    │
│  XP ██████░  │      ╰─────────────────────╯          │  skills, items,   │
│  conditions: │  ┌─ 🎲 Perception · HARD ───────┐      │  people…          │
│  🩸 ✨       │  │ 17 + 3 = 20 → CLEAN SUCCESS  │      │                   │
│              │  └──────────────────────────────┘      │                   │
├──────────────┴───────────────────────────────────────┴───────────────────┤
│ 💡 bold · careful · say     [🏕 Rest] [⚔ Tactical] [🎲 Roll] [📜 Recap]   │
│ ┌──────────────────────────────────────────────────────┐ [OOC] [Send ➤]  │
│ │ "Who's following us?" I whisper, hand on my dagger.  │                 │
│ └──────────────────────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────────────────┘
```

**Left: character panel.** Portrait, name, level, HP / stamina / mana bars, XP bar, condition icons (tooltips on hover).

**Center: the story feed.**
- **Narration:** plain paragraphs, no portrait, in a readable book font.
- **Dialogue:** a speech bubble with the speaker's portrait. Each character gets a subtle accent color.
- **Player action:** a styled line (italic, with a small player-portrait marker). **Player speech:** a bubble on the player's side.
- **Roll cards:** inline, with the dice result, breakdown on hover, tier label, and a 🔄 reroll button.
- **Event cards:** small banners for things like "⚠ Ambush!", "📈 Mining 12", "🕯 Day 13 begins".
- Each DM message: ◀ ▶ to switch swipes, 🔄 regenerate, ✏️ edit, ⏪ rewind to here. *(Built: the latest reply has **Rewrite**; since 1.0.3 every older reply has **Rewrite** too, a new version of it with the dice unchanged, and **Rewind**, going back to that moment. What came after is kept as a branch either way. Each player turn can be taken back.)*

**Bottom: the input area.** Suggestion chips, a **quick-action bar** of large icon buttons, the input box with ghost text, an OOC toggle and Send. Quick-action buttons are context-aware: ⚔ appears in danger, 🏕 when it's safe to rest, ⚒ near a forge.

**Right: tabbed panel.**
- **Sheet:** attributes as bars with cap markers, and skills grouped (Combat, Adventuring, Social, Gathering, Crafting) with level, XP progress and cap. Every number has a tooltip explaining where it comes from.
- **Bag:** an inventory grid with item icons, an equipment "paper doll", weight bar, and coin. Drag to equip. Right-click (long-press) for Use / Drop / Inspect.
- **Journal:** People, Places, Factions, Timeline, Hall of the Fallen (see [07](07-memory-and-lore.md#journal-what-the-player-sees)).
- **Quests**
- **Nearby:** who's in the scene, with disposition meters
- **Log:** the change log (every stat change, with undo)

**Dice tray:** an overlay that slides up when a roll is waiting. You click and flick to throw (or shake the phone).

### Map

*Built (0.19.0).* The Journal's **Map** is a traveller's sketch rather than a survey: every place the character has been (from the Scribe's locations on the branch being played), drawn with an icon and colour for its kind (town, village, indoors, road, forest, hills, water, ruin, underground, wild), joined by the ways walked between them (thicker for ways walked more often), with a glowing ring where the character is now. The layout is worked out from the journey itself (places start along the way they were reached, then ways pull like strings and places push apart), so the same journey always draws the same way. Tap a place for its picture, what's known of it, and how often and when you were there. Code: `src/shared/journey.ts`, `src/renderer/src/screens/play/JourneyMap.tsx`.

## Mobile layout

- The story feed fills the screen. HP / stamina / mana are thin bars pinned at the top.
- A bottom tab bar: **Story · Sheet · Bag · Journal · More**.
- The quick-action bar scrolls sideways above the input box.
- Long-press = tooltip. Shake = throw dice (optional, uses device motion).

*Built (0.12.0)*: a web app manifest and home-screen icons, so **Add to Home Screen** gives a full-screen Emberlight app with its own icon (the manifest and icons are the only things a phone can fetch before pairing). **Shake to throw**: two strong jolts within half a second throw the waiting die. It needs the secure link (https) because browsers only give motion sensors to secure pages, and on iPhones a one-time "Let me shake to throw" tap on the dice tray.
- Connecting: **Play on Phone** on the PC shows a QR code. Scan it, then tap "Add to Home Screen" (see [01](01-architecture.md#platform-decision)).

**Built (0.5.0):**
- Below 768px wide: a slim status strip (portrait, name, level, health / stamina / mana) with Journal and Character buttons; Character opens a full-screen drawer with the character panel and the Sheet / Bag / Log / Saves tabs (instead of the bottom tab bar). The creator's steps become an icon strip with the cards and random-roll buttons; the Journal and the character library go full screen. Controls that appear on hover are always shown on touch screens (`touch:` variant). Long-press shows tooltips; shake to roll and the home-screen app (a PWA manifest) came in 0.12.0, and suggestions for what to do (0.11.0) serve as quick actions.
- **Play on Phone** (title screen, computer only): "Allow phones on this Wi-Fi" opens a second listener on all network interfaces (port 41740) and shows a QR code with the pairing link. Windows asks once whether Emberlight may use the network.
- **Link for a tunnel** (Advanced): a loopback-only listener (port 41750) for a tunnel the player runs (Cloudflare Tunnel, Tailscale Serve).
- **Security** (`src/server/remote.ts`): anything arriving on those listeners, or carrying proxy headers on the main port, is remote. It needs the 192-bit key: `?key=…` once, then an HttpOnly, SameSite=Lax cookie (Secure over HTTPS). Remote requests must be same-origin, can never use `/api/keys`, `/api/update/*` or `/api/remote`, and may only point a preset at its own addresses, so the saved API key can't be sent anywhere new. "Disconnect all phones" makes a new key.

## One adventure, several screens

*Built (1.0.1).* A paired phone plays through the PC's own server, so the PC and the phone share one copy of every adventure. Before 1.0.1 each screen only showed what it last loaded, and opening the story on a second screen while the first was waiting for the DM asked the DM again, writing a second reply beside the first. Now:

- **One turn at a time.** The server plays one turn per adventure at once, whichever screen sent it. Another screen asking meanwhile is told the DM is already answering.
- **Catching up.** Every view carries a stamp that changes whenever anything in the adventure does. An open screen checks it every 3 seconds (only while it's visible, and at once when it wakes) and reloads the story if it changed. While the DM answers a turn from the other screen, the story says so.
- **No moves from a stale screen.** Every change a screen sends carries the head of the story it shows. Acting, answering a roll, rewriting, rerolling, rewinding or switching versions from a screen that hasn't caught up is refused, and the screen is shown the story as it stands.
- Opening an adventure that's waiting for the DM only asks the DM if no screen already has.

**Reconciling** *(1.0.3)*, as NovelAI does. Before a move, a screen checks it's showing the story as it stands, and compares its version with the latest after the point both share:

- **The other screen only carried the story on** (nothing on this screen is missing from the latest): this screen catches up and says so ("Caught up"). The move isn't made blind; typing is handed back to the input box to send again once read.
- **The story split** (this screen shows messages the latest no longer has: the other screen rewound, switched versions or rewrote): **The story changed** shows both versions after the shared point, newest four of each. **Show the latest** catches up. **Keep this screen's** takes the story back to this screen's version (the other stays as a branch you can rewind to), then makes the move that was waiting.
- The same happens when the background check finds the story split while the screen is idle; a story that only carried on is followed quietly.
- **Stop** waits for the server to finish saving what the DM wrote before looking again. (In 1.0.1 a screen could miss its own stopped reply and then be refused as stale, blamed on "another screen".)
- A reply is written into its message when the DM finishes, and that changes the stamp too, so a screen that caught up mid-turn sees the finished reply; while the other screen's turn runs, its empty reply isn't shown.

Code: `src/renderer/src/sync.ts`, `stamp` in `src/server/store/db.ts`, the turn lock in `src/server/core/turn.ts`.

## Feel and animation ("juice")

Every effect has a toggle, and there's a master **Effects** setting: Off / Subtle / Full. The OS "reduce motion" setting is respected. Effects only animate cheap properties (position, scale, opacity) or draw on a separate canvas layer, so they never slow down typing or scrolling.

| Moment | Effect |
|---|---|
| **Typing** | When a word is finished (space or punctuation), a brief glowing rune flickers at the word and fades (~300 ms) |
| Streaming text | Each new word fades in softly instead of popping |
| Taking damage | HP bar flashes red, with a "ghost" bar that drains after it; a floating −6; a light screen shake on big hits (separate toggle) |
| Healing / rest | Green shimmer up the bar, floating +12 |
| Dice | 3D dice with physics and sound. **Natural 20:** golden burst and chime. **Natural 1:** dice crack, dull thud |
| Result tier | The tier label stamps in with its own color and sound |
| Item gained | The item icon flies into the 🎒 tab, which bounces |
| Skill level-up | Toast with the skill icon, glow, and a level number tick-up |
| Character level-up | Full celebration: light pillar, points-to-spend badge pulsing on the Sheet tab |
| Buttons | Soft squash on press, glow on hover |
| Death | Screen desaturates, vignette closes in, death screen fades up |

*Built (0.12.0)*: device settings (Saves tab, **This device**; kept per phone or computer in local storage, `src/renderer/src/prefs.ts`): **Effects** Full / Subtle / Off (default Full, or Subtle when the system asks for less motion; Off stops all animation and the embers, and the dice just land), **Screen jolt on big hits**, **Sound effects** with a volume slider, **Shake to throw dice** (phones) and **Autocomplete** (ghost text). With Full effects:

- **Typing runes:** a faint rune glints where a word was just finished (a space or punctuation typed at the end; on phones, spaces only), one at a time, about 0.4 s.
- **Floating numbers:** −6 or +12 rises off the health, stamina and mana bars when they change (Subtle too).
- **Screen jolt** when one turn takes a quarter of your health (and at least 5).
- **Level-up pillar:** a beam of light with the new level, on top of the toast.
- Dice: shorter tumble with Subtle; none with Off.

**Sound effects** (`src/renderer/src/sound.ts`) are made on the spot with the Web Audio API, so there are no audio files and each sound varies a little: the dice rattle and land, a chime for a natural 20, a cracked thud for a natural 1, soft tones for success and failure, a hit, a healing shimmer, coins, an item, a level-up fanfare, and a low toll for a death. They play after the browser's first touch or click (browsers require that).

### About the typing rune effect

You're right that almost nobody does this, and there are three reasons why:
1. **Technical:** a normal text box can't style individual words. The usual workaround is a transparent overlay that mirrors the text and draws the effect at each word's position. It's very doable, but it has to be done carefully.
2. **Phone keyboards:** autocorrect and predictive text change words after you type them, which can confuse the effect. On mobile it should trigger only on the space key and stay very light.
3. **Distraction:** at fast typing speeds a big effect becomes noise. It should be **subtle by default** (a faint glint, not a flare) and limited to one at a time.

None of these is a dealbreaker. It goes in as a v1 polish item with its own toggle.

## Visual style

- **Default theme:** dark fantasy: deep leather and ink backgrounds, warm parchment panels, gold accents. A light "parchment" theme is also available.
- **Fonts:** a readable serif for the story (e.g. Crimson Pro or EB Garamond) and a clean sans-serif for the UI. Text size slider.
- **Icons:** RPG icons from game-icons.net (thousands of free fantasy icons, CC BY 3.0, so it needs an attribution credit) and Lucide for plain UI icons. Ideally, the artist replaces any of these with their own art over time. The theme system makes icons and frames swappable.
- **Tooltips:** everywhere, one or two lines, with a short delay. Hover on desktop, long-press on mobile.

## Accessibility

Text size, high-contrast option, reduce motion, full keyboard shortcuts (Enter to send, Tab to accept ghost text, R to roll, Ctrl+Z to undo the last turn), and color never used as the only signal (tiers also have labels and icons).
