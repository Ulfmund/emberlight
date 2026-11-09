import { useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DIFFICULTY_LABEL, SKILLS, TIER_INFO, type CheckResult, type Tier } from '@shared/rules'
import type { CampaignView, MessageView } from '@shared/view'
import { useGame } from '../../store'
import { StoryText, PlayerText } from '../../components/StoryText'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { Tip } from '../../components/Tip'

export const TIER_STYLE: Record<Tier, { color: string; glow?: string }> = {
  crit_success: { color: '#f5d27a', glow: '0 0 24px rgb(245 210 122 / 0.6)' },
  overwhelming: { color: '#a8e08a' },
  clean_success: { color: '#8fbf73' },
  narrow_success: { color: '#c4d9a0' },
  narrow_failure: { color: '#e8b54d' },
  failure: { color: '#d9574c' },
  severe_failure: { color: '#b3322a' },
  crit_failure: { color: '#ff5a4a', glow: '0 0 24px rgb(255 70 50 / 0.5)' }
}

/** Hides a half-written [[ROLL: …]] tag while text streams. */
const stripTag = (s: string) => s.replace(/\[\[[\s\S]*$/, '').trimEnd()

export function Story({ view, onInspect }: { view: CampaignView; onInspect?: () => void }) {
  const { live, busy, regenerate, swipe, rewind, answer, reroll } = useGame()
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const onScroll = () => {
    const el = scroller.current!
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
  }
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [view.messages, live.text, live.dice.length])

  const msgs = view.messages
  const lastDm = [...msgs].reverse().find((m) => m.role === 'assistant')
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
  const showLive = busy && live.messageId && !msgs.some((m) => m.id === live.messageId)
  const dead = view.state.character.status === 'dead'
  const canUndo = !view.settings.ironman

  return (
    <div ref={scroller} onScroll={onScroll} className="relative z-10 min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pt-5 pb-8 md:px-6 md:pt-10 md:pb-10">
        <div className="mb-8 flex items-center gap-4">
          <div className="gilt-rule flex-1" />
          <span className="font-display text-xs tracking-[0.3em] text-gold-500">{view.name.toUpperCase()}</span>
          <div className="gilt-rule flex-1" />
        </div>

        <div className="space-y-7">
          {msgs.map((m, i) => {
            const isLastDm = m.id === lastDm?.id
            const isLastUser = m.id === lastUser?.id
            if (m.role === 'user') {
              if (m.kind === 'opening') return null
              return (
                <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  {!m.hidden && <PlayerTurn m={m} onUndo={canUndo && !busy && i > 0 ? () => void rewind(msgs[i - 1].id) : undefined} />}
                  {m.checks.length > 0 && (
                    <div className={`mt-3 flex flex-col gap-2 ${m.hidden ? 'items-start' : 'items-end'}`}>
                      {m.checks.map((c) => (
                        <RollCard key={c.id} check={c} pending={live.dice.some((d) => d.id === c.id)} onReroll={isLastUser && !busy && canUndo && !dead ? () => void reroll(c.id) : undefined} />
                      ))}
                    </div>
                  )}
                </motion.div>
              )
            }
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="group">
                <DmTurn m={m} streaming={false} />
                <div className="mt-2 flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                  {m.swipe && (
                    <span className="mr-1 flex items-center gap-0.5 rounded-lg border border-gold-500/20 bg-ink-850/80 px-1 text-xs text-parchment-400">
                      <button disabled={busy || m.swipe.index === 0} onClick={() => void swipe(m.swipe!.ids[m.swipe!.index - 1])} className="no-drag cursor-pointer p-1 hover:text-gold-200 disabled:opacity-30" title="Previous version">
                        <Icon name="left" size={14} />
                      </button>
                      <span className="tabular-nums">
                        {m.swipe.index + 1}/{m.swipe.count}
                      </span>
                      <button disabled={busy || m.swipe.index === m.swipe.count - 1} onClick={() => void swipe(m.swipe!.ids[m.swipe!.index + 1])} className="no-drag cursor-pointer p-1 hover:text-gold-200 disabled:opacity-30" title="Next version">
                        <Icon name="right" size={14} />
                      </button>
                    </span>
                  )}
                  {isLastDm && !busy && !dead && (
                    <Button variant="ghost" size="sm" icon="reroll" onClick={() => void regenerate()} title="Write this response again (the dice stay the same)">
                      Rewrite
                    </Button>
                  )}
                  {isLastDm && !busy && onInspect && (
                    <Button variant="ghost" size="sm" icon="eye" onClick={onInspect} title="See everything the DM was sent for this reply">
                      <span className="hidden sm:inline">What the DM saw</span>
                    </Button>
                  )}
                  {!isLastDm && canUndo && !busy && (
                    <Button variant="ghost" size="sm" icon="rewind" onClick={() => void rewind(m.id)} title="Go back to this moment. Later events are kept as another branch.">
                      Return here
                    </Button>
                  )}
                </div>
                {isLastDm && m.requestCheck && !busy && !dead && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                    <motion.button
                      onClick={() => void answer(m.id)}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.95 }}
                      animate={{ boxShadow: ['0 0 0 rgba(255,150,50,0)', '0 0 34px rgba(255,150,50,0.7)', '0 0 0 rgba(255,150,50,0)'] }}
                      transition={{ boxShadow: { duration: 1.8, repeat: Infinity } }}
                      className="no-drag flex cursor-pointer items-center gap-3 rounded-xl border border-gold-300/70 bg-gradient-to-b from-gold-500/25 to-ink-900 px-5 py-3 text-left"
                    >
                      <Icon name="d20" size={30} className="text-gold-200" />
                      <span>
                        <span className="block font-display tracking-wide text-gold-200">Roll {SKILLS[m.requestCheck.skill].label}</span>
                        <span className="block text-xs text-parchment-400">{m.requestCheck.hidden ? 'The DM asks for a roll…' : m.requestCheck.reason}</span>
                      </span>
                    </motion.button>
                  </motion.div>
                )}
              </motion.div>
            )
          })}

          {showLive && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <DmTurn
                m={{ id: 'live', role: 'assistant', content: live.hold ? '' : stripTag(live.text), thinking: live.thinking, hidden: false, checks: [], changes: [], createdAt: 0, error: live.error ?? undefined }}
                streaming
                held={live.hold}
              />
            </motion.div>
          )}
          {!busy && live.notice && <p className="text-sm text-gold-300 italic">{live.notice}</p>}
          {!busy && live.error && !msgs.some((m) => m.error) && <ErrorLine text={live.error} />}
        </div>
      </div>
    </div>
  )
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-blood-400/40 bg-blood-500/10 px-4 py-3 text-sm text-parchment-100">
      <Icon name="warn" size={18} className="mt-0.5 shrink-0 text-blood-400" />
      {text}
    </div>
  )
}

