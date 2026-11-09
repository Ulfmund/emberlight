import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ageLabel, dateLabel, practiced, project, SKILL_IDS, SKILLS, skillLevelFromXp, SKIP_SPANS, skipEvents, skipText, spanLabel, weeklyPay, type SkillId, type SkipPlan } from '@shared/rules'
import { coinText } from './Life'
import type { CampaignView } from '@shared/view'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'

/**
 * Letting time pass (docs/spec/04-rules-system.md#time-skips): how long, what the character does
 * with it and what they practise, with a look at where it leaves them. The DM tells it as a
 * montage; a rewind takes it back like any other turn.
 */
export function SkipDialog({ view, open, onClose, onSkip }: { view: CampaignView; open: boolean; onClose: () => void; onSkip: (text: string, plan: SkipPlan) => void }) {
  const [days, setDays] = useState<number>(SKIP_SPANS[3].days)
  const [doing, setDoing] = useState('')
  const [practise, setPractise] = useState<[SkillId | '', SkillId | '']>(['', ''])
  const job = view.state.job ?? null
  const [working, setWorking] = useState(true)
  const close = useRef(onClose)
  close.current = onClose
  // With work, the time goes on it by default, and so does the practice.
  useEffect(() => {
    if (open && job) setPractise((p) => (p[0] || p[1] ? p : [job.skill, '']))
  }, [open, job])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const chosen = [...new Set(practise.filter(Boolean))] as SkillId[]
  const key = chosen.join(',')
  const atWork = Boolean(job && working)
  const preview = useMemo(() => {
    const plan = { days, doing: '', practise: key ? (key.split(',') as SkillId[]) : [], working: atWork }
    const after = project(view.state, skipEvents(view.state, view.settings, plan), view.settings)
    return { after, grown: practiced(view.state, after, plan.practise), money: after.character.coins - view.state.character.coins }
  }, [view.state, view.settings, days, key, atWork])
  const skills = useMemo(
    () =>
      SKILL_IDS.map((s) => ({ id: s, label: SKILLS[s].label, level: skillLevelFromXp(view.state.character.skillXp[s] ?? 0) })).sort((a, b) => b.level - a.level || a.label.localeCompare(b.label)),
    [view.state.character.skillXp]
  )
  const name = view.build.name
  const span = spanLabel(days)
  const submit = () => {
    const plan: SkipPlan = { days, doing: doing.trim() || (atWork && job ? `I work as ${job.title} in ${job.place}.` : ''), practise: chosen, working: atWork }
    onSkip(skipText(plan), plan)
    onClose()
    setDoing('')
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 backdrop-blur-sm md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-label="Let time pass"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="panel flex h-full w-full max-w-lg flex-col overflow-hidden rounded-none md:h-auto md:max-h-[88vh] md:rounded-2xl"
          >
            <div className="flex items-center gap-3 border-b border-gold-500/15 px-5 py-4">
              <Icon name="hourglass" size={20} className="text-gold-300" />
              <h3 className="flex-1 font-display text-xl tracking-wider text-gold-300">Let time pass</h3>
              <button onClick={onClose} className="no-drag cursor-pointer rounded-md p-1.5 text-parchment-400 hover:text-gold-200" aria-label="Close">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <p className="text-sm text-parchment-400">Skip ahead: the DM tells the time that goes by in a few paragraphs, and the story picks up after it. {name} grows older, and comes out of it rested and healed.</p>
              <div>
                <div className="mb-2 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">How long</div>
                <div className="flex flex-wrap gap-1.5">
                  {SKIP_SPANS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setDays(s.days)}
                      aria-pressed={days === s.days}
                      className={`no-drag cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors touch:px-3.5 touch:py-1.5 ${days === s.days ? 'border-gold-400/70 bg-gold-500/20 text-gold-200' : 'border-white/10 text-parchment-300 hover:border-gold-500/40'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">What {name} does with it</span>
                <textarea
                  value={doing}
                  onChange={(e) => setDoing(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="e.g. I settle in Millbrook and work at the forge. (Leave it empty and the DM decides.)"
                  className="input resize-y py-2 text-sm"
                />
              </label>
              {job && (
                <label className="flex items-center gap-2 text-sm text-parchment-300">
                  <input type="checkbox" checked={working} onChange={(e) => setWorking(e.target.checked)} className="accent-[var(--color-gold-400)]" />
                  At work as {job.title} (about {coinText(weeklyPay(view.state, job))} a week)
                </label>
              )}
              <div>
                <div className="mb-2 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Practise (up to two skills)</div>
                <div className="flex flex-wrap gap-2">
                  {[0, 1].map((i) => (
                    <span key={i} className="w-48">
                      <select
                        value={practise[i]}
                        onChange={(e) => setPractise((p) => (i === 0 ? [e.target.value as SkillId | '', p[1]] : [p[0], e.target.value as SkillId | '']))}
                        className="input py-1.5 text-sm"
                        aria-label={i === 0 ? 'A skill to practise' : 'Another skill to practise'}
                      >
                        <option value="">{i === 0 ? 'No skill' : 'No other skill'}</option>
                        {skills.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label} ({s.level})
                          </option>
                        ))}
                      </select>
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-gold-500/15 bg-ink-850/70 p-3 text-sm text-parchment-300">
                <div className="mb-1 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Afterwards</div>
                <div>
                  {name} will be {ageLabel(preview.after)} · {dateLabel(preview.after.time.day)}
                </div>
                {atWork && (
                  <div className={`mt-1 ${preview.money >= 0 ? 'text-gold-200' : 'text-blood-400'}`}>
                    {preview.money > 0 ? `${coinText(preview.money)} put by` : preview.money < 0 ? `${coinText(-preview.money)} less: the pay doesn't cover living` : 'The pay just covers living'}
                  </div>
                )}
                {preview.grown.length > 0 && (
                  <div className="mt-1 text-gold-200">
                    {preview.grown.map((g) => `${SKILLS[g.skill].label} ${g.from} → ${g.to}`).join(' · ')}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gold-500/15 px-5 py-3">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" icon="hourglass" onClick={submit}>
                Let {span} pass
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
