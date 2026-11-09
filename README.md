# Emberlight (working title)

A roleplaying app with an AI Dungeon Master that works with local models (LM Studio, Ollama, Strata, KoboldCpp) and cloud models (Claude, OpenRouter).

> **Just want to play?** Follow [docs/INSTALL.md](docs/INSTALL.md): download the installer from **Releases** and double-click it. No command line needed.

The full design is in [docs/spec/](docs/spec/README.md). **Current state: Milestone 1** (playable core): character creator, rules engine, dice, an AI Referee/Narrator/Scribe turn loop, saving with rewinds and rerolls. Memory, lorebooks and combat depth come in Milestones 2 and 3.

## Running it (development)

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

This opens the app window. Changes to the interface reload instantly; changes under `src/main` or `src/server` need the app restarted (close it and run `npm run dev` again).

**Claude key for testing:** copy `.env.example` to `.env` and paste your key after `ANTHROPIC_API_KEY=`. `.env` is ignored by git. You can also paste the key on the Connect screen, which stores it encrypted by Windows instead.

## Other commands

| Command | What it does |
|---|---|
| `npm run typecheck` | Checks the code for type errors |
| `npm test` | Runs the rules and game tests |
| `npm run build` | Builds the app into `out/` |
| `npm start` | Runs the built app (like the finished version) |
| `npm run package` | Builds a Windows installer into `release/` |

## Making a new release (no command line)

On GitHub: **Releases → Draft a new release**, type a new tag (e.g. `v0.0.4`), add a few notes, and click **Publish release**. The *Build installer* action (`.github/workflows/release.yml`) builds the Windows installer and attaches it, plus the update files, to that release within ~10 minutes. The app's version number is taken from the tag. Installed copies then show an **Update** button.

Don't attach files to the release yourself: GitHub's download links for a file that gets replaced can fail for a while afterwards, so the workflow should be the only thing that uploads.

## Where things live

```
src/
  main/        Electron: the window, starting the local server
  server/      The local game server (the desktop window and, later, the phone use it)
    ai/          Model providers (OpenAI-compatible, Ollama, Claude) and DM prompts
    store/       Settings and encrypted API keys (saved in %APPDATA%/Emberlight)
  renderer/    The interface (React)
    src/screens/     Title, Connect, Play
    src/components/  Buttons, icons, embers, story text…
    src/assets/      Art (logo die, title backdrop)
  shared/      Types and presets used by both sides
art/blender/   Script that renders the logo and title art (re-run to regenerate)
docs/spec/     The design spec
```

## Regenerating the art

The logo die and title backdrop are rendered by Blender from a script, in a separate background process (it never touches files you have open):

```bash
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python art/blender/render_title_art.py -- art/out all
```

Then copy `art/out/title.jpg` to `src/renderer/src/assets/title.jpg`, and `art/out/icon.png` to `resources/icon.png` (the UI uses a 256px copy at `src/renderer/src/assets/logo-die.png`).