function PlayerTurn({ m, onUndo }: { m: MessageView; onUndo?: () => void }) {
  return (
    <div className="group flex justify-end">
      <div className="relative max-w-[85%] rounded-2xl rounded-tr-sm border border-gold-500/30 bg-gradient-to-b from-ink-700/80 to-ink-800/80 px-5 py-3 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.8)]">
        <div className="mb-1 flex items-center justify-end gap-2">
          {onUndo && (
            <button onClick={onUndo} className="no-drag cursor-pointer text-[0.68rem] text-parchment-500 opacity-0 touch:opacity-100 transition-opacity group-hover:opacity-100 hover:text-gold-300" title="Take this turn back">
              <Icon name="rewind" size={12} className="mr-1 inline -translate-y-px" />
              undo
            </button>
          )}
          <span className="font-display text-[0.7rem] tracking-[0.2em] text-gold-400">YOU</span>
        </div>
        <PlayerText text={m.content} />
      </div>
    </div>
  )
}

const RUNES = ['ᚠ', 'ᚱ', 'ᛟ', 'ᚨ', 'ᛉ']

function DmTurn({ m, streaming, held }: { m: MessageView; streaming: boolean; held?: boolean }) {
  const waiting = streaming && !m.content
  return (
    <div>
      {(m.thinking || waiting) && <Thinking text={m.thinking} active={waiting} label={held ? 'The dice are rolling…' : undefined} />}
      {m.content && <StoryText text={m.content} animate={streaming} />}
      {streaming && m.content && <span className="ml-1 inline-block h-5 w-[3px] translate-y-1 animate-pulse rounded bg-ember-500 shadow-[0_0_10px_var(--color-ember-500)]" />}
      {m.notice && <p className="mt-3 text-sm text-gold-300 italic">{m.notice}</p>}
      {m.error && (
        <div className="mt-3">
          <ErrorLine text={m.error} />
        </div>
      )}
      {!streaming && m.changes.length > 0 && <Changes changes={m.changes} />}
    </div>
  )
}

