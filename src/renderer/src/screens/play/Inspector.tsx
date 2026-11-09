import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { PromptReport } from '@shared/inspect'
import { Icon } from '../../components/Icon'

/** Colours for the budget bar, one per block, then the story. */
const COLORS = ['#e8b54d', '#c792ea', '#8fbf73', '#9fb3ff', '#e8a0bf', '#ff9a52', '#6fc8c0', '#d9574c', '#b9a98a', '#f0c063']

/**
 * What the DM was sent for its latest reply (docs/spec/07-memory-and-lore.md#prompt-assembly).
 * For "why did the DM forget X?": if X isn't in here, the DM never saw it.
 */
export function Inspector({ campaignId, open, onClose }: { campaignId: string; open: boolean; onClose: () => void }) {
  const [report, setReport] = useState<PromptReport | null>(null)
  const [error, setError] = useState('')
  const [shown, setShown] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReport(null)
    setError('')
    fetch(`/api/campaigns/${campaignId}/prompt`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error ?? 'Could not load it.')
        setReport(body as PromptReport)
      })
      .catch((e: Error) => setError(e.message))
  }, [open, campaignId])

  const parts = report ? [...report.blocks.map((b) => ({ title: b.title, tokens: b.tokens })), { title: `The story (${report.history.sent} of ${report.history.total} messages)`, tokens: report.history.tokens }] : []
  const room = report ? Math.max(report.contextTokens, report.totalTokens) : 1

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-0 z-40 grid place-items-center bg-ink-950/75 backdrop-blur-sm md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div role="dialog" aria-label="What the DM saw" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} className="panel relative flex h-full w-full max-w-3xl flex-col overflow-hidden md:h-[min(86vh,50rem)] md:rounded-2xl">
            <div className="flex items-start gap-3 border-b border-gold-500/15 px-5 py-4">
              <Icon name="eye" size={22} className="mt-1 shrink-0 text-gold-300" />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-xl tracking-wider text-gold-300">What the DM Saw</h2>
                <p className="text-xs text-parchment-400">Everything sent to the model for its latest reply. If something isn't in here, the DM didn't know it.</p>
              </div>
              <button onClick={onClose} className="no-drag cursor-pointer rounded-lg p-2 text-parchment-400 hover:bg-white/5 hover:text-gold-200" aria-label="Close">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {error && <p className="mt-6 text-center font-story text-lg text-parchment-400 italic">{error}</p>}
              {!report && !error && <p className="mt-6 text-center text-parchment-400">Loading…</p>}
              {report && (
                <>
                  <div className="mb-1 flex justify-between text-xs text-parchment-400">
                    <span>
                      {report.model} · about {report.totalTokens.toLocaleString()} of {report.contextTokens.toLocaleString()} tokens
                    </span>
                    <span>{Math.round((report.totalTokens / report.contextTokens) * 100)}% full</span>
                  </div>
                  <div className="mb-5 flex h-3 w-full overflow-hidden rounded-full bg-ink-900 ring-1 ring-white/5">
                    {parts.map((p, i) => (
                      <div key={p.title} title={`${p.title}: ~${p.tokens} tokens`} style={{ width: `${(p.tokens / room) * 100}%`, background: COLORS[i % COLORS.length] }} />
                    ))}
                  </div>
                  <div className="space-y-2">
                    {report.blocks.map((b, i) => (
                      <Block key={b.title} color={COLORS[i % COLORS.length]} title={b.title} tokens={b.tokens} open={shown === b.title} onToggle={() => setShown(shown === b.title ? null : b.title)}>
                        <pre className="font-sans text-[0.82rem] leading-relaxed whitespace-pre-wrap text-parchment-200">{b.text}</pre>
                      </Block>
                    ))}
                    <Block
                      color={COLORS[report.blocks.length % COLORS.length]}
                      title={`The story, word for word: ${report.history.sent} of ${report.history.total} messages`}
                      tokens={report.history.tokens}
                      open={shown === '__story'}
                      onToggle={() => setShown(shown === '__story' ? null : '__story')}
                    >
                      {report.history.sent < report.history.total && (
                        <p className="mb-3 text-xs text-parchment-400">The oldest {report.history.total - report.history.sent} messages didn't fit; the summaries in "The story so far" stand in for them.</p>
                      )}
                      <div className="space-y-3">
                        {report.history.messages.map((m, i) => (
                          <div key={i} className={`rounded-lg px-3 py-2 text-[0.82rem] whitespace-pre-wrap ${m.role === 'user' ? 'bg-gold-500/10 text-parchment-100' : 'bg-ink-900/70 text-parchment-300'}`}>
                            <span className="mb-1 block text-[0.65rem] font-semibold tracking-[0.14em] text-gold-400 uppercase">{m.role === 'user' ? 'Player (and the game engine)' : 'DM'}</span>
                            {m.text}
                          </div>
                        ))}
                      </div>
                    </Block>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Block({ color, title, tokens, open, onToggle, children }: { color: string; title: string; tokens: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gold-500/15 bg-ink-850/80">
      <button onClick={onToggle} className="no-drag flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate text-sm text-parchment-100">{title}</span>
        <span className="shrink-0 text-xs text-parchment-500 tabular-nums">~{tokens.toLocaleString()} tokens</span>
        <Icon name="chevron" size={14} className={`shrink-0 text-parchment-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-gold-500/10 px-4 py-3">{children}</div>}
    </div>
  )
}
