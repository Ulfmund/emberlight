import { useState } from 'react'
import { motion } from 'motion/react'
import { findTemplate, itemTemplate, knownSpells, SPELL_COST, type CombatAction, type Foe, type Spell } from '@shared/rules'
import type { CampaignView } from '@shared/view'
import { useGame } from '../../store'
import { Icon } from '../../components/Icon'
import { Bar } from '../../components/Bar'
import { Tip } from '../../components/Tip'

/**
 * The fight on the tracker (docs/spec/04-rules-system.md#combat): who is in it, how hurt they
 * are, and one-tap moves. Typing still works too: the Referee turns words into a move.
 */
export function CombatTracker({ view }: { view: CampaignView }) {
  const { act, busy, live } = useGame()
  const [target, setTarget] = useState<string | null>(null)
  const [confirmYield, setConfirmYield] = useState(false)
  const [spellMenu, setSpellMenu] = useState(false)
  const cb = view.state.combat
  const c = view.state.character
  if (!cb || c.status !== 'alive') return null

  const fighting = cb.foes.filter((f) => f.status === 'fighting')
  const chosen = fighting.find((f) => f.id === target) ?? fighting[0]
  const weapon = view.derived.weapon
  const potion = c.inventory.find((i) => (itemTemplate(i.template) ?? findTemplate(i.name))?.heal)
  const off = busy || live.hold || !chosen
  const send = (text: string, move: CombatAction) => {
    setConfirmYield(false)
    void act(text, { combat: move })
  }

  type Move = { id: string; label: string; icon: string; tip: string; go: () => void; disabled?: boolean; tone?: 'danger' }
  // Spells the character knows that work in a fight.
  const spells = knownSpells(view.state).filter((sp) => sp.combat)
  const aimed = (sp: Spell) => sp.effect === 'damage' || sp.effect === 'debuff'
  const castSpell = (sp: Spell) => {
    setSpellMenu(false)
    if (!chosen) return
    send(aimed(sp) ? `I cast ${sp.name}${sp.area ? '' : ` at ${chosen.name}`}.` : `I cast ${sp.name}.`, { kind: 'cast', target: aimed(sp) ? chosen.id : undefined, spell: sp.id })
  }
  const moves: Move[] = []
  if (chosen) {
    moves.push({
      id: 'attack',
      label: 'Attack',
      icon: weapon.skill === 'ranged' ? 'bow' : 'sword',
      tip: `Attack ${chosen.name} with ${weapon.unarmed ? 'your fists' : `your ${weapon.name.toLowerCase()}`}.`,
      go: () => send(`I attack ${chosen.name} with ${weapon.unarmed ? 'my fists' : `my ${weapon.name.toLowerCase()}`}.`, { kind: 'attack', target: chosen.id })
    })
    moves.push({
      id: 'power',
      label: 'Power',
      icon: 'bolt',
      tip: c.stamina < 2 ? 'Too tired: a power attack takes 2 stamina.' : 'An all-out blow: an extra damage die, for 2 stamina.',
      disabled: c.stamina < 2,
      go: () => send(`I throw everything into a heavy blow at ${chosen.name}.`, { kind: 'power', target: chosen.id })
    })
    if (spells.length === 1) {
      const sp = spells[0]
      moves.push({ id: 'cast', label: sp.name, icon: 'sparkle', tip: c.mana < sp.cost ? `Out of mana: ${sp.name} takes ${sp.cost}.` : `${sp.blurb} (${sp.cost} mana)`, disabled: c.mana < sp.cost, go: () => castSpell(sp) })
    } else if (spells.length > 1) {
      moves.push({ id: 'cast', label: 'Spells', icon: 'sparkle', tip: 'Choose a spell', disabled: spells.every((sp) => c.mana < sp.cost), go: () => setSpellMenu((x) => !x) })
    } else if (view.derived.maxMana > 0 && ((view.derived.skillLevels.spellcasting ?? 1) >= 2 || c.attributes.ARC >= 13))
      moves.push({
        id: 'cast',
        label: 'Spell',
        icon: 'sparkle',
        tip: c.mana < SPELL_COST ? `Out of mana: a spell takes ${SPELL_COST}.` : `Hurl a spell at ${chosen.name}: ${SPELL_COST} mana, 1d8 + Arcane damage.`,
        disabled: c.mana < SPELL_COST,
        go: () => send(`I hurl a spell at ${chosen.name}.`, { kind: 'cast', target: chosen.id })
      })
  }
  moves.push({
    id: 'defend',
    label: 'Defend',
    icon: 'armor',
    tip: 'Guard, parry and dodge: +2 Defense until your next move.',
    go: () => send('I fight defensively, guarding and watching for an opening.', { kind: 'defend' })
  })
  if (potion)
    moves.push({
      id: 'heal',
      label: 'Heal',
      icon: 'flask',
      tip: `Use your ${potion.name.toLowerCase()}${potion.qty > 1 ? ` (${potion.qty} left)` : ''}. The foes still get their turn.`,
      go: () => send(`I use my ${potion.name.toLowerCase()}.`, { kind: 'use_item', item: potion.name })
    })
  moves.push({
    id: 'flee',
    label: 'Flee',
    icon: 'boot',
    tip: fighting.some((f) => f.family === 'beast') ? 'Try to break away (Athletics, hard: beasts are fast).' : 'Try to break away (Athletics).',
    go: () => send('I try to break away and flee.', { kind: 'flee' })
  })
  if (fighting.some((f) => f.family === 'humanoid'))
    moves.push({
      id: 'yield',
      label: confirmYield ? 'Sure?' : 'Yield',
      icon: 'chain',
      tone: 'danger',
      tip: 'Surrender. They take you prisoner, and you lose your weapons.',
      go: () => (confirmYield ? send('I throw down my weapon and yield.', { kind: 'surrender' }) : setConfirmYield(true))
    })

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      aria-label="Fight"
      className="relative z-20 border-t border-blood-500/30 bg-gradient-to-t from-ink-950 to-ink-950/90 backdrop-blur-md"
    >
      <div className="mx-auto max-w-3xl px-3 pt-2.5 md:px-6">
        <div className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.18em] text-blood-400 uppercase">
          <Icon name="sword" size={14} />
          <span>Fight · round {cb.round}</span>
          {cb.dodging && <span className="rounded bg-gold-500/15 px-1.5 py-0.5 tracking-normal text-gold-200 normal-case">Guarding</span>}
          <span className="ml-auto hidden font-normal tracking-normal text-parchment-500 normal-case sm:inline">Pick a target, then a move, or type what you do</span>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {cb.foes.map((f) => (
            <FoeChip key={f.id} foe={f} selected={f.id === chosen?.id} onSelect={() => setTarget(f.id)} />
          ))}
        </div>
        {spellMenu && spells.length > 1 && (
          <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
            {spells.map((sp) => (
              <button
                key={sp.id}
                type="button"
                disabled={off || c.mana < sp.cost}
                onClick={() => castSpell(sp)}
                className="no-drag flex cursor-pointer items-baseline gap-2 rounded-lg border border-arcane-400/25 bg-ink-850/80 px-2.5 py-1.5 text-left hover:border-arcane-400/60 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <span className="text-sm text-parchment-100">{sp.name}</span>
                <span className="ml-auto shrink-0 text-[0.68rem] text-arcane-400 tabular-nums">{sp.cost} mana</span>
                <span className="hidden text-[0.68rem] text-parchment-500 sm:block" />
              </button>
            ))}
          </div>
        )}
        {/* Phones: one row of up to five moves, or two rows of four. */}
        <div className="mt-1.5 grid gap-1.5 sm:flex sm:flex-wrap" style={{ gridTemplateColumns: `repeat(${moves.length > 5 ? 4 : moves.length}, minmax(0, 1fr))` }}>
          {moves.map((m) => (
            <Tip key={m.id} content={m.tip} className="sm:flex-1">
              <button
                type="button"
                disabled={off || m.disabled}
                onClick={m.go}
                className={`no-drag focus-ring flex w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 sm:flex-row sm:gap-1.5 sm:py-2 sm:text-sm ${
                  m.tone === 'danger'
                    ? 'border-blood-500/35 bg-blood-500/10 text-parchment-200 hover:border-blood-400/70 hover:bg-blood-500/20'
                    : 'border-gold-500/25 bg-ink-850/80 text-parchment-100 hover:border-gold-400/60 hover:bg-ink-700/80'
                }`}
              >
                <Icon name={m.icon} size={16} className={m.tone === 'danger' ? 'text-blood-400' : 'text-gold-300'} />
                <span>{m.label}</span>
              </button>
            </Tip>
          ))}
        </div>
      </div>
    </motion.section>
  )
}

