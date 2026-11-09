import { useEffect, useState } from 'react'
import { PERSONAS, personaCardId } from '@shared/personas'
import type { CardSummary } from '@shared/cards'
import { api } from '../api'
import { Icon } from '../components/Icon'

/**
 * Who the DM is: a built-in persona, or any character card from the library
 * (docs/spec/03-characters-and-cards.md#the-dm-is-a-card-too).
 */
export function PersonaPicker({ value, onChange, wide = false, label = 'Dungeon Master' }: { value: string; onChange: (v: string) => void; wide?: boolean; label?: string }) {
  const [cards, setCards] = useState<CardSummary[]>([])
  useEffect(() => {
    api.cards().then(setCards).catch(() => setCards([]))
  }, [])
  const cardId = personaCardId(value)
  const builtin = PERSONAS.find((p) => p.id === value)
  const hint = builtin?.blurb ?? (cardId ? 'A character from your library tells the story, in their own voice. They may argue with your out-of-character requests.' : '')
  const brings = builtin?.brings
  return (
    <div className={wide ? '' : 'py-1.5'}>
      <div className={`flex items-center gap-2 ${wide ? '' : 'justify-between'}`}>
        {!wide && <span className="text-sm text-parchment-300">{label}</span>}
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`input py-1.5 text-sm ${wide ? 'max-w-sm' : 'w-44'}`}>
          {PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {cards.length > 0 && (
            <optgroup label="From your character cards">
              {cards.map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {cardId && !cards.some((c) => c.id === cardId) && <option value={value}>A card no longer in the library</option>}
        </select>
      </div>
      {hint && <p className={`mt-1 text-xs text-parchment-500 ${wide ? '' : 'text-right'}`}>{hint}</p>}
      {brings && <p className={`mt-0.5 text-xs text-ember-400/90 ${wide ? '' : 'text-right'}`}>{brings}</p>}
    </div>
  )
}

/**
 * The storytellers as cards to choose from, RimWorld-style (the creator): who they are, and what
 * they bring about. Or one of the player's own characters, from the card library.
 */
export function StorytellerPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [cards, setCards] = useState<CardSummary[]>([])
  useEffect(() => {
    api.cards().then(setCards).catch(() => setCards([]))
  }, [])
  const cardId = personaCardId(value)
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PERSONAS.map((p) => {
          const on = p.id === value
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              aria-pressed={on}
              className={`no-drag flex cursor-pointer gap-3 rounded-xl border p-3 text-left transition-colors ${on ? 'border-gold-400/70 bg-gold-500/15' : 'border-white/10 bg-ink-850/60 hover:border-gold-500/40'}`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${on ? 'border-gold-400/70 text-gold-200' : 'border-gold-500/25 text-gold-400'}`}>
                <Icon name={p.icon} size={18} />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-sm tracking-wide text-gold-200">{p.name}</span>
                <span className="mt-0.5 block text-xs text-parchment-400">{p.blurb}</span>
                <span className="mt-1 block text-xs text-ember-400/90">{p.brings}</span>
              </span>
            </button>
          )
        })}
      </div>
      {(cards.length > 0 || cardId) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-parchment-400">
          <span>Or one of your own characters:</span>
          <span className="w-56">
            <select value={cardId ? value : ''} onChange={(e) => e.target.value && onChange(e.target.value)} className="input py-1.5 text-sm" aria-label="A character card as the storyteller">
              <option value="">Choose a card…</option>
              {cards.map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {c.name}
                </option>
              ))}
              {cardId && !cards.some((c) => c.id === cardId) && <option value={value}>A card no longer in the library</option>}
            </select>
          </span>
        </div>
      )}
    </div>
  )
}

/** Things the DM should avoid or fade to black (saved when the box loses focus). */
export function LimitsField({ value, onSave, wide = false }: { value: string; onSave: (v: string) => void; wide?: boolean }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <label className={`block ${wide ? '' : 'pt-2'}`}>
      {!wide && <span className="mb-1 block text-sm text-parchment-300">Avoid or fade to black</span>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onSave(text)}
        rows={2}
        maxLength={1000}
        placeholder="e.g. no harm to children; fade to black for intimacy"
        className="input resize-y py-1.5 text-sm"
      />
    </label>
  )
}
