import { createContext, useContext } from 'react'
import { cardImageUrl } from '@shared/cards'
import type { CampaignView } from '@shared/view'

/** Portraits from imported cards: the player's, and companions' for their speech bubbles. */

export const playerPortrait = (v: CampaignView) => {
  const p = v.cast?.find((m) => m.role === 'player' && m.hasImage)
  return p ? cardImageUrl(p.cardId) : undefined
}

/** Speaker name (lower case, full or first name) → picture. */
export function portraitMap(v: CampaignView): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of v.cast ?? []) {
    if (m.role !== 'companion' || !m.hasImage) continue
    const url = cardImageUrl(m.cardId)
    const full = m.name.toLowerCase().trim()
    out[full] = url
    const first = full.split(/\s+/)[0]
    if (first && !out[first]) out[first] = url
  }
  return out
}

export const PortraitContext = createContext<Record<string, string>>({})

export function usePortrait(speaker: string): string | undefined {
  const map = useContext(PortraitContext)
  const s = speaker.toLowerCase().trim()
  return map[s] ?? map[s.split(/\s+/)[0]]
}
