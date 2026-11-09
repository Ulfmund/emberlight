import { createContext, useContext } from 'react'
import { cardImageUrl } from '@shared/cards'
import { mediaUrl } from '@shared/images'
import type { CampaignView } from '@shared/view'

/** Portraits from imported cards: the player's, and companions' for their speech bubbles. */

export const playerPortrait = (v: CampaignView) => {
  if (v.state.character.portrait) return mediaUrl(v.state.character.portrait)
  // A card's picture is for the character the story began with, not whoever took over.
  const p = v.state.fallen?.length ? undefined : v.cast?.find((m) => m.role === 'player' && m.hasImage)
  return p ? cardImageUrl(p.cardId) : undefined
}

/** Speaker name (lower case, full or first name) → picture. */
export function portraitMap(v: CampaignView): Record<string, string> {
  const out: Record<string, string> = {}
  // People in the Journal with a picture (a companion's card picture wins).
  for (const e of v.memory?.entities ?? []) {
    if (e.kind !== 'person' || !e.image) continue
    const url = mediaUrl(e.image)
    for (const n of [e.name, ...e.aliases]) {
      const full = n.toLowerCase().trim()
      if (full) out[full] = url
      const first = full.split(/\s+/)[0]
      if (first && !out[first] && !/^(the|a|an)$/.test(first)) out[first] = url
    }
  }
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
