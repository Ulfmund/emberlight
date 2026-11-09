import { useState } from 'react'
import { motion } from 'motion/react'
import {
  ATTR_INFO,
  ATTRS,
  GROUP_INFO,
  SKILL_GROUPS,
  SKILL_IDS,
  SKILLS,
  attrCapBreakdown,
  fmtMod,
  mod,
  skillCapBreakdown,
  skillXpForLevel,
  type CampaignSettings
} from '@shared/rules'
import type { CampaignView } from '@shared/view'
import { useGame } from '../../store'
import { Icon } from '../../components/Icon'
import { Tip } from '../../components/Tip'
import { Button } from '../../components/Button'

export type Tab = 'sheet' | 'bag' | 'log' | 'saves'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'sheet', label: 'Sheet', icon: 'scroll' },
  { id: 'bag', label: 'Bag', icon: 'bag' },
  { id: 'log', label: 'Log', icon: 'hourglass' },
  { id: 'saves', label: 'Saves', icon: 'save' }
]

export function SidePanel({ view, tab, setTab }: { view: CampaignView; tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <aside className="relative z-10 flex w-[22rem] shrink-0 flex-col border-l border-gold-500/15 bg-ink-950/70 backdrop-blur">
      <div className="flex gap-1 border-b border-gold-500/15 p-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`no-drag relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition-colors ${tab === t.id ? 'text-gold-200' : 'text-parchment-400 hover:text-parchment-100'}`}
          >
            {tab === t.id && <motion.span layoutId="side-tab" className="absolute inset-0 rounded-lg border border-gold-400/40 bg-gold-500/10" />}
            <Icon name={t.icon} size={16} className="relative" />
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'sheet' && <SheetTab view={view} />}
        {tab === 'bag' && <BagTab view={view} />}
        {tab === 'log' && <LogTab view={view} />}
        {tab === 'saves' && <SavesTab view={view} />}
      </div>
    </aside>
  )
}

