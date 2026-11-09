import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { allyHealth, COMPANION_ROLES, companionHp, companionStats, PARTY_MAX, ROLE_INFO, type Companion, type CompanionRole } from '@shared/rules'
import { sameName, type Entity } from '@shared/memory'
import { cardImageUrl } from '@shared/cards'
import { mediaUrl } from '@shared/images'
import type { CampaignView } from '@shared/view'
import { useGame } from '../../store'
import { api } from '../../api'
import { Bar } from '../../components/Bar'
import { Icon } from '../../components/Icon'
import { speakerColor } from '../../components/StoryText'

/**
 * Companions on screen (docs/spec/04-rules-system.md#companions): who travels with you, how
 * they're faring, and what they do in a fight.
 */

const ROLE_ICON: Record<CompanionRole, string> = { fighter: 'sword', archer: 'bow', healer: 'herb', mage: 'sparkle', scout: 'boot' }

/** Their picture: the card's, or the one given them in the Journal. */
export function companionPicture(view: CampaignView, a: Companion): string | null {
  const card = a.card ? view.cast.find((m) => m.cardId === a.card && m.hasImage) : undefined
  if (card) return cardImageUrl(card.cardId)
  const e = view.memory.entities.find((x) => x.kind === 'person' && x.image && [x.name, ...x.aliases].some((n) => sameName(n, a.name)))
  return e?.image ? mediaUrl(e.image) : null
}

