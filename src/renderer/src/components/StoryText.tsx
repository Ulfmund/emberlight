import { Fragment } from 'react'

/**
 * Renders DM prose: narration paragraphs, `@Name: "…"` dialogue lines as portrait bubbles,
 * and light inline formatting (*italic*, **bold**, "speech"). While streaming, each new word
 * fades in; finished text renders plainly.
 */

type Block = { kind: 'para'; text: string } | { kind: 'dialogue'; speaker: string; text: string }

const DIALOGUE = /^@([^:\n]{1,40}):\s*(.*)$/

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  const flushPara = () => {
    if (para.length) blocks.push({ kind: 'para', text: para.join(' ') })
    para = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      continue
    }
    const m = DIALOGUE.exec(line)
    if (m) {
      flushPara()
      blocks.push({ kind: 'dialogue', speaker: m[1].trim(), text: m[2] })
    } else {
      para.push(line)
    }
  }
  flushPara()
  return blocks
}

export function StoryText({ text, animate }: { text: string; animate: boolean }) {
  const blocks = parseBlocks(text)
  return (
    <div className="story selectable space-y-4">
      {blocks.map((b, i) =>
        b.kind === 'para' ? (
          <p key={i}>
            <Inline text={b.text} animate={animate} k={`${i}`} />
          </p>
        ) : (
          <Dialogue key={i} speaker={b.speaker}>
            <Inline text={b.text} animate={animate} k={`${i}`} />
          </Dialogue>
        )
      )}
    </div>
  )
}

const PALETTE = ['#e8b54d', '#d9574c', '#8fbf73', '#9fb3ff', '#c792ea', '#ff9a52', '#6fc8c0', '#e8a0bf']
export function speakerColor(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

function Dialogue({ speaker, children }: { speaker: string; children: React.ReactNode }) {
  const color = speakerColor(speaker)
  const initials = speaker
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div className="flex items-start gap-3">
      <div
        className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 font-display text-sm font-bold text-ink-950 shadow-[0_4px_14px_-4px_rgb(0_0_0/0.8)]"
        style={{
          borderColor: color,
          background: `radial-gradient(circle at 35% 30%, ${color}, color-mix(in oklab, ${color} 40%, #120d10))`
        }}
        title={speaker}
      >
        {initials}
      </div>
      <div className="min-w-0">
        <div className="mb-1 font-display text-[0.78rem] tracking-[0.12em]" style={{ color }}>
          {speaker.toUpperCase()}
        </div>
        <div
          className="relative rounded-2xl rounded-tl-sm border bg-ink-800/80 px-4 py-2.5"
          style={{ borderColor: `color-mix(in oklab, ${color} 35%, transparent)` }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

type Run = { text: string; bold: boolean; italic: boolean; quote: boolean }

/** Splits text into runs, tracking **bold**, *italic* and "speech" so they can nest. */
function toRuns(text: string): Run[] {
  const runs: Run[] = []
  let bold = false
  let italic = false
  let quote = false
  let buf = ''
  const push = () => {
    if (buf) runs.push({ text: buf, bold, italic, quote })
    buf = ''
  }
  for (const tok of text.split(/(\*\*|\*|"|“|”)/g)) {
    if (!tok) continue
    if (tok === '**') {
      push()
      bold = !bold
    } else if (tok === '*') {
      push()
      italic = !italic
    } else if (tok === '"' || tok === '“' || tok === '”') {
      // Quote marks stay visible and belong to the speech they wrap.
      if (!quote) {
        push()
        quote = true
        buf = tok
      } else {
        buf += tok
        push()
        quote = false
      }
    } else {
      buf += tok
    }
  }
  push()
  return runs
}

/** *italic*, **bold** and "speech", with optional per-word fade-in. */
function Inline({ text, animate, k }: { text: string; animate: boolean; k: string }) {
  let w = 0
  return (
    <>
      {toRuns(text).map((run, pi) => {
        const cls = [
          run.bold && 'font-semibold text-gold-200',
          run.italic && 'italic',
          (run.italic || run.quote) && !run.bold && 'text-parchment-50'
        ]
          .filter(Boolean)
          .join(' ')
        const words = run.text.split(/(\s+)/)
        return (
          <span key={pi} className={cls}>
            {words.map((word, wi) => {
              if (!word) return null
              if (/^\s+$/.test(word)) return <Fragment key={wi}>{word}</Fragment>
              const key = `${k}-${w++}`
              return animate ? (
                <span key={key} className="animate-word-in inline-block whitespace-pre">
                  {word}
                </span>
              ) : (
                <Fragment key={key}>{word}</Fragment>
              )
            })}
          </span>
        )
      })}
    </>
  )
}

/** The player's own turn: speech in quotes stands out, actions are italic, ((OOC)) is a pill. */
export function PlayerText({ text }: { text: string }) {
  const parts = text.split(/(\(\([\s\S]*?\)\)|"[^"]*"|“[^”]*”)/g).filter(Boolean)
  return (
    <div className="story selectable text-[1.12rem]">
      {parts.map((p, i) =>
        p.startsWith('((') ? (
          <span
            key={i}
            className="mx-0.5 inline-block rounded-md border border-arcane-400/30 bg-arcane-400/10 px-2 py-px font-ui text-[0.8rem] text-arcane-400 not-italic"
          >
            OOC · {p.slice(2, -2).trim()}
          </span>
        ) : /^["“]/.test(p) ? (
          <span key={i} className="font-semibold text-gold-200">
            {p}
          </span>
        ) : (
          <span key={i} className="text-parchment-300 italic">
            {p}
          </span>
        )
      )}
    </div>
  )
}
