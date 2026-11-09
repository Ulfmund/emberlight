# 01 — Architecture

## Platform decision

**A desktop app built with web technology (Electron). It also serves the same interface to your phone over home Wi-Fi.**

Why:
- **Animations:** desktop vs. web makes no difference here. Both draw the interface with the same browser engine (Chromium), so every effect possible in one is possible in the other. What matters is the animation library and keeping effects GPU-friendly (transforms, opacity, canvas particles).
- **Ease of use:** a desktop app installs and launches by double-click. There's no terminal and no "open localhost:3000".
- **Phone:** the desktop app runs a small local server. Opening the app's **"Play on Phone"** button shows a QR code; scanning it opens the game in the phone's browser, and "Add to Home Screen" makes it behave like an app (PWA). Play from outside the home network goes through a tunnel link (0.5.0: a Cloudflare or Tailscale tunnel to a loopback-only listener, with the same pairing key).
- **One language everywhere:** TypeScript for the interface, the server and the rules engine. That's simpler for Claude-assisted iteration than Tauri, which needs Rust for the backend. Electron's downside is a larger download (~150 MB), which is acceptable here.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Shell | Electron | Window, tray, installer, auto-update (from GitHub releases) |
| UI | React + Vite + TypeScript | |
| Styling | Tailwind CSS + CSS variables for theming | Fantasy theme as the default skin |
| Animation | Motion (formerly Framer Motion) for UI; a lightweight canvas/particle layer for effects (runes, sparks, dice) | Respect the OS "reduce motion" setting, and give every effect its own toggle |
| Dice | 3D dice with physics (e.g. a dice-box library) with a 2D fallback on weak devices | |
| UI state | Zustand | |
| Server | Node (inside Electron) with a small HTTP + WebSocket API | The phone uses the same API |
| Storage | SQLite (one database file in the app's data folder) + a folder for images/audio | |
| Validation | Zod schemas for all data (cards, sheets, events, AI tool calls) | One source of truth for data shapes |

## Module map

Each module lives in its own folder, has a small public interface, and only talks to the others through it. Adding or replacing a feature should only touch its own module.

```
src/
  main/            Electron main process: window, starts the server, phone pairing (QR code and link), updates
  renderer/        React interface (screens, panels, chat, dice, effects)
  shared/          Types, Zod schemas and presets used by both sides
  server/          The local game server (HTTP API used by the window and the phone)
    store/         Settings, encrypted API keys; SQLite access and import/export (M1+)
    core/          (M1+)
      rules/       The ruleset: pure functions, no AI, no I/O (04-rules-system)
      state/       Event log, state projection, snapshots, saves (05)
      turn/        The turn loop: orchestrates the jobs below (06)
      memory/      Lorebooks, entity registry, timeline, prompt assembly (07)
      events/      Random event tables and triggers (06)
    ai/
      providers/   OpenAI-compatible, Ollama (native, for num_ctx) and Anthropic adapters (02)
      jobs/        Narrator, Referee, Scribe, Suggester, Vision, Namer prompts (06) (M1+)
      protocol/    Structured-output schemas + parsing/repair for weak models (02) (M1+)
    media/
      images/      Image generation adapters (SD WebUI/Forge, ComfyUI, OpenAI) (03)
      audio/       Ambient mixer (09, post-v1)
```

The rules, state and memory modules live inside the server so the phone gets exactly the same game as the desktop.

The **rules** module must stay pure (inputs in, results out). That makes it easy to unit test and easy to change balance numbers safely. All tuning numbers (caps, DCs, XP curves) go in data tables inside `rules/tables/`, not scattered through the code.

## API keys and secrets

- **In the finished app:** keys are entered on the Settings screen and stored encrypted by the operating system (Electron `safeStorage`, which uses Windows' built-in credential protection). They are saved in the app's user-data folder, **never in the project folder**, so they can't be accidentally committed or shared. Keys are only ever sent to the provider they belong to.
- **During development:** your own Anthropic key goes in a `.env` file in the project root. `.env` is listed in `.gitignore`, so git never tracks it. A `.env.example` file with blank values is committed to show what's expected.
- Campaign exports and card exports never include keys.

## Phone access security

- The phone server only listens on the local network and is **off until** "Play on Phone" is turned on.
- The QR code includes a one-time pairing code. Unpaired devices can't connect.
