import { sameName } from './memory'

/**
 * Speech lines (docs/spec/06-ai-dm.md#speech-lines). The DM puts each non-player character's words
 * on a line of their own, `@Name: "…"`, and the app shows it as a speech bubble with their
 * portrait. Models sometimes slip a tag into the middle of a sentence or a quotation
 * (`He shakes his head. "@Branmund: "And don't…`), wrap it in bold, or tag the player character,
 * often the one being spoken to. This puts that right:
 *
 * - a tag at the start of a line stays (tidied of bold or a stray quote mark);
 * - a tag that starts a new speaker's words after a finished sentence starts a new line;
 * - any other tag where a sentence starts is taken out, so the words read as plain story;
 * - a tag with the player character's name never makes a speech line (the DM never speaks for them);
 * - in the middle of a sentence ("turns to @Old Tam"), it's a mention: it loses its @.
 */

/** The start of a speech line, as the story view reads it. */
export const SPEECH_LINE = /^@([^:\n]{1,40}):\s*(.*)$/

const WORD = String.raw`[\p{L}\p{M}'’.\-]+`
/** A speaker's name inside a line: a word or a few ("Old Tam", "Sister Wenna Reed"). */
const NAME = String.raw`\p{L}[\p{L}\p{M}'’.\-]*(?: ${WORD}){0,3}`
const EMPH = String.raw`(?:\*\*|\*|__|_)`
const OPEN = '["“]'

const WRAPPED = new RegExp(String.raw`^${EMPH}\s*@(${NAME})\s*(?:${EMPH}\s*:|:\s*${EMPH})\s*`, 'u')
const QUOTED_START = new RegExp(String.raw`^(${OPEN})\s*@(${NAME})\s*:\s*(${OPEN})?\s*`, 'u')
const START = /^@([^:\n]{1,40}):\s*/
/** A tag just inside an opening quote mark. */
const IN_QUOTE = new RegExp(String.raw`(^|[\s(\[—–])(${OPEN})@(?:${NAME})\s*:\s*(?:${OPEN})?\s*`, 'gu')
/** A tag after a finished sentence (or a closing quote mark), with quoted words after it. */
const NEW_SPEAKER = new RegExp(String.raw`([.!?…"”*)]\s+|[.!?…,]["”])@(${NAME})\s*:\s*(?=${OPEN})`, 'gu')
/** Any other tag where a sentence starts: taken out. */
const LOOSE = new RegExp(String.raw`([.!?…"”*)])\s+@(?:${NAME})\s*:\s*`, 'gu')
/** Mid-sentence ("turns to @Old Tam: …"), it's a mention: the name stays. */
const MENTION = /(^|[\s"“(])@(?=\p{L})/gu

function tidyLine(raw: string, isPlayer: (name: string) => boolean): string {
  const lead = /^\s*/.exec(raw)![0]
  let line = raw
    .slice(lead.length)
    .replace(WRAPPED, (_, name: string) => `@${name}: `)
    .replace(QUOTED_START, (_, q1: string, name: string, q2?: string) => `@${name}: ${q2 ?? q1}`)
  let head = ''
  const start = START.exec(line)
  if (start) {
    if (!isPlayer(start[1].trim())) head = `@${start[1].trim()}: `
    line = line.slice(start[0].length)
  }
  line = line.replace(IN_QUOTE, '$1$2')
  // Someone new speaks after a finished sentence: the DM forgot to start a new line.
  let next = ''
  for (const m of line.matchAll(NEW_SPEAKER)) {
    if (isPlayer(m[2])) continue
    const cut = (m.index ?? 0) + m[1].length
    next = `\n${tidyLine(line.slice(cut), isPlayer)}`
    line = line.slice(0, cut).trimEnd()
    break
  }
  line = line.replace(LOOSE, '$1 ').replace(MENTION, '$1').replace(/ {2,}/g, ' ')
  return `${lead}${head}${line}${next}`
}

/** The DM's reply with its speech tags put right. `player` is the player character's name. */
export function tidySpeech(text: string, player?: string): string {
  if (!text.includes('@')) return text
  const me = player?.trim()
  const isPlayer = (name: string) => Boolean(me) && sameName(name, me!)
  return text
    .split('\n')
    .map((line) => (line.includes('@') ? tidyLine(line, isPlayer) : line))
    .join('\n')
}
