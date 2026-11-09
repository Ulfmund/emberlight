import {
  ageStage,
  ageYears,
  AGES,
  dateLabel,
  DAYS_PER_YEAR,
  foeRoster,
  SEASON_ICON,
  SEASON_INFO,
  seasonNumber,
  seasonOf,
  HOMES,
  spanLabel,
  spellById,
  yearOf,
  type GameEvent,
  type GameState
} from './rules'
import { applyMemoryEvent, emptyMemory, findEntity, isMemoryEvent, samePlace, type Memory, type MemoryEvent } from './memory'

/**
 * The timeline (docs/spec/07-memory-and-lore.md#timeline): the story's milestones, day by day.
 * Places first reached, deeds, fights and how they ended, quests taken on and finished, people
 * who came into the story or left it, levels, deaths. Built from the branch being played, in the
 * same pass as the game state, so a rewind takes it back too. It keeps the memory as it goes,
 * so the view needn't build it twice.
 */

export type TimelineEntry = { day: number; minute: number; text: string; icon: string; tone: 'good' | 'bad' | 'neutral' }

/** At most this many (the newest) go to the screen. */
export const TIMELINE_MAX = 400

const END_TEXT = { victory: 'Won a fight against', fled: 'Got away from', defeat: 'Lost a fight against', truce: 'Talked down', ended: 'A fight ended with' } as const

export class TimelineLog {
  readonly memory: Memory = emptyMemory()
  private counter = { n: 0 }
  private entries: TimelineEntry[] = []
  private visited: string[] = []

  private add(st: GameState, text: string, icon: string, tone: TimelineEntry['tone'] = 'neutral') {
    this.entries.push({ day: st.time.day, minute: st.time.minute, text, icon, tone })
  }

