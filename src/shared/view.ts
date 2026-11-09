import type { CampaignSettings, CharacterBuild, CheckResult, GameState, Hunger, SkillId, Weapon } from './rules'
import type { Journey } from './journey'
import type { TimelineEntry } from './timeline'
import type { Memory } from './memory'

/** What the interface gets for one campaign. Built by the server from the save file. */

export type ChangeLine = { text: string; tone: 'good' | 'bad' | 'neutral'; icon: string }

export type MessageView = {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking: string
  hidden: boolean
  kind?: string
  error?: string
  notice?: string
  requestCheck?: { skill: SkillId; difficulty: string; reason: string; hidden: boolean }
  /** Alternate versions (swipes) of this message. */
  swipe?: { index: number; count: number; ids: string[] }
  checks: CheckResult[]
  changes: ChangeLine[]
  createdAt: number
  /** A picture the player showed with this message (media id). */
  image?: string
}

export type CampaignView = {
  id: string
  name: string
  settings: CampaignSettings
  build: CharacterBuild
  state: GameState
  derived: {
    maxHp: number
    maxStamina: number
    maxMana: number
    attrCaps: Record<string, number>
    skillCaps: Record<string, number>
    skillLevels: Record<string, number>
    renownTier: string
    xpIntoLevel: number
    xpForNext: number
    defense: number
    weapon: Weapon
    /** Kilograms carried, and the comfortable limit. */
    carried: number
    capacity: number
    load: 'none' | 'encumbered' | 'overloaded'
    needs: { hunger: Hunger; exhaustion: number; hoursSinceMeal: number; hoursAwake: number }
  }
  /** Cards in this story: the player's own (for the portrait) and companions the DM plays. */
  cast: { cardId: string; role: 'player' | 'companion'; name: string; hasImage: boolean }[]
  /** People, places and summaries remembered on this branch of the story. */
  memory: Memory
  /** Where the character has been, and the ways between (the Journal's map). */
  journey: Journey
  /** The story's milestones, day by day (the Journal's timeline), oldest first. */
  timeline: TimelineEntry[]
  /** Library lorebooks attached to this story. */
  lorebooks: { id: string; name: string; entries: number }[]
  messages: MessageView[]
  /** The newest message is the player's and the DM hasn't answered yet. */
  awaitingNarration: boolean
  /** The message the story ends at now (a screen sends it back, so a stale screen can't move the story). */
  headId: string | null
  /** Changes whenever anything in the adventure does (db.stamp): other screens compare it to catch up. */
  stamp: string
  /** The DM is answering a turn right now, sent from some screen (only on a plain fetch of the view). */
  answering?: boolean
  saves: { id: string; name: string; messageId: string; createdAt: number }[]
}

export type CampaignSummary = {
  id: string
  name: string
  characterName: string
  race: string
  sex: string
  background: string
  level: number
  status: string
  location: string | null
  day: number
  updatedAt: number
  /** The player's card, if their portrait comes from one. */
  portraitId?: string
}

/** Streamed while a turn is being played out. */
export type TurnEvent =
  | { type: 'player'; message: MessageView }
  | { type: 'checks'; checks: CheckResult[]; deathRoll?: { roll: number; success: boolean } }
  | { type: 'narration_start'; messageId: string }
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'view'; view: CampaignView }
  | { type: 'error'; message: string }
  | { type: 'notice'; message: string }
