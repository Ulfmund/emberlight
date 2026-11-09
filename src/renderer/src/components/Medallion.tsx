import type { RaceId } from '@shared/rules'
import { Icon } from './Icon'

export const RACE_COLOR: Record<RaceId, string> = {
  human: '#e8b54d',
  dwarf: '#d98b4f',
  elf: '#8fbf73',
  halfling: '#e8a0bf',
  orc: '#c45a4a'
}

/** The character's portrait in a gilt ring, coloured by race. Without a picture: their initials. */
export function Medallion({ name, race, size = 72, dead = false, image, badge = true }: { name: string; race: RaceId; size?: number; dead?: boolean; image?: string; badge?: boolean }) {
  const color = RACE_COLOR[race]
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 28%, color-mix(in oklab, ${color} 55%, #fff2) , color-mix(in oklab, ${color} 30%, #120d10) 70%)`,
        boxShadow: `0 0 0 2px #120d10, 0 0 0 ${Math.max(3, size / 22)}px ${color}, 0 10px 30px -8px rgb(0 0 0 / 0.9), 0 0 30px -10px ${color}`,
        filter: dead ? 'grayscale(1) brightness(0.6)' : undefined
      }}
    >
      {image ? (
        <img src={image} alt="" draggable={false} className="absolute inset-0 h-full w-full rounded-full object-cover" style={{ objectPosition: 'center 18%' }} />
      ) : (
        <span className="font-display font-bold text-ink-950/85" style={{ fontSize: size * 0.34 }}>
          {initials}
        </span>
      )}
      {badge && <span
        className="absolute -right-1 -bottom-1 grid place-items-center rounded-full border border-gold-500/50 bg-ink-900 text-gold-300"
        style={{ width: size * 0.4, height: size * 0.4 }}
      >
        <Icon name={`race-${race}`} size={size * 0.26} />
      </span>}
    </div>
  )
}
