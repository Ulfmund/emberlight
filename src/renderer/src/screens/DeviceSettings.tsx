import { useState } from 'react'
import { isTouch, usePrefs, type Effects } from '../prefs'
import { play } from '../sound'
import { AudioLibrary } from './AudioLibrary'

/** Settings for this phone or computer only: how the game looks, sounds and helps here. */
export function DeviceSettings() {
  const p = usePrefs()
  const [library, setLibrary] = useState(false)
  const slider = (value: number, onChange: (v: number) => void, label: string) => (
    <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="w-36 accent-[var(--color-gold-400)]" />
  )
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const row = (label: string, control: React.ReactNode, hint?: string) => (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-parchment-300">{label}</span>
        {control}
      </div>
      {hint && <p className="mt-0.5 text-[0.7rem] leading-snug text-parchment-500">{hint}</p>}
    </div>
  )
  const onOff = (value: boolean, change: (v: boolean) => void) => (
    <select value={value ? 'on' : 'off'} onChange={(e) => change(e.target.value === 'on')} className="input w-36 py-1.5 text-sm">
      <option value="on">On</option>
      <option value="off">Off</option>
    </select>
  )
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold tracking-[0.14em] text-gold-400 uppercase">This device</h3>
      <p className="mb-1 text-xs text-parchment-500">Only for this {isTouch() ? 'phone' : 'computer'}; each device keeps its own.</p>
      {row(
        'Effects',
        <select value={p.effects} onChange={(e) => p.set({ effects: e.target.value as Effects })} className="input w-36 py-1.5 text-sm">
          <option value="full">Full</option>
          <option value="subtle">Subtle</option>
          <option value="off">Off</option>
        </select>,
        reduced && p.effects === 'full' ? 'Your system asks for less motion, so effects stay subtle.' : p.effects === 'off' ? 'No animation, no embers.' : undefined
      )}
      {row('Screen jolt on big hits', onOff(p.screenShake, (v) => p.set({ screenShake: v })))}
      {row('Music', slider(p.musicVolume, (v) => p.set({ musicVolume: v }), 'Music volume'), p.musicVolume === 0 ? 'Off.' : undefined)}
      {row('Sounds of the place', slider(p.ambienceVolume, (v) => p.set({ ambienceVolume: v }), 'Ambience volume'), 'Wind, rain, fire, birds, the tavern… they follow the story.')}
      {row(
        'Sound effects',
        onOff(p.sound, (v) => {
          p.set({ sound: v })
          if (v) play('coin')
        })
      )}
      {p.sound &&
        row(
          'Effects volume',
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={p.volume}
            onChange={(e) => p.set({ volume: Number(e.target.value) })}
            onPointerUp={() => play('coin')}
            onKeyUp={() => play('coin')}
            aria-label="Effects volume"
            className="w-36 accent-[var(--color-gold-400)]"
          />
        )}
      <div className="py-1.5">
        <button onClick={() => setLibrary(true)} className="no-drag cursor-pointer text-sm text-gold-300 hover:text-gold-200">
          Your own music and sounds…
        </button>
        {p.muted && <p className="mt-0.5 text-[0.7rem] text-blood-400">All sound is off (the speaker button at the top).</p>}
      </div>
      <AudioLibrary open={library} onClose={() => setLibrary(false)} />
      {isTouch() && row('Shake to throw dice', onOff(p.shake, (v) => p.set({ shake: v })), 'Needs the secure link (https); on an iPhone, allow it once when the dice come up.')}
      {row('Ghost text', onOff(p.ghost, (v) => p.set({ ghost: v })), 'Suggests how your sentence might go on when you pause typing. Each suggestion is a small request to your model.')}
    </section>
  )
}
