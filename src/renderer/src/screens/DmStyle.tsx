import { useEffect, useState } from 'react'
import { PERSONAS, personaCardId } from '@shared/personas'
import type { CardSummary } from '@shared/cards'
import { api } from '../api'

/**
 * Who the DM is: a built-in persona, or any character card from the library
 * (docs/spec/03-characters-and-cards.md#the-dm-is-a-card-too).
 */
export function PersonaPicker({ value, onChange, wide = false }: { value: string; onChange: (v: string) => void; wide?: boolean }) {
  const [cards, setCards] = useState<CardSummary[]>([])
  useEffect(() => {
    api.cards().then(setCards).catch(() => setCards([]))
  }, [])
  const cardId = personaCardId(value)
  const builtin = PERSONAS.find((p) => p.id === value)
  const hint = builtin?.blurb ?? (cardId ? 'A character from your library tells the story, in their own voice. They may argue with your out-of-character requests.' : '')
  return (
    <div className={wide ? '' : 'py-1.5'}>
      <div className={`flex items-center gap-2 ${wide ? '' : 'justify-between'}`}>
        {!wide && <span className="text-sm text-parchment-300">Dungeon Master</span>}
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
