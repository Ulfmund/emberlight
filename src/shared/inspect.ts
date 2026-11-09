/**
 * The context inspector (docs/spec/07-memory-and-lore.md#prompt-assembly): what the DM was sent
 * for its last reply, block by block, so "why did the DM forget X?" has an answer.
 */

export type PromptBlock = { title: string; text: string; tokens: number }

export type PromptReport = {
  messageId: string
  at: number
  model: string
  /** The model's whole context, as the app understands it. */
  contextTokens: number
  blocks: PromptBlock[]
  /** The story sent word for word: how many messages of how many, and from where. */
  history: { sent: number; total: number; tokens: number; messages: { role: 'user' | 'assistant'; text: string }[] }
  totalTokens: number
}

/** A rough token count: about 3.5 characters per token for English prose. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.5)

const HEADING = /^([A-Z][A-Z'’ ]{3,}[A-Z])(\s*\(.*\))?\s*$/

/** Splits the DM's instructions at their headings ("THE PLAYER CHARACTER", "WORLD NOTES (…)"…). */
export function promptBlocks(system: string): PromptBlock[] {
  const out: { title: string; lines: string[] }[] = [{ title: 'The DM’s role', lines: [] }]
  for (const line of system.split('\n')) {
    const m = HEADING.exec(line.trim())
    if (m) out.push({ title: titleCase(m[1]), lines: [] })
    else out[out.length - 1].lines.push(line)
  }
  return out
    .map((b) => ({ title: b.title, text: b.lines.join('\n').trim() }))
    .filter((b) => b.text)
    .map((b) => ({ ...b, tokens: estimateTokens(b.text) }))
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()
