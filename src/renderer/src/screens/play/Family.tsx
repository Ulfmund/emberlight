import { useState } from 'react'
import { childrenOf, childStage, spouseOf, yearsOld } from '@shared/family'
import type { CampaignView } from '@shared/view'
import { api } from '../../api'
import { useGame } from '../../store'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'

/**
 * The Sheet's family (docs/spec/04-rules-system.md#family): a wedding to someone from the
 * Journal, and children, who grow up with the calendar and can take up the tale one day.
 */
export function FamilySection({ view }: { view: CampaignView }) {
  const st = view.state
  const turnBusy = useGame((s) => s.busy)
  const [busy, setBusy] = useState(false)
  const [suitor, setSuitor] = useState('')
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [sex, setSex] = useState<'female' | 'male'>('female')
  const spouse = spouseOf(view.memory)
  const living = spouse && spouse.status !== 'dead' ? spouse : undefined
  const lover = view.memory.entities.find((e) => e.kind === 'person' && e.relation === 'lover' && e.status !== 'dead')
  const kids = childrenOf(view.memory)
  const candidates = view.memory.entities.filter(
    (e) => e.kind === 'person' && e.status !== 'dead' && !['child', 'parent', 'sibling', 'spouse'].includes(e.relation ?? '') && e.attitude !== 'hostile' && e.attitude !== 'unfriendly'
  )
  const free = !st.combat && st.character.status === 'alive' && !turnBusy && !busy
  const surname = view.build.name.trim().split(/\s+/).slice(1).join(' ')

  const change = async (a: Parameters<typeof api.family>[1]) => {
    setBusy(true)
    try {
      useGame.setState({ view: await api.family(view.id, a) })
      return true
    } catch (err) {
      useGame.getState().toast({ title: "That didn't work", text: (err as Error).message, tone: 'bad', icon: 'warn' })
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">
        <Icon name="heart" size={14} />
        Family
      </h3>
      <div className="space-y-2 rounded-xl border border-gold-500/15 bg-ink-850/70 p-3 text-sm">
        {spouse ? (
          <div className="text-parchment-200">
            Married to <span className="font-display tracking-wide text-parchment-50">{spouse.name}</span>
            {spouse.status === 'dead' && <span className="text-parchment-500"> (died; you are widowed)</span>}
          </div>
        ) : (
          <p className="text-xs text-parchment-400">Not married.</p>
        )}
        {!living && candidates.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-44">
              <select value={suitor} onChange={(e) => setSuitor(e.target.value)} className="input py-1.5 text-sm" aria-label="Who to marry">
                <option value="">Marry…</option>
                {candidates.map((e) => (
                  <option key={e.id} value={e.name}>
                    {e.name}
                    {e.relation === 'lover' ? ' (your love)' : ''}
                  </option>
                ))}
              </select>
            </span>
            <Button size="sm" variant="secondary" icon="heart" disabled={!free || !suitor} onClick={() => void change({ marry: suitor }).then((ok) => ok && setSuitor(''))}>
              Marry
            </Button>
          </div>
        )}
        {kids.length > 0 && (
          <ul className="space-y-0.5 text-parchment-300">
            {kids.map((k) => {
              const y = yearsOld(k, st.time.day)
              return (
                <li key={k.id} className="flex items-baseline justify-between gap-2">
                  <span className={k.status === 'dead' ? 'text-parchment-500 line-through' : ''}>{k.name}</span>
                  <span className="shrink-0 text-xs text-parchment-500">{y !== undefined ? `${y} · ${childStage(y, k.race ?? view.build.race)}` : 'your child'}</span>
                </li>
              )
            })}
          </ul>
        )}
        {(living || lover) &&
          (naming ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void change({ child: { name: name.trim(), sex } }).then((ok) => ok && (setNaming(false), setName('')))
              }}
            >
              <span className="w-40">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={surname ? `Name (… ${surname})` : 'Their name'} className="input py-1.5 text-sm" aria-label="The child's name" autoFocus />
              </span>
              <span className="w-28">
                <select value={sex} onChange={(e) => setSex(e.target.value as 'female' | 'male')} className="input py-1.5 text-sm" aria-label="Daughter or son">
                  <option value="female">A daughter</option>
                  <option value="male">A son</option>
                </select>
              </span>
              <Button size="sm" variant="primary" type="submit" disabled={!free || !name.trim()}>
                Add
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setNaming(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <Button size="sm" variant="ghost" icon="plus" disabled={!free} onClick={() => setNaming(true)}>
              Add child
            </Button>
          ))}
        {living && <p className="text-xs text-parchment-500">A Timeskip can be spent raising a family. A grown child can take over if you die.</p>}
      </div>
    </section>
  )
}