function Face({ view, a, size = 36 }: { view: CampaignView; a: Companion; size?: number }) {
  const src = companionPicture(view, a)
  const color = speakerColor(a.name)
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border-2 font-display font-bold text-ink-950"
      style={{ width: size, height: size, fontSize: size * 0.4, borderColor: color, background: `radial-gradient(circle at 35% 30%, ${color}, color-mix(in oklab, ${color} 40%, #120d10))`, filter: a.down ? 'grayscale(1) brightness(0.6)' : undefined }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" style={{ objectPosition: 'center 18%' }} /> : a.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Calls that change the party, with the answer shown if something's wrong. */
function useParty(view: CampaignView) {
  const [busy, setBusy] = useState(false)
  const run = async (call: () => Promise<CampaignView>) => {
    setBusy(true)
    try {
      useGame.setState({ view: await call() })
      return true
    } catch (err) {
      useGame.getState().toast({ title: "That didn't work", text: (err as Error).message, tone: 'bad', icon: 'warn' })
      return false
    } finally {
      setBusy(false)
    }
  }
  return {
    busy,
    join: (name: string, role?: CompanionRole) => run(() => api.partyJoin(view.id, name, role)),
    leave: (a: Companion) => run(() => api.partyLeave(view.id, a.id)),
    role: (a: Companion, role: CompanionRole) => run(() => api.partyRole(view.id, a.id, role))
  }
}

/** The Sheet's companions: everyone with you, their role in a fight, and parting ways. */
export function PartySection({ view }: { view: CampaignView }) {
  const party = view.state.party ?? []
  const lvl = view.state.character.level
  const p = useParty(view)
  const [name, setName] = useState('')
  const [parting, setParting] = useState<string | null>(null)
  const inFight = Boolean(view.state.combat)
  return (
    <section>
      <h3 className="mb-2 flex items-center justify-between text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">
        <span className="flex items-center gap-1.5">
          <Icon name="party" size={14} />
          Companions
        </span>
        {party.length > 0 && (
          <span className="text-parchment-500 normal-case tabular-nums">
            {party.length} / {PARTY_MAX}
          </span>
        )}
      </h3>
      {party.length === 0 && <p className="px-2 text-sm text-parchment-500">Nobody travels with you yet. When someone agrees to come along in the story, they join you here; you can also ask anyone from the Journal.</p>}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {party.map((a) => {
            const st = companionStats(a.role, lvl)
            const hp = companionHp(a, lvl)
            return (
              <motion.div key={a.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-xl border border-gold-500/15 bg-ink-850/70 p-2.5">
                <div className="flex items-center gap-2.5">
                  <Face view={view} a={a} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-display text-[0.95rem] tracking-wide text-parchment-50">{a.name}</span>
                      <span className={`shrink-0 text-[0.68rem] ${a.down ? 'text-blood-400' : 'text-parchment-500'}`}>{allyHealth(a, lvl)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1">
                        <Bar value={hp} max={st.maxHp} color="#d9574c" thin />
                      </div>
                      <span className="text-[0.68rem] text-parchment-400 tabular-nums">
                        {hp}/{st.maxHp}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-32 shrink-0">
                    <select value={a.role} disabled={p.busy} onChange={(e) => void p.role(a, e.target.value as CompanionRole)} className="input py-1 text-sm" aria-label={`What ${a.name} does in a fight`}>
                      {COMPANION_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_INFO[r].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="min-w-0 flex-1 text-[0.7rem] leading-snug text-parchment-500">{ROLE_INFO[a.role].what}</span>
                </div>
                <div className="mt-1.5 flex justify-end">
                  {parting === a.id ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-parchment-400">Part ways with {a.name}?</span>
                      <button disabled={p.busy} onClick={() => void p.leave(a).then(() => setParting(null))} className="no-drag cursor-pointer rounded-md border border-blood-500/40 px-2 py-0.5 text-blood-300 hover:bg-blood-500/15 touch:py-1.5">
                        Part ways
                      </button>
                      <button onClick={() => setParting(null)} className="no-drag cursor-pointer rounded-md px-2 py-0.5 text-parchment-400 hover:text-parchment-100 touch:py-1.5">
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      disabled={inFight}
                      title={inFight ? 'Not in the middle of a fight' : undefined}
                      onClick={() => setParting(a.id)}
                      className="no-drag cursor-pointer rounded-md px-2 py-0.5 text-xs text-parchment-500 hover:text-parchment-100 disabled:cursor-not-allowed disabled:opacity-40 touch:py-1.5"
                    >
                      Part ways…
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
      {party.length < PARTY_MAX && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) void p.join(name.trim()).then((ok) => ok && setName(''))
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ask someone to come along…" maxLength={60} className="input min-w-0 flex-1 py-1.5 text-sm" aria-label="Who to ask along" />
          <button type="submit" disabled={p.busy || !name.trim()} className="no-drag shrink-0 cursor-pointer rounded-lg border border-gold-500/30 px-3 text-sm text-gold-200 hover:border-gold-400/60 disabled:cursor-not-allowed disabled:opacity-40">
            Add
          </button>
        </form>
      )}
    </section>
  )
}

/** A short list under the character's bars: who's with you, and how they are. */
export function PartyStrip({ view, onOpen }: { view: CampaignView; onOpen?: () => void }) {
  const party = view.state.party ?? []
  if (!party.length) return null
  const lvl = view.state.character.level
  return (
    <button type="button" onClick={onOpen} disabled={!onOpen} className="no-drag mt-4 block w-full cursor-pointer rounded-xl border border-gold-500/15 bg-ink-850/60 p-2.5 text-left hover:border-gold-500/35 disabled:cursor-default" title="Your companions (on the Sheet)">
      <div className="mb-1.5 text-[0.65rem] tracking-[0.16em] text-parchment-500 uppercase">With you</div>
      <div className="space-y-1.5">
        {party.map((a) => {
          const st = companionStats(a.role, lvl)
          return (
            <div key={a.id} className="flex items-center gap-2">
              <Face view={view} a={a} size={24} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-[0.78rem]">
                  <span className="truncate text-parchment-100">{a.name}</span>
                  <Icon name={ROLE_ICON[a.role]} size={12} className="shrink-0 text-parchment-500" />
                </div>
                <Bar value={companionHp(a, lvl)} max={st.maxHp} color="#d9574c" thin />
              </div>
            </div>
          )
        })}
      </div>
    </button>
  )
}

/** Companions in a fight: on the tracker beside the foes (the game plays them). */
export function AllyChips({ view }: { view: CampaignView }) {
  const party = view.state.party ?? []
  if (!party.length) return null
  const lvl = view.state.character.level
  return (
    <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {party.map((a) => {
        const st = companionStats(a.role, lvl)
        const hp = companionHp(a, lvl)
        return (
          <div key={a.id} className={`flex w-36 shrink-0 items-center gap-2 rounded-lg border px-2 py-1.5 ${a.down ? 'border-white/5 bg-ink-900/40 opacity-50' : 'border-moss-400/25 bg-moss-400/[0.06]'}`} title={`${a.name}, ${ROLE_INFO[a.role].label.toLowerCase()}: the game plays them in the fight`}>
            <Face view={view} a={a} size={26} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-xs text-parchment-100">
                <span className="min-w-0 truncate">{a.name}</span>
                <Icon name={ROLE_ICON[a.role]} size={11} className="ml-auto shrink-0 text-moss-400/80" />
              </div>
              {a.down ? (
                <div className="mt-0.5 text-[0.68rem] text-blood-400">Down</div>
              ) : (
                <div className="mt-1">
                  <Bar value={hp} max={st.maxHp} color="#6fbf8a" thin />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** On a Journal card: ask this person to come along (or see that they're with you). */
export function TravelButton({ view, entity: e }: { view: CampaignView; entity: Entity }) {
  const p = useParty(view)
  const party = view.state.party ?? []
  if (e.kind !== 'person' || e.status === 'dead' || sameName(e.name, view.build.name)) return null
  const withYou = party.find((a) => [e.name, ...e.aliases].some((n) => sameName(n, a.name)))
  if (withYou)
    return (
      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-moss-400/30 bg-moss-400/10 px-2.5 py-0.5 text-[0.72rem] text-moss-400">
        <Icon name="party" size={12} /> Travelling with you · {ROLE_INFO[withYou.role].label.toLowerCase()}
      </span>
    )
  if (party.length >= PARTY_MAX) return null
  return (
    <button
      type="button"
      disabled={p.busy}
      onClick={() => void p.join(e.name)}
      className="no-drag mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gold-500/25 px-2.5 py-0.5 text-[0.72rem] text-parchment-300 hover:border-gold-400/60 hover:text-gold-200 disabled:opacity-40 touch:py-1.5"
      title="They travel with you from now on; the DM plays them, and they fight beside you"
    >
      <Icon name="party" size={12} /> Travel together
    </button>
  )
}