function SheetTab({ view }: { view: CampaignView }) {
  const spend = useGame((s) => s.spend)
  const c = view.state.character
  const caps = attrCapBreakdown(view.build, view.settings.sexModifiers)
  const sCaps = skillCapBreakdown(view.build, view.settings.sexModifiers)
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 flex items-center justify-between text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">
          Attributes
          {c.attrPoints > 0 && <span className="rounded bg-gold-400/20 px-1.5 py-px text-gold-200 normal-case">{c.attrPoints} to spend</span>}
        </h3>
        <div className="space-y-1">
          {ATTRS.map((a) => {
            const v = c.attributes[a]
            const cap = caps[a].cap
            return (
              <Tip key={a} content={<>{ATTR_INFO[a].blurb}. Cap {cap}: {caps[a].sources.map((s) => `${s.label} ${s.value}`).join(', ')}</>} className="w-full">
                <div className="grid w-full grid-cols-[6.5rem_1fr_3.5rem_1.75rem] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.03]">
                  <span className="text-sm text-parchment-100">{ATTR_INFO[a].label}</span>
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-ink-900">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-gold-400" style={{ width: `${(v / 20) * 100}%` }} />
                    <div className="absolute inset-y-0 w-0.5 bg-ember-400" style={{ left: `${(cap / 20) * 100}%` }} />
                  </div>
                  <span className="text-right text-sm tabular-nums">
                    <b className="text-gold-200">{v}</b> <span className="text-parchment-500">{fmtMod(mod(v))}</span>
                  </span>
                  {c.attrPoints > 0 && v < cap ? (
                    <motion.button whileTap={{ scale: 0.8 }} onClick={() => void spend(a)} className="no-drag grid h-6 w-6 cursor-pointer place-items-center rounded-md border border-gold-300/60 bg-gold-400/20 text-gold-200">
                      <Icon name="plus" size={13} />
                    </motion.button>
                  ) : (
                    <span />
                  )}
                </div>
              </Tip>
            )
          })}
        </div>
      </section>

      {SKILL_GROUPS.map((g) => (
        <section key={g}>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">
            <Icon name={GROUP_INFO[g].icon} size={14} />
            {GROUP_INFO[g].label}
          </h3>
          {SKILL_IDS.filter((s) => SKILLS[s].group === g).map((s) => {
            const lvl = view.derived.skillLevels[s]
            const xp = c.skillXp[s] ?? 0
            const from = skillXpForLevel(lvl)
            const to = skillXpForLevel(lvl + 1)
            const pct = lvl >= 50 ? 100 : ((xp - from) / Math.max(1, to - from)) * 100
            return (
              <Tip key={s} className="w-full" content={<>{SKILLS[s].blurb}. Uses {SKILLS[s].attr}. {lvl < 50 ? `${to - xp} XP to level ${lvl + 1}.` : 'Mastered.'} Cap {sCaps[s].cap}.</>}>
                <div className="grid w-full grid-cols-[1fr_4.5rem] items-center gap-2 rounded-md px-2 py-1 hover:bg-white/[0.03]">
                  <div>
                    <div className="flex justify-between text-sm">
                      <span className={lvl > 1 ? 'text-parchment-100' : 'text-parchment-400'}>{SKILLS[s].label}</span>
                    </div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-ink-900">
                      <div className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="text-right text-sm tabular-nums">
                    <b className={lvl > 1 ? 'text-gold-200' : 'text-parchment-400'}>{lvl}</b>
                    <span className="text-xs text-parchment-500"> / {sCaps[s].cap}</span>
                  </span>
                </div>
              </Tip>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function BagTab({ view }: { view: CampaignView }) {
  const inv = view.state.character.inventory
  return (
    <div>
      {inv.length === 0 && <p className="text-sm text-parchment-500 italic">Your pack is empty.</p>}
      <div className="grid grid-cols-2 gap-2">
        {inv.map((i) => (
          <motion.div key={i.name} layout initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2.5 rounded-lg border border-gold-500/15 bg-ink-850/80 p-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-gold-500/25 bg-ink-800 text-gold-300">
              <Icon name={i.icon ?? 'bag'} size={18} />
            </span>
            <span className="min-w-0 text-sm leading-tight text-parchment-100">
              {i.name}
              {i.qty > 1 && <span className="ml-1 text-xs text-gold-300">×{i.qty}</span>}
            </span>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-xs text-parchment-500">
        Items you find, buy or lose in the story are added here automatically. Equipment slots and crafting arrive in a later update.
      </p>
    </div>
  )
}

function LogTab({ view }: { view: CampaignView }) {
  const lines = view.messages.flatMap((m) => m.changes.map((c, i) => ({ ...c, key: `${m.id}-${i}` }))).reverse()
  const tone = { good: 'text-moss-400', bad: 'text-blood-400', neutral: 'text-parchment-400' }
  return (
    <div className="space-y-1">
      {lines.length === 0 && <p className="text-sm text-parchment-500 italic">Nothing has happened yet.</p>}
      {lines.slice(0, 200).map((l) => (
        <div key={l.key} className="flex items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-white/[0.03]">
          <Icon name={l.icon} size={14} className={`mt-0.5 shrink-0 ${tone[l.tone]}`} />
          <span className="text-parchment-200">{l.text}</span>
        </div>
      ))}
    </div>
  )
}

function SavesTab({ view }: { view: CampaignView }) {
  const { saveSlot, loadSlot, deleteSlot, updateCampaignSettings, busy } = useGame()
  const [name, setName] = useState('')
  const s = view.settings
  const set = (p: Partial<CampaignSettings>) => void updateCampaignSettings({ ...s, ...p })
  const Opt = <K extends keyof CampaignSettings>({ k, options, label }: { k: K; options: { id: CampaignSettings[K]; label: string }[]; label: string }) => (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm text-parchment-300">{label}</span>
      <select value={String(s[k])} onChange={(e) => set({ [k]: options.find((o) => String(o.id) === e.target.value)!.id } as Partial<CampaignSettings>)} className="input w-36 py-1.5 text-sm">
        {options.map((o) => (
          <option key={String(o.id)} value={String(o.id)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Save slots</h3>
        <p className="mb-3 text-xs text-parchment-500">The game saves itself after every turn. Slots are bookmarks you can jump back to.</p>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Before the bridge" maxLength={60} className="input py-2 text-sm" />
          <Button variant="secondary" size="sm" icon="save" disabled={!name.trim() || busy} onClick={() => { void saveSlot(name.trim()); setName('') }}>
            Save
          </Button>
        </div>
        <div className="mt-3 space-y-1.5">
          {view.saves.map((sv) => (
            <div key={sv.id} className="flex items-center gap-2 rounded-lg border border-gold-500/15 bg-ink-850/80 px-3 py-2">
              <Icon name="save" size={15} className="text-gold-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-parchment-100">{sv.name}</span>
              <span className="text-[0.68rem] text-parchment-500">{new Date(sv.createdAt).toLocaleDateString()}</span>
              <Button variant="ghost" size="sm" disabled={busy || s.ironman} onClick={() => void loadSlot(sv.id)}>
                Load
              </Button>
              <button onClick={() => void deleteSlot(sv.id)} className="no-drag cursor-pointer p-1 text-parchment-500 hover:text-blood-400" title="Delete this save">
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-1 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">Campaign settings</h3>
        <Opt k="tone" label="Tone" options={[{ id: 'grim', label: 'Grim' }, { id: 'grounded', label: 'Grounded' }, { id: 'heroic', label: 'Heroic' }, { id: 'whimsical', label: 'Whimsical' }, { id: 'horror', label: 'Horror' }]} />
        <Opt k="mercy" label="Mercy" options={[{ id: 'brutal', label: 'Brutal' }, { id: 'harsh', label: 'Harsh' }, { id: 'forgiving', label: 'Forgiving' }]} />
        <Opt k="rollMode" label="Dice" options={[{ id: 'auto', label: 'Automatic' }, { id: 'dramatic', label: 'Big moments' }, { id: 'always', label: 'Always' }]} />
        <Opt k="length" label="Response length" options={[{ id: 'short', label: 'Short' }, { id: 'medium', label: 'Medium' }, { id: 'long', label: 'Long' }]} />
        <Opt k="failForward" label="Fail forward" options={[{ id: false, label: 'Off' }, { id: true, label: 'On' }]} />
        <Opt k="ironman" label="Ironman" options={[{ id: false, label: 'Off' }, { id: true, label: 'On' }]} />
      </section>
    </div>
  )
}
