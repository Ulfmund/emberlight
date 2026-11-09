# 09 — Audio (post-v1 add-on)

> **Built (0.16.0).** Music and ambience follow the story: the place, the hour, the weather (the Scribe notes it; rain, fog and storm events bring it; it blows over after a few hours unless the story brings it back, and the DM is told either way), a fight, a death and a horror tone pick the mix from a table in `src/shared/scene.ts`, and the mixer (`src/renderer/src/audio/`) fades between mixes (1.5 s into a fight, 5 s otherwise). There is no download and no starter pack of recordings: the twelve ambience beds (wind, rain, storm, fire, crickets, birds, river, sea, cave drips, tavern, town, owls) and the music for seven moods (exploring, town, night, tension, fights, sorrow, eerie) are made on the spot with the Web Audio API, never quite the same twice. The player's own files (MP3, OGG, WAV, FLAC, M4A, WebM, up to 40 MB) go in a library (`audio/` beside the save, with `manifest.json`), tagged with moods or sounds, and play in place of the made-up ones; a first guess at the tags comes from the file name. Each device plays its own sound (the phone included), with Music, Sounds of the place and Effects sliders under *This device* and a mute button in the top bar. Level-ups, deaths and criticals duck the music. Not built: tagging intensity, a boss mood, and separate stinger tracks.

> "Ambient sounds and music would be really cool as an addon, dynamically selected from preset provided tracks for combat, forest, wind, crickets, and blends them together intelligently based on the scene." — the artist

There's no text-to-speech. Free TTS voices aren't good enough, so it's left out unless an audiobook-quality option becomes practical.

## Layers

| Layer | Examples | Behavior |
|---|---|---|
| **Music** | Explore, travel, town, tension, combat, boss, sorrow | One track at a time, crossfades (3–8 s) |
| **Ambience** | Forest, wind, crickets, rain, fire crackle, tavern crowd, cave drips, sea | Several at once, each with its own volume |
| **Stingers** | Victory, level-up, death, discovery | One-shot, ducks music briefly |
| **UI sounds** (v1) | Dice clatter, page turn, coins, button clicks | Short, quiet. *Built (0.12.0)*, synthesized: see [08](08-ui-ux.md#feel-and-animation-juice) |

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
