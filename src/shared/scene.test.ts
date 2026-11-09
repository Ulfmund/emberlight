import { describe, expect, it } from 'vitest'
import { BEDS, MOODS, sceneOf, soundscape, tracksFor, type Scene, type Track } from './scene'
import { applyEvent, DEFAULT_SETTINGS, initialState, PLACE_KINDS, storyMinute, weatherNow, weatherPassed, WEATHERS, type CharacterBuild } from './rules'
import { WORLD_EVENTS } from './rules/encounters'

const scene = (s: Partial<Scene> = {}): Scene => ({ place: 'road', night: false, weather: null, combat: false, dead: false, horror: false, ...s })

describe('the soundscape', () => {
  it('reads the scene from the game: the hour, a fight, a death, the tone', () => {
    const build: CharacterBuild = {
      name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
      attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
    }
    const st = initialState(build, DEFAULT_SETTINGS)
    const at = (hour: number) => sceneOf({ ...st, time: { ...st.time, minute: hour * 60 } }, DEFAULT_SETTINGS)
    expect(at(12).night).toBe(false)
    expect(at(22).night).toBe(true)
    expect(at(3).night).toBe(true)
    expect(at(6).night).toBe(false)
    expect(sceneOf({ ...st, weather: 'rain' }, { ...DEFAULT_SETTINGS, tone: 'horror' })).toMatchObject({ weather: 'rain', horror: true, combat: false, dead: false, boss: false, foes: 0, hurt: false })
    expect(sceneOf({ ...st, character: { ...st.character, hp: 3 } }, DEFAULT_SETTINGS).hurt).toBe(true)
    expect(sceneOf({ ...st, character: { ...st.character, status: 'dead' } }, DEFAULT_SETTINGS).dead).toBe(true)
  })

  it('plays the place: birds in the forest by day, crickets and owls by night', () => {
    const day = soundscape(scene({ place: 'forest' }))
    expect(day.music).toBe('explore')
    expect(day.beds.birds).toBeGreaterThan(0.4)
    const night = soundscape(scene({ place: 'forest', night: true }))
    expect(night.music).toBe('night')
    expect(night.beds.birds).toBeUndefined()
    expect(night.beds.crickets).toBeGreaterThan(0)
    expect(night.beds.owl).toBeGreaterThan(0)
    expect(soundscape(scene({ place: 'town' })).music).toBe('town')
    expect(soundscape(scene({ place: 'underground' })).beds.drips).toBeGreaterThan(0.4)
    // Inside a tavern at night it's still the tavern, not the night road.
    const inn = soundscape(scene({ place: 'indoors', night: true }))
    expect(inn.music).toBe('town')
    expect(inn.beds.tavern).toBeGreaterThan(0)
    expect(inn.beds.fire).toBeGreaterThan(0)
    // Nowhere in particular sounds like the road.
    expect(soundscape(scene({ place: null }))).toEqual(soundscape(scene({ place: 'road' })))
  })

  it('lets the weather in, muffled when under a roof', () => {
    const out = soundscape(scene({ place: 'forest', weather: 'rain' }))
    expect(out.beds.rain).toBeGreaterThan(0.5)
    expect(out.beds.birds).toBeUndefined()
    const inn = soundscape(scene({ place: 'indoors', weather: 'rain' }))
    expect(inn.beds.rain).toBeGreaterThan(0)
    expect(inn.beds.rain).toBeLessThan(out.beds.rain!)
    expect(inn.beds.tavern).toBeGreaterThan(0)
    const storm = soundscape(scene({ place: 'road', night: true, weather: 'storm' }))
    expect(storm.beds.storm).toBeGreaterThan(0.6)
    expect(storm.beds.crickets).toBeUndefined()
    expect(soundscape(scene({ place: 'hills', weather: 'fog' })).beds.wind).toBeGreaterThanOrEqual(0.35)
    expect(soundscape(scene({ place: 'forest', weather: 'snow' })).beds.birds).toBeUndefined()
    expect(soundscape(scene({ place: 'forest', weather: 'clear' }))).toEqual(soundscape(scene({ place: 'forest' })))
  })

  it('a fight takes over quickly; a death is mourned; horror turns the wilds eerie', () => {
    const calm = soundscape(scene({ place: 'forest' }))
    const fight = soundscape(scene({ place: 'forest', combat: true }))
    expect(fight.music).toBe('combat')
    expect(fight.fade).toBeLessThan(calm.fade)
    expect(fight.beds.birds).toBeCloseTo(calm.beds.birds! / 2)
    expect(soundscape(scene({ place: 'forest', combat: true, dead: true })).music).toBe('sorrow')
    expect(soundscape(scene({ place: 'forest', horror: true })).music).toBe('eerie')
    expect(soundscape(scene({ place: 'ruin', horror: true })).music).toBe('eerie')
    // A town is still a town, even in a horror story; and a fight is still a fight.
    expect(soundscape(scene({ place: 'town', horror: true })).music).toBe('town')
    expect(soundscape(scene({ place: 'forest', horror: true, combat: true })).music).toBe('combat')
  })

  it('a boss gets its own music; the moment is calm or intense', () => {
    expect(soundscape(scene({ place: 'ruin', combat: true, boss: true })).music).toBe('boss')
    expect(soundscape(scene({ combat: true, foes: 1 })).intensity).toBe('calm')
    expect(soundscape(scene({ combat: true, foes: 3 })).intensity).toBe('intense')
    expect(soundscape(scene({ combat: true, foes: 1, hurt: true })).intensity).toBe('intense')
    expect(soundscape(scene({ combat: true, boss: true })).intensity).toBe('intense')
    expect(soundscape(scene({ place: 'ruin' })).intensity).toBe('intense')
    expect(soundscape(scene({ place: 'town' })).intensity).toBe('calm')
  })

  it("picks the player's tracks that suit the moment", () => {
    const track = (id: string, tags: Track['tags'], intensity?: Track['intensity']): Track => ({ id, name: id, kind: 'music', tags, intensity, volume: 1, mime: 'audio/ogg', size: 1 })
    const mine = [track('skirmish', ['combat'], 'calm'), track('onslaught', ['combat'], 'intense'), track('any fight', ['combat']), track('road', ['explore'])]
    expect(tracksFor(mine, 'combat', 'intense').map((t) => t.id)).toEqual(['onslaught', 'any fight'])
    expect(tracksFor(mine, 'combat', 'calm').map((t) => t.id)).toEqual(['skirmish', 'any fight'])
    // No boss tracks: the fight ones will do. Nothing that fits the moment: any for the mood.
    expect(tracksFor(mine, 'boss', 'intense').map((t) => t.id)).toEqual(['onslaught', 'any fight'])
    expect(tracksFor([track('lullaby', ['night'], 'calm')], 'night', 'intense').map((t) => t.id)).toEqual(['lullaby'])
    expect(tracksFor(mine, 'sorrow', 'calm')).toEqual([])
  })

  it('always gives known music and sane levels, whatever the scene', () => {
    for (const place of [...PLACE_KINDS, null])
      for (const weather of [...WEATHERS, null])
        for (const night of [false, true])
          for (const combat of [false, true])
            for (const horror of [false, true]) {
              const s = soundscape(scene({ place, weather, night, combat, horror }))
              expect(MOODS).toContain(s.music)
              for (const [bed, level] of Object.entries(s.beds)) {
                expect(BEDS).toContain(bed)
                expect(level).toBeGreaterThan(0)
                expect(level).toBeLessThanOrEqual(1)
              }
              expect(s.fade).toBeGreaterThan(0)
            }
  })

  it('lets the weather blow over in its own time', () => {
    const t = (day: number, hour: number) => ({ day, minute: hour * 60 })
    const rain = { weather: 'rain' as const, weatherAt: storyMinute(t(1, 8)) }
    expect(weatherNow({ ...rain, time: t(1, 15) })).toBe('rain')
    expect(weatherPassed({ ...rain, time: t(1, 15) })).toBeNull()
    expect(weatherNow({ ...rain, time: t(1, 17) })).toBe('clear')
    expect(weatherPassed({ ...rain, time: t(1, 17) })).toBe('rain')
    expect(weatherPassed({ ...rain, time: t(2, 8) })).toBeNull()
    expect(weatherNow({ weather: 'storm', weatherAt: storyMinute(t(3, 22)), time: t(4, 2) })).toBe('clear')
    expect(weatherNow({ weather: 'clear', weatherAt: 0, time: t(9, 8) })).toBe('clear')
    expect(weatherNow({ time: t(1, 8) })).toBeNull()
    // The event marks when it turned; the soundscape hears rain only while it lasts.
    const build: CharacterBuild = {
      name: 'Brenna Rook', race: 'human', sex: 'female', age: 'adult', background: 'hunter', humanBonus: ['AGI', 'WIT'],
      attributes: { STR: 9, AGI: 15, END: 12, INT: 10, ARC: 9, WIT: 14, PRE: 10 }, skills: {}, appearance: '', personality: ''
    }
    const wet = applyEvent(initialState(build, DEFAULT_SETTINGS), { type: 'weather', weather: 'rain' }, DEFAULT_SETTINGS)
    expect(wet.weatherAt).toBe(storyMinute(wet.time))
    expect(sceneOf(wet, DEFAULT_SETTINGS).weather).toBe('rain')
    const later = applyEvent(wet, { type: 'time', minutes: 10 * 60 }, DEFAULT_SETTINGS)
    expect(sceneOf(later, DEFAULT_SETTINGS).weather).toBe('clear')
  })

  it('every weather event changes the weather', () => {
    const weatherEvents = WORLD_EVENTS.filter((e) => e.kind === 'weather')
    expect(weatherEvents.length).toBeGreaterThan(0)
    for (const e of weatherEvents) expect(WEATHERS).toContain(e.weather)
  })
})
