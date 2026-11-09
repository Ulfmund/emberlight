# 02 — Models and Backends

## Providers (v1)

| Provider | Covers | Notes |
|---|---|---|
| **OpenAI-compatible** | LM Studio, Ollama, KoboldCpp, llama.cpp server, vLLM, OpenRouter, OpenAI | One adapter that speaks `/v1/chat/completions` and `/v1/models` |
| **Anthropic** | Claude models | Native adapter with prompt caching for the stable part of the prompt (rules, character, lore) |

Adding a provider means adding one file in `ai/providers/` that implements the shared `Provider` interface: `listModels`, `chat` (streaming), `capabilities`.

## Connection screen (what the artist sees)

- Big preset buttons: **LM Studio**, **Ollama**, **Strata**, **KoboldCpp**, **OpenRouter**, **Claude**, **Custom**. A preset fills in the address automatically; local ones are auto-detected when they're running.
- A **model dropdown** filled from the server, plus a **Test** button with a green check or a plain-English error ("LM Studio is running but no model is loaded").
- A **context size check**. Ollama's default context is very small unless it's raised, and LM Studio sets context at model load. Either one can quietly cause the "4k context" problem. The app reads the real context size where the server reports it, sends Ollama's `num_ctx` itself, and warns when the loaded size is small, with a one-line fix.

## Model "jobs"

Each AI task is a separate job. **By default all jobs use the one selected model.** Under *Advanced → Models*, each job can get its own model.

| Job | What it does | Output |
|---|---|---|
| **Narrator** | Writes the story response | Prose + dialogue (streamed) |
| **Referee** | Reads the player's action and decides whether a roll is needed, which skill, how hard | Structured JSON |
| **Scribe** | After each turn, extracts facts: new characters and places, relationship changes, time passed, items, rest/sleep, scene tags | Structured JSON |
| **Suggester** | Proposes 3 things the player could do or say | Structured JSON |
| **Summarizer** | Compresses old chapters into the memory timeline | Prose + JSON |
| **Vision** | Describes an uploaded image when the main model can't see images | Text (*built 0.14.0*: portraits and pictures shown in the story, always in words) |

Splitting the jobs means each prompt is small and focused, which is much easier for weak models than one huge "do everything" prompt. A strong model can run the Referee and Scribe in one combined call to save time (a capability-profile setting).

## Structured output and fallbacks

Local models vary a lot in how well they follow formats. The `ai/protocol/` module tries these methods in order, using the best one the model supports:

1. **Schema-constrained output.** The server is forced to produce valid JSON matching a schema. LM Studio, llama.cpp, and Ollama support this via `response_format` / JSON schema. This is the most reliable.
2. **Tool / function calling**, for models that support it well (Claude, most cloud models).
3. **Plain prompt + tolerant parser.** Ask for JSON in a code block, parse loosely, and if it fails send one automatic "fix this JSON" retry. If that fails too, fall back to safe defaults (e.g. "no roll needed").

All schemas are defined once with Zod and reused for validation, prompts and constrained output.

*Built:* Claude uses structured outputs (`output_config.format`), which compiles each schema into a grammar with a size limit. The Scribe's schema is the biggest and sits near it: shapes used more than once are shared (one `ItemQty` for every item list) so they compile once, and new Scribe fields should be weighed against the limit. If a schema is ever refused as too large, the provider asks for plain JSON matching the schema instead (checked with the tolerant parser) and remembers that for the job, so a growing schema slows down rather than breaks (0.18.0).

## Capability profile

When a model is connected, the app runs a quick probe (a few seconds) and saves a profile per model:
- Supports JSON schema? Tool calls? Images (vision)? Logit bias?
- Context length, approximate speed.
- Is it a "thinking" model? Thinking text is hidden behind a collapsible "DM is thinking…" animation.

The profile decides which fallbacks to use. It can be re-run or edited in Advanced.

## Token banning / name bias

Logit bias (making specific tokens less likely) is supported by llama.cpp-based servers but **not by Ollama or Anthropic**. So name banning is handled mainly by the engine (see [06-ai-dm.md](06-ai-dm.md#names-and-banned-words)); where logit bias does work, it's used as an extra layer.

## Sampler settings

Hidden under *Advanced → Generation*: temperature, top-p, min-p, repetition penalty, max length, and stop sequences. Ships with sensible presets ("Balanced", "Creative", "Precise") so the artist never has to touch the sliders.