const OUT_LABEL: Record<Foe['status'], string> = { fighting: '', fled: 'Fled', down: 'Down', surrendered: 'Yielded', asleep: 'Asleep' }

function FoeChip({ foe, selected, onSelect }: { foe: Foe; selected: boolean; onSelect: () => void }) {
  const out = foe.status !== 'fighting'
  const big = foe.tier === 'elite' || foe.tier === 'boss'
  return (
    <button
      type="button"
      disabled={out}
      onClick={onSelect}
      aria-pressed={selected}
      className={`no-drag w-36 shrink-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-left transition-[border-color,background-color,box-shadow] disabled:cursor-default ${
        out
          ? 'border-white/5 bg-ink-900/40 opacity-45'
          : selected
            ? 'border-blood-400/70 bg-blood-500/15 shadow-[0_0_18px_-6px_rgb(217_87_76/0.75)]'
            : 'border-white/10 bg-ink-850/80 hover:border-blood-400/40'
      }`}
    >
      <div className="flex items-center gap-1.5 text-sm text-parchment-100">
        {selected && !out && <span className="size-1.5 shrink-0 rounded-full bg-blood-400 shadow-[0_0_6px_rgb(217_87_76)]" />}
        <span className="min-w-0 truncate">{foe.name}</span>
        {big && <span className="ml-auto shrink-0 rounded bg-gold-500/20 px-1 text-[0.6rem] tracking-wide text-gold-200 uppercase">{foe.tier}</span>}
      </div>
      {out ? (
        <div className="mt-1 text-xs text-parchment-500">{OUT_LABEL[foe.status]}</div>
      ) : (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1">
            <Bar value={foe.hp} max={foe.maxHp} color="#d9574c" thin />
          </div>
          <span className="text-[0.7rem] text-parchment-400 tabular-nums">
            {foe.hp}/{foe.maxHp}
          </span>
        </div>
      )}
    </button>
  )
}
