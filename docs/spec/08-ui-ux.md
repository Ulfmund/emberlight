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
- Each DM message: ◀ ▶ to switch swipes, 🔄 regenerate, ✏️ edit, ⏪ rewind to here.

**Bottom: the input area.** Suggestion chips, a **quick-action bar** of large icon buttons, the input box with ghost text, an OOC toggle and Send. Quick-action buttons are context-aware: ⚔ appears in danger, 🏕 when it's safe to rest, ⚒ near a forge.

**Right: tabbed panel.**
- **Sheet:** attributes as bars with cap markers, and skills grouped (Combat, Adventuring, Social, Gathering, Crafting) with level, XP progress and cap. Every number has a tooltip explaining where it comes from.
- **Bag:** an inventory grid with item icons, an equipment "paper doll", weight bar, and coin. Drag to equip. Right-click (long-press) for Use / Drop / Inspect.
- **Journal:** People, Places, Factions, Timeline, Hall of the Fallen (see [07](07-memory-and-lore.md#journal-what-the-player-sees)).
- **Quests**
- **Nearby:** who's in the scene, with disposition meters
- **Log:** the change log (every stat change, with undo)

**Dice tray:** an overlay that slides up when a roll is waiting. You click and flick to throw (or shake the phone).

## Mobile layout

- The story feed fills the screen. HP / stamina / mana are thin bars pinned at the top.
- A bottom tab bar: **Story · Sheet · Bag · Journal · More**.
- The quick-action bar scrolls sideways above the input box.
- Long-press = tooltip. Shake = throw dice (optional, uses device motion).
- Connecting: **Play on Phone** on the PC shows a QR code. Scan it, then tap "Add to Home Screen" (see [01](01-architecture.md#platform-decision)).

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
