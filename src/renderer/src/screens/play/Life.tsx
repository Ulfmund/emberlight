import { useMemo, useState } from 'react'
import { atHome, HOME_KINDS, HOMES, jobLevel, livingPerDay, SELL_SHARE, SETTLED, SKILL_IDS, SKILLS, skillLevelFromXp, skipText, weeklyPay, type HomeKind, type SkillId, type SkipPlan } from '@shared/rules'
import type { CampaignView } from '@shared/view'
import { api } from '../../api'
import { useGame } from '../../store'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'

/** "20 gold, 5 silver" */
export const coinText = (copper: number) => {
  const g = Math.floor(copper / 100)
  const s = Math.floor((copper % 100) / 10)
  const c = copper % 10
  return [g && `${g} gold`, s && `${s} silver`, c && `${c} copper`].filter(Boolean).join(', ') || '0 copper'
}

/** Days of work the Sheet offers at once (each is a short time-skip, told by the DM). */
const STINTS = [
  { days: 1, label: 'A day' },
  { days: 7, label: 'A week' },
  { days: 90, label: 'A season' }
]

/**
 * The Sheet's home and work (docs/spec/04-rules-system.md#homes-and-work): rent or buy where
 * you are, take up work there, and spend days at it. Chosen here, so the story never misreads it.
 */
export function LifeSection({ view }: { view: CampaignView }) {
  const st = view.state
  const turnBusy = useGame((s) => s.busy)
  const act = useGame((s) => s.act)
  const [busy, setBusy] = useState(false)
  const [taking, setTaking] = useState(false)
  const skills = useMemo(
    () => SKILL_IDS.map((s) => ({ id: s, label: SKILLS[s].label, level: skillLevelFromXp(st.character.skillXp[s] ?? 0) })).sort((a, b) => b.level - a.level || a.label.localeCompare(b.label)),
    [st.character.skillXp]
  )
  const [title, setTitle] = useState('')
  const [skill, setSkill] = useState<SkillId>(skills[0]?.id ?? 'crafting')
  const [board, setBoard] = useState(false)

  const change = async (a: Parameters<typeof api.life>[1]) => {
    setBusy(true)
    try {
      useGame.setState({ view: await api.life(view.id, a) })
      return true
    } catch (err) {
      useGame.getState().toast({ title: "That didn't work", text: (err as Error).message, tone: 'bad', icon: 'warn' })
      return false
    } finally {
      setBusy(false)
    }
  }
  const work = (days: number) => {
    const job = st.job!
    const plan: SkipPlan = { days, doing: `I work as ${job.title} in ${job.place}.`, practise: [job.skill], working: true }
    void act(skipText(plan), { skip: plan })
  }

  const free = !st.combat && st.character.status === 'alive' && !turnBusy && !busy
  const place = st.location
  const settled = Boolean(place) && (!st.placeKind || SETTLED.includes(st.placeKind))
  const home = st.home
  const job = st.job
  const resale = home && home.kind !== 'room' ? Math.round(HOMES[home.kind].price * SELL_SHARE) : 0
  const coins = st.character.coins

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">
        <Icon name="candle" size={14} />
        Home and work
      </h3>
      <div className="space-y-2">
        <div className="rounded-xl border border-gold-500/15 bg-ink-850/70 p-3 text-sm">
          {home ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display tracking-wide text-parchment-50">
                  {HOMES[home.kind].label} in {home.place}
                </span>
                <span className="shrink-0 text-xs text-parchment-500">{home.kind === 'room' ? 'rented' : 'yours'}</span>
              </div>
              <p className="mt-1 text-xs text-parchment-400">
                {atHome(st) ? "You're home: a night's sleep here mends you fully, and nothing disturbs it." : `A night's sleep at home mends you fully.`} Living costs {coinText(livingPerDay(st))} a day.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" disabled={!free} onClick={() => void change({ leaveHome: true })}>
                  {home.kind === 'room' ? 'Give up the room' : `Sell it (${coinText(resale)})`}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-parchment-400">No home of your own: inns and the road cost {coinText(livingPerDay(st))} a day while you work.</p>
          )}
          {settled ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {HOME_KINDS.filter((k) => !(home?.kind === k && home.place === place)).map((k: HomeKind) => {
                const h = HOMES[k]
                const short = h.price > coins + resale
                return (
                  <button
                    key={k}
                    disabled={!free || short}
                    onClick={() => void change({ home: k })}
                    title={h.blurb}
                    className="no-drag cursor-pointer rounded-full border border-white/10 px-2.5 py-1 text-xs text-parchment-300 transition-colors hover:border-gold-500/40 disabled:cursor-not-allowed disabled:opacity-40 touch:px-3 touch:py-1.5 touch:text-sm"
                  >
                    {k === 'room' ? 'Rent a room here' : `${h.label.replace(/^A /, 'Buy a ')} · ${coinText(h.price)}`}
                  </button>
                )
              })}
            </div>
          ) : (
            !home && <p className="mt-2 text-xs text-parchment-500">Find a town or village to settle in.</p>
          )}
        </div>

        <div className="rounded-xl border border-gold-500/15 bg-ink-850/70 p-3 text-sm">
          {job ? (
            <>
              <div className="font-display tracking-wide text-parchment-50">
                {job.title.charAt(0).toUpperCase() + job.title.slice(1)}, {job.place}
              </div>
              <p className="mt-1 text-xs text-parchment-400">
                {SKILLS[job.skill].label} {jobLevel(st, job)} · about {coinText(weeklyPay(st, job))} a week{job.board ? ', with room and board' : ''}. The pay grows with the skill.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-parchment-500">Work:</span>
                {STINTS.map((s) => (
                  <Button key={s.days} size="sm" variant="secondary" icon="hourglass" disabled={!free} onClick={() => work(s.days)}>
                    {s.label}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" disabled={!free} onClick={() => void change({ quitJob: true })}>
                  Leave it
                </Button>
              </div>
            </>
          ) : taking ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                void change({ job: { title, skill, board } }).then((ok) => ok && (setTaking(false), setTitle('')))
              }}
            >
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="What work? e.g. smith's hand, caravan guard" className="input py-1.5 text-sm" aria-label="What work" autoFocus />
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-44">
                  <select value={skill} onChange={(e) => setSkill(e.target.value as SkillId)} className="input py-1.5 text-sm" aria-label="The skill it uses">
                    {skills.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} ({s.level})
                      </option>
                    ))}
                  </select>
                </span>
                <label className="flex items-center gap-1.5 text-xs text-parchment-300">
                  <input type="checkbox" checked={board} onChange={(e) => setBoard(e.target.checked)} className="accent-[var(--color-gold-400)]" />
                  With room and board (half the pay)
                </label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" type="submit" disabled={!free || !title.trim()}>
                  Take it up
                </Button>
                <Button size="sm" variant="ghost" type="button" onClick={() => setTaking(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className="text-xs text-parchment-400">No work yet. Take up work where you are: it pays by the day, more as its skill grows, and it's where the time goes when you let it pass.</p>
              <div className="mt-2">
                <Button size="sm" variant="secondary" icon="hammer" disabled={!free || !place} onClick={() => setTaking(true)}>
                  Take up work here…
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