  see(ev: GameEvent, before: GameState, after: GameState) {
    if (isMemoryEvent(ev)) return this.seeMemory(ev, after)
    if (ev.type !== 'time_skip') this.seeTime(before, after)
    switch (ev.type) {
      case 'home': {
        const now = ev.home
        const was = before.home
        if (now) this.add(after, now.kind === 'room' ? `Took a room in ${now.place}` : `Bought ${HOMES[now.kind].label.toLowerCase()} in ${now.place}`, 'candle', 'good')
        else if (was) this.add(after, was.kind === 'room' ? `Gave up the room in ${was.place}` : `Sold ${HOMES[was.kind].label.toLowerCase().replace(/^an? /, 'the ')} in ${was.place}`, 'candle')
        break
      }
      case 'job':
        if (ev.job) this.add(after, `Took work as ${ev.job.title} in ${ev.job.place}`, 'hammer', 'good')
        else if (before.job) this.add(after, `Left work as ${before.job.title}`, 'hammer')
        break
      case 'time_skip': {
        const span = spanLabel(ev.days)
        this.add(after, `${span.charAt(0).toUpperCase()}${span.slice(1)} went by: ${dateLabel(after.time.day).toLowerCase()}`, 'hourglass')
        break
      }
      case 'location': {
        const name = ev.name.trim()
        if (!name || this.visited.some((v) => samePlace(v, name))) return
        this.visited.push(name)
        return this.add(after, `Came to ${name}`, 'map')
      }
      case 'renown':
        if (ev.deed?.trim()) this.add(after, ev.deed.trim().replace(/^./, (c) => c.toUpperCase()), 'laurel', 'good')
        break
      case 'combat_end': {
        const foes = before.combat?.foes ?? []
        this.add(after, foes.length ? `${END_TEXT[ev.outcome]} ${foeRoster(foes)}` : END_TEXT[ev.outcome].replace(/ (against|from|with)$/, ''), 'sword', ev.outcome === 'defeat' ? 'bad' : ev.outcome === 'victory' || ev.outcome === 'truce' ? 'good' : 'neutral')
        break
      }
      case 'status':
        if (ev.status === 'dead' && before.character.status !== 'dead') this.add(after, `${before.character.build.name} died: ${ev.reason}`, 'skull', 'bad')
        break
      case 'new_character':
        this.add(after, `${ev.build.name} took up the tale${ev.inherit ? `, as ${ev.fallen.name}'s child` : ''}`, 'user')
        break
      case 'party_join':
        this.add(after, `${ev.companion.name} joined you`, 'party', 'good')
        break
      case 'party_leave':
        this.add(after, ev.why === 'dead' ? `${ev.name ?? 'A companion'} died` : `${ev.name ?? 'A companion'} went their own way`, ev.why === 'dead' ? 'skull' : 'party', ev.why === 'dead' ? 'bad' : 'neutral')
        break
      case 'learn_spell':
        this.add(after, `Learned ${spellById(ev.id)?.name ?? ev.name ?? 'a spell'}`, 'sparkle', 'good')
        break
    }
    const same = after.character.build.name === before.character.build.name
    if (after.character.level > before.character.level && same) this.add(after, `Reached level ${after.character.level}`, 'star', 'good')
    if (same && ageStage(after) !== ageStage(before)) this.add(after, `${after.character.build.name} is ${AGES[ageStage(after)].label.toLowerCase()} now, at ${ageYears(after)}`, 'hourglass')
  }

  /** A season turning; or, in a jump (an heir's arrival, years skipped), the time that went by. */
  private seeTime(before: GameState, after: GameState) {
    const turned = seasonNumber(after.time.day) - seasonNumber(before.time.day)
    if (turned <= 0) return
    const day = after.time.day
    const years = Math.floor((day - before.time.day) / DAYS_PER_YEAR)
    if (years >= 1) return this.add(after, `${years === 1 ? 'A year' : `${years} years`} went by: ${dateLabel(day).toLowerCase()}`, 'hourglass')
    if (turned > 1) return this.add(after, `Months went by: ${dateLabel(day).toLowerCase()}`, 'hourglass')
    const s = seasonOf(day)
    this.add(after, `${SEASON_INFO[s].label} came${s === 'spring' ? `: year ${yearOf(day)} began` : ''}`, SEASON_ICON[s])
  }

  private seeMemory(ev: MemoryEvent, at: GameState) {
    if (ev.type !== 'entity') return void applyMemoryEvent(this.memory, ev, this.counter)
    // A record's state before and after, to tell what's new.
    const prior = findEntity(this.memory, ev.kind, ev.name, ev.aliases ?? [])
    const was = prior ? { status: prior.status, standing: prior.standing } : null
    applyMemoryEvent(this.memory, ev, this.counter)
    const now = findEntity(this.memory, ev.kind, ev.name, ev.aliases ?? [])
    if (!now) return
    if (!was) {
      if (now.kind === 'person') this.add(at, `${now.name}${now.summary ? `, ${now.summary.replace(/\.$/, '')}` : ''}, came into the story`, 'user')
      else if (now.kind === 'quest') this.add(at, `Took on: ${now.name}${now.giver ? ` (for ${now.giver})` : ''}`, 'star')
      else if (now.kind === 'item' && now.holder === 'you') this.add(at, `Came by ${now.name}`, 'amulet', 'good')
    } else if (was.status !== now.status) {
      if (now.kind === 'quest' && now.status === 'done') this.add(at, `Done: ${now.name}`, 'star', 'good')
      else if (now.kind === 'quest' && now.status === 'failed') this.add(at, `Failed: ${now.name}`, 'star', 'bad')
      else if (now.kind === 'person' && now.status === 'dead') this.add(at, `${now.name} died`, 'skull', 'bad')
    }
    // Only when it moved: a group that already honours (or hates) the character can't go further.
    const moved = (now.standing ?? 0) - (was?.standing ?? 0)
    if (now.kind === 'faction' && ev.standingChange && moved) {
      const why = now.facts.at(-1)?.replace(/\s*\([+−-]\d\)$/, '')
      this.add(at, `${now.name} ${moved > 0 ? 'thinks better of you' : 'thinks worse of you'}${why ? `: ${why}` : ''}`, 'party', moved > 0 ? 'good' : 'bad')
    }
  }

  done(): TimelineEntry[] {
    return this.entries.slice(-TIMELINE_MAX)
  }
}
