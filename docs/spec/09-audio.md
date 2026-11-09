# 09 — Audio (post-v1 add-on)

> "Ambient sounds and music would be really cool as an addon, dynamically selected from preset provided tracks for combat, forest, wind, crickets, and blends them together intelligently based on the scene." — the artist

There's no text-to-speech. Free TTS voices aren't good enough, so it's left out unless an audiobook-quality option becomes practical.

## Layers

| Layer | Examples | Behavior |
|---|---|---|
| **Music** | Explore, travel, town, tension, combat, boss, sorrow | One track at a time, crossfades (3–8 s) |
| **Ambience** | Forest, wind, crickets, rain, fire crackle, tavern crowd, cave drips, sea | Several at once, each with its own volume |
| **Stingers** | Victory, level-up, death, discovery | One-shot, ducks music briefly |
| **UI sounds** (v1) | Dice clatter, page turn, coins, button clicks | Short, quiet |

## How the scene decides the mix

1. The **Scribe** outputs scene tags each turn (see [06](06-ai-dm.md#7-scribe)): location type, time of day, weather, mood, combat yes/no.
2. The **mixer** (`media/audio/`) turns tags into a target mix. For example: *forest + night + rain* → forest bed at 60%, crickets at 40%, rain at 70%, "explore-night" music.
3. It fades from the current mix to the target smoothly, never cutting off abruptly. Combat starting switches music quickly (1–2 s); everything else blends slowly.
4. Rules for this are a simple data table, so they're easy to tune.

## Track library

- The app ships with a starter pack (royalty-free or commissioned).
- The artist can drop their own files into a folder and tag them in a simple screen (type, tags, loopable, base volume, intensity).
- Stored as a manifest: `audio/manifest.json`.

## Controls

Master / Music / Ambience / Effects volume sliders, a mute button in the top bar, and "Audio on phone" (the phone plays the sound itself).

Built on the Web Audio API (e.g. via Howler.js) for seamless loops and crossfades.
