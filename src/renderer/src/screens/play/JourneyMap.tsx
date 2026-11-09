import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { PlaceKind } from '@shared/rules'
import { mapLayout, MAP_H as H, MAP_W as W } from '@shared/journey'
import { samePlace, type Entity } from '@shared/memory'
import { mediaUrl } from '@shared/images'
import type { CampaignView } from '@shared/view'
import { Icon } from '../../components/Icon'

/**
 * The map of the journey (docs/spec/08-ui-ux.md#map): not a survey, a traveller's sketch. Every
 * place the character has been, the ways walked between them, and where they are now.
 */

const KIND: Record<PlaceKind, { icon: string; color: string; label: string }> = {
  town: { icon: 'party', color: '#e8b54d', label: 'Town' },
  village: { icon: 'bread', color: '#d9a35b', label: 'Village' },
  indoors: { icon: 'candle', color: '#e8894d', label: 'Indoors' },
  road: { icon: 'signpost', color: '#b9a98a', label: 'Road' },
  forest: { icon: 'herb', color: '#8fbf73', label: 'Forest' },
  hills: { icon: 'strata', color: '#b0a083', label: 'Hills' },
  water: { icon: 'net', color: '#7fb3d9', label: 'Water' },
  ruin: { icon: 'skull', color: '#a99bc4', label: 'Ruin' },
  underground: { icon: 'pick', color: '#9a8fb0', label: 'Underground' },
  wild: { icon: 'boot', color: '#a7c46a', label: 'Wilds' }
}
const UNKNOWN = { icon: 'map', color: '#b9a98a', label: 'Somewhere' }

/** A gently bent line between two places, so overlapping ways stay apart. */
function bend(a: { x: number; y: number }, b: { x: number; y: number }, k: number) {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.max(1, Math.hypot(dx, dy))
  const off = 14 * k
  return `M ${a.x} ${a.y} Q ${mx - (dy / len) * off} ${my + (dx / len) * off} ${b.x} ${b.y}`
}

export function JourneyMap({ view }: { view: CampaignView }) {
  const j = view.journey
  const pos = useMemo(() => mapLayout(j), [j])
  const [picked, setPicked] = useState<number | null>(j.here)
  const record = (name: string): Entity | undefined => view.memory.entities.find((e) => e.kind === 'place' && [e.name, ...e.aliases].some((n) => samePlace(n, name)))

  if (!j.stops.length) return <p className="mt-10 text-center font-story text-lg text-parchment-400 italic">Nowhere on the map yet. Where you go will be drawn here.</p>
  const sel = picked !== null ? j.stops[picked] : null
  const selRecord = sel ? record(sel.name) : undefined
  const selKind = sel?.kind ? KIND[sel.kind] : UNKNOWN

  return (
    <div>
      <div className="relative w-full overflow-hidden rounded-2xl border border-gold-500/20" style={{ aspectRatio: `${W} / ${H}`, background: 'radial-gradient(ellipse at 50% 45%, #2a2118 0%, #1a1410 60%, #120d0b 100%)' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <pattern id="map-grain" width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.6" fill="rgb(232 213 168 / 0.05)" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#map-grain)" />
          {j.legs.map((l, i) => (
            <path
              key={i}
              d={bend(pos[l.from], pos[l.to], (i % 3) - 1 || 0.6)}
              fill="none"
              stroke="rgb(232 213 168 / 0.38)"
              strokeWidth={Math.min(3.5, 1.2 + l.times * 0.5)}
              strokeDasharray="5 6"
              strokeLinecap="round"
            />
          ))}
        </svg>
        {j.stops.map((s, i) => {
          const k = s.kind ? KIND[s.kind] : UNKNOWN
          const here = i === j.here
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => setPicked(i)}
              className="no-drag absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center"
              style={{ left: `${(pos[i].x / W) * 100}%`, top: `${(pos[i].y / H) * 100}%` }}
              title={`${s.name} (${k.label.toLowerCase()})`}
              aria-pressed={picked === i}
            >
              <span className="relative grid h-8 w-8 place-items-center rounded-full border-2 bg-ink-900 touch:h-10 touch:w-10" style={{ borderColor: k.color, boxShadow: picked === i ? `0 0 0 3px color-mix(in oklab, ${k.color} 35%, transparent)` : undefined }}>
                {here && <motion.span className="absolute -inset-1.5 rounded-full border-2 border-ember-400" animate={{ opacity: [0.9, 0.25, 0.9], scale: [1, 1.12, 1] }} transition={{ duration: 2.4, repeat: Infinity }} />}
                <Icon name={k.icon} size={15} style={{ color: k.color }} />
              </span>
              <span className={`mt-1 max-w-[7.5rem] truncate rounded px-1 text-[0.68rem] leading-tight ${here ? 'bg-ember-500/20 text-ember-400' : 'text-parchment-200'}`} style={{ textShadow: '0 1px 3px #000' }}>
                {s.name}
              </span>
            </button>
          )
        })}
        <span className="pointer-events-none absolute right-3 bottom-2 font-display text-[0.65rem] tracking-[0.3em] text-parchment-500/60">THE WAY SO FAR</span>
      </div>

      {sel && (
        <motion.div key={sel.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 overflow-hidden rounded-xl border border-gold-500/15 bg-ink-850/80">
          {selRecord?.image && <img src={mediaUrl(selRecord.image)} alt="" className="h-36 w-full object-cover md:h-44" />}
          <div className="p-4">
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="font-display text-lg tracking-wide text-parchment-50">{sel.name}</span>
              <span className="text-xs" style={{ color: selKind.color }}>
                {selKind.label}
              </span>
              {picked === j.here && <span className="text-xs text-ember-400">You are here</span>}
            </div>
            <p className="mt-1 text-[0.92rem] text-parchment-200">{selRecord?.summary || <span className="text-parchment-500 italic">Nothing written about it yet.</span>}</p>
            {selRecord && selRecord.facts.length > 0 && (
              <ul className="mt-2 space-y-1">
                {selRecord.facts.slice(-3).map((f, i) => (
                  <li key={i} className="flex gap-2 text-[0.85rem] leading-snug text-parchment-300">
                    <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-gold-400/70" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[0.7rem] text-parchment-500">
              {sel.visits > 1 ? `Been here ${sel.visits} times · ` : ''}
              {sel.firstDay === sel.lastDay ? `Day ${sel.firstDay}` : `Days ${sel.firstDay}–${sel.lastDay}`}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}
