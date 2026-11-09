# Open Questions

## Answered

| # | Question | Answer |
|---|---|---|
| 1 | What is Strata? | An open-source local inference engine (C++) that runs large Qwen models on consumer GPUs and exposes an **OpenAI/Anthropic-compatible local API**. It gets a **Strata** preset on the connection screen, using the OpenAI-compatible adapter. Its default port still needs confirming from its docs; until then the preset auto-probes common ports and the address can be edited. |
| 2 | Starter world? | Not required. Ship an **example world template** (a small region with a filled-in lorebook, a few NPC stubs and an opening scene) so the artist can see how everything fits together, then copy or replace it. Lands with lorebooks in Milestone 2. |
| 6 | Art? | Placeholders for now, made as good as possible (Blender renders, hand-built SVG icons). The artist can replace them later through the theme system. |

## Still open

Each lists the current assumption.

3. **After death:** confirm the default is "new adventurer in the same world". Should a new character inherit anything (an heirloom, a stash, a relative's reputation)?
   *Assumption: same world; no inheritance in v1.*

4. **Skill progression:** skills grow **both** by use (OSRS-style XP) and by skill points from level-ups. Use-only or points-only instead?
   *Assumption: both.*

5. **Sex modifiers** only affect STR and PRE (±1). Touch more attributes or any skills?
   *Assumption: just STR and PRE, with a campaign toggle.*

7. **Phone outside the house:** home Wi-Fi only for now?
   *Assumption: yes; remote play (e.g. Tailscale) later.*