function Changes({ changes }: { changes: MessageView['changes'] }) {
  const shown = changes.filter((c) => c.icon !== 'd20')
  if (!shown.length) return null
  const tone = { good: 'border-moss-400/30 text-moss-400', bad: 'border-blood-400/30 text-blood-400', neutral: 'border-gold-500/20 text-parchment-400' }
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((c, i) => (
        <motion.span key={i} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.06 }} className={`flex items-center gap-1 rounded-full border bg-ink-900/70 px-2.5 py-0.5 text-xs ${tone[c.tone]}`}>
          <Icon name={c.icon} size={12} />
          {c.text}
        </motion.span>
      ))}
    </div>
  )
}

function Thinking({ text, active, label }: { text: string; active: boolean; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-4">
      <button onClick={() => text && setOpen((o) => !o)} className={`no-drag flex items-center gap-3 text-sm ${text ? 'cursor-pointer' : 'cursor-default'} text-parchment-400 hover:text-gold-300`}>
        <span className="flex gap-1.5 font-display text-lg text-ember-400">
          {RUNES.map((r, i) => (
            <span key={r} className={active ? 'animate-rune-pulse inline-block' : 'inline-block opacity-40'} style={{ animationDelay: `${i * 0.18}s`, textShadow: active ? '0 0 10px var(--color-ember-500)' : undefined }}>
              {r}
            </span>
          ))}
        </span>
        <span className="italic">{label ?? (active ? 'The Dungeon Master ponders…' : "The DM's reasoning")}</span>
        {text && <Icon name="chevron" size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      <AnimatePresence initial={false}>
        {open && text && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="selectable mt-2 max-h-72 overflow-y-auto border-l-2 border-ember-500/30 pl-4 text-sm leading-relaxed whitespace-pre-wrap text-parchment-400 italic">{text}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function RollCard({ check, pending, onReroll }: { check: CheckResult; pending?: boolean; onReroll?: () => void }) {
  const t = TIER_STYLE[check.tier]
  const info = TIER_INFO[check.tier]
  if (pending) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gold-500/25 bg-ink-850/80 px-3 py-2 text-sm text-parchment-400">
        <Icon name="d20" size={18} className="animate-spin text-gold-400 [animation-duration:2.5s]" />
        {SKILLS[check.skill].label}: the dice are waiting…
      </div>
    )
  }
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="flex items-center gap-3 rounded-xl border bg-ink-850/90 py-1.5 pr-2 pl-1.5"
      style={{ borderColor: `color-mix(in oklab, ${t.color} 40%, transparent)`, boxShadow: t.glow }}
    >
      <Tip
        content={
          <>
            {check.d20s.length > 1 && <div>Rolled {check.d20s.join(' and ')}{check.luck ? ' (lucky reroll)' : ''}, kept {check.kept}</div>}
            {check.breakdown.map((p) => (
              <div key={p.label}>
                {p.label}: {p.value >= 0 ? '+' : '−'}
                {Math.abs(p.value)}
              </div>
            ))}
            <div className="mt-1 text-parchment-400">{info.guide}</div>
          </>
        }
      >
        <span className="grid h-10 w-10 place-items-center rounded-lg font-display text-lg font-bold text-ink-950" style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${t.color} 60%, white), ${t.color})` }}>
          {check.kept}
        </span>
      </Tip>
      <div className="min-w-0">
        <div className="text-sm text-parchment-100">
          {SKILLS[check.skill].label}
          {!check.hidden && <span className="text-parchment-500"> · {check.against ? `vs ${check.against}` : DIFFICULTY_LABEL[check.difficulty]}</span>}
        </div>
        <div className="text-xs text-parchment-400">
          {check.kept} {check.bonus >= 0 ? '+' : '−'} {Math.abs(check.bonus)} = <b className="text-parchment-100">{check.total}</b>
          {!check.hidden && <> vs {check.dc}</>}
          {check.damage > 0 && <span className="ml-2 text-blood-400">−{check.damage} HP</span>}
        </div>
      </div>
      <span className="ml-1 rounded-md px-2 py-1 font-display text-xs tracking-wider" style={{ color: t.color, background: `color-mix(in oklab, ${t.color} 12%, transparent)` }}>
        {info.label.toUpperCase()}
      </span>
      {onReroll && (
        <Tip content="Free reroll: replaces this result and rewrites the DM's response.">
          <motion.button whileTap={{ rotate: -180 }} onClick={onReroll} className="no-drag cursor-pointer rounded-md p-1.5 text-parchment-500 hover:bg-white/5 hover:text-gold-200">
            <Icon name="reroll" size={15} />
          </motion.button>
        </Tip>
      )}
    </motion.div>
  )
}
