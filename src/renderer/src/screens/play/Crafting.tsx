import { useState } from 'react'
import { canMake, countOf, itemTemplate, nameOf, recipeAction, RECIPES, SKILLS, skillLevelFromXp } from '@shared/rules'
import type { CampaignView } from '@shared/view'
import { useGame } from '../../store'
import { Icon } from '../../components/Icon'
import { Tip } from '../../components/Tip'
import { Button } from '../../components/Button'

/**
 * The Bag's "Make" list (docs/spec/04-rules-system.md#items-equipment-money): recipes the
 * character can make now, has materials for, or has the training for. "Make" plays a turn.
 */
export function CraftList({ view }: { view: CampaignView }) {
  const { act, busy, live } = useGame()
  const [all, setAll] = useState(false)
  const st = view.state
  const c = st.character
  const off = busy || live.hold || Boolean(st.combat) || c.status !== 'alive'
  const rows = RECIPES.map((rc) => ({
    rc,
    can: canMake(st, rc),
    trained: skillLevelFromXp(c.skillXp[rc.skill] ?? 0) >= Math.max(2, rc.minLevel),
    started: rc.inputs.some((x) => countOf(st, x.item) > 0)
  }))
  const relevant = rows.filter((r) => r.can.ok || r.started || r.trained)
  const shown = (all ? rows : relevant).sort((a, b) => Number(b.can.ok) - Number(a.can.ok) || a.rc.skill.localeCompare(b.rc.skill) || a.rc.minLevel - b.rc.minLevel)
  const ready = rows.filter((r) => r.can.ok).length

  return (
    <section>
      <h3 className="mb-2 flex items-center justify-between text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">
        Make
        {ready > 0 && <span className="font-normal tracking-normal text-moss-400 normal-case">{ready} ready</span>}
      </h3>
      {shown.length === 0 && <p className="text-sm text-parchment-500 italic">Nothing to make yet. Gather materials first, and recipes for them show up here.</p>}
      <div className="space-y-1">
        {shown.map(({ rc, can }) => {
          const tpl = itemTemplate(rc.output)
          return (
            <div key={rc.id} className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${can.ok ? 'border-gold-500/25 bg-ink-850' : 'border-gold-500/10 bg-ink-850/50'}`}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border border-gold-500/25 bg-ink-800 ${can.ok ? 'text-gold-300' : 'text-parchment-500'}`}>
                <Icon name={tpl?.icon ?? 'hammer'} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-sm leading-tight ${can.ok ? 'text-parchment-100' : 'text-parchment-300'}`}>
                  {nameOf(rc.output)}
                  {rc.qty > 1 && <span className="ml-1 text-xs text-gold-300">×{rc.qty}</span>}
                </div>
                <div className="mt-0.5 text-[0.7rem] leading-snug text-parchment-400">
                  {rc.inputs.map((x, i) => {
                    const have = countOf(st, x.item)
                    return (
                      <span key={x.item} className={have >= x.qty ? '' : 'text-blood-400'}>
                        {i ? ', ' : ''}
                        {x.qty} {nameOf(x.item).toLowerCase()}
                        {have < x.qty ? ` (have ${have})` : ''}
                      </span>
                    )
                  })}
                  <span className="text-parchment-500">
                    {' '}
                    · {SKILLS[rc.skill].label} {rc.minLevel}
                    {rc.station ? ` · at a ${rc.station}` : ''}
                  </span>
                </div>
              </div>
              <Tip content={can.ok ? `"${recipeAction(rc)}"` : can.why} side="left">
                <Button size="sm" variant="secondary" disabled={!can.ok || off} onClick={() => void act(recipeAction(rc), { work: { kind: 'craft', what: rc.id } })}>
                  Make
                </Button>
              </Tip>
            </div>
          )
        })}
      </div>
      <button onClick={() => setAll(!all)} className="no-drag mt-2 cursor-pointer text-xs text-gold-300 hover:text-gold-200">
        {all ? 'Show only what you can work on' : `Show all ${RECIPES.length} recipes`}
      </button>
      <p className="mt-2 text-xs text-parchment-500">To gather, say so in the story: "I chop some firewood", "I fish the river", "I look for healing herbs".</p>
    </section>
  )
}
