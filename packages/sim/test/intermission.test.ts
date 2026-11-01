import { beforeAll, describe, expect, it } from 'vitest'
import type { Club, Lineup } from '../src/domain/club.js'
import type { InjuryEvent, MatchEvent, ShiftChangeEvent } from '../src/domain/event.js'
import type { FixtureInput } from '../src/domain/fixture.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'
import { buildNaiveLineup, swapSlots } from '../src/engine/lineup.js'
import { simulateFixture } from '../src/engine/simulate.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import {
  advanceDay,
  continueFixture,
  fixtureSoFar,
  InvalidLineupError,
  openFixture,
  setLineup,
  startSeason,
  type SeasonState,
} from '../src/season/index.js'
import { foldMatch } from '../src/stats/match.js'
import { fixtureBetween } from './support/fixtures.js'

const SEED = 9
const FIXTURES = 60

let home: Club
let away: Club
let homeLineup: Lineup
let awayLineup: Lineup

beforeAll(async () => {
  const provider = createGeneratedRosterProvider({
    structure: NHL_2026_27,
    seed: 2026,
    clubIdentities: new Map(
      NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
    ),
  })
  const { clubs } = await provider.loadCompetition('nhl')
  home = clubs[0]!
  away = clubs[1]!
  homeLineup = buildNaiveLineup(home)
  awayLineup = buildNaiveLineup(away)
})

const inputWith = (changes: FixtureInput['changes'] = []): FixtureInput => ({
  fixture: fixtureBetween(home.id, away.id),
  homeClub: home,
  awayClub: away,
  homeLineup,
  awayLineup,
  changes,
})

const periodEnd = (events: readonly MatchEvent[], period: 1 | 2) =>
  events.findIndex((e) => e.type === 'period_end' && e.period === period)

const isShift = (e: MatchEvent): e is ShiftChangeEvent => e.type === 'shift_change'
const isInjury = (e: MatchEvent): e is InjuryEvent => e.type === 'injury'

/** The first Line and the last swapped, and the Tactics turned up. */
const reshuffled = (lineup: Lineup): Lineup => {
  const [first, second, third, fourth] = lineup.lines
  return {
    ...lineup,
    lines: [fourth, second, third, first],
    tactics: { ...lineup.tactics, aggression: 95 },
  }
}

describe('a change during a Fixture (ADR-018)', () => {
  it('leaves every event before an intermission change byte-identical', () => {
    for (let seed = 0; seed < FIXTURES; seed++) {
      const plain = simulateFixture(inputWith(), seed)
      const end = periodEnd(plain, 1)
      const changed = simulateFixture(
        inputWith([{ afterEvent: end + 1, clubId: home.id, lineup: reshuffled(homeLineup) }]),
        seed,
      )
      expect(changed.slice(0, end + 1)).toEqual(plain.slice(0, end + 1))
      expect(changed[end + 1]).toMatchObject({ type: 'lineup_change', clubId: home.id })
      expect(changed.slice(end + 2)).not.toEqual(plain.slice(end + 1))
    }
  })

  it('leaves every event before it byte-identical at any moment of a Period', () => {
    for (let seed = 0; seed < FIXTURES; seed++) {
      const plain = simulateFixture(inputWith(), seed)
      const afterEvent = 40 + (seed * 37) % (plain.length - 80)
      const changed = simulateFixture(
        inputWith([{ afterEvent, clubId: home.id, lineup: reshuffled(homeLineup) }]),
        seed,
      )
      expect(changed.slice(0, afterEvent)).toEqual(plain.slice(0, afterEvent))
      const taken = changed.findIndex((e) => e.type === 'lineup_change')
      if (taken !== -1) expect(taken).toBeGreaterThanOrEqual(afterEvent)
    }
  })

  it('takes up several changes in turn, each leaving the one before it in place', () => {
    const first = simulateFixture(
      inputWith([{ afterEvent: 100, clubId: home.id, lineup: reshuffled(homeLineup) }]),
      SEED,
    )
    const both = simulateFixture(
      inputWith([
        { afterEvent: 100, clubId: home.id, lineup: reshuffled(homeLineup) },
        { afterEvent: 300, clubId: away.id, lineup: reshuffled(awayLineup) },
      ]),
      SEED,
    )
    expect(both.slice(0, 300)).toEqual(first.slice(0, 300))
    expect(both.filter((e) => e.type === 'lineup_change')).toHaveLength(2)
  })

  it('stands in the stream and folds like any Fixture', () => {
    const input = inputWith([{ afterEvent: 500, clubId: away.id, lineup: reshuffled(awayLineup) }])
    const events = simulateFixture(input, SEED)
    expect(events.at(-1)!.type).toBe('match_end')
    expect(foldMatch(input.fixture, events).result.winner).not.toBeNull()
  })

  it('replays from the stored input and seed (FR-02)', () => {
    const input = inputWith([{ afterEvent: 500, clubId: home.id, lineup: reshuffled(homeLineup) }])
    expect(simulateFixture(input, SEED)).toEqual(simulateFixture(input, SEED))
  })

  it('leaves a Fixture with no changes as it was', () => {
    const plain: FixtureInput = {
      fixture: fixtureBetween(home.id, away.id),
      homeClub: home,
      awayClub: away,
      homeLineup,
      awayLineup,
    }
    expect(simulateFixture(inputWith(), SEED)).toEqual(simulateFixture(plain, SEED))
  })

  it('puts the backup in net for the rest of the Fixture', () => {
    const lineup = { ...homeLineup, starter: homeLineup.backup, backup: homeLineup.starter }
    const end = periodEnd(simulateFixture(inputWith(), SEED), 1)
    const events = simulateFixture(
      inputWith([{ afterEvent: end + 1, clubId: home.id, lineup }]),
      SEED,
    )
    const after = events.slice(end + 1).filter(isShift)
    const ours = after.filter((shift) => shift.clubId === home.id && shift.goalie !== null)
    expect(ours.every((shift) => shift.goalie === homeLineup.backup)).toBe(true)
  })

  it('keeps a Skater hurt earlier off the ice, whatever the new Lineup says', () => {
    let found = 0
    for (let seed = 0; seed < FIXTURES * 5 && found < 3; seed++) {
      const plain = simulateFixture(inputWith(), seed)
      const end = periodEnd(plain, 1)
      const hurt = plain
        .slice(0, end)
        .filter(isInjury)
        .find((e) => !e.offIce && e.clubId === home.id && e.player !== homeLineup.starter)
      if (!hurt) continue
      found++
      const events = simulateFixture(
        inputWith([{ afterEvent: end + 1, clubId: home.id, lineup: reshuffled(homeLineup) }]),
        seed,
      )
      const after = events.slice(end + 1).filter(isShift)
      expect(after.some((shift) => shift.onIce.includes(hurt.player))).toBe(false)
    }
    expect(found).toBeGreaterThan(0)
  })
})

describe('following a Fixture (ADR-018)', () => {
  let start: SeasonState
  let fixtureId: string
  let clubId: string

  beforeAll(async () => {
    start = await startSeason(SEED)
    const first = start.fixtures[0]!
    fixtureId = first.id
    clubId = first.homeClubId
  })

  const opened = () => openFixture(start, fixtureId)

  /** Steps on until `phase`, and returns the state there. */
  function stepTo(state: SeasonState, phase: string): SeasonState {
    let current = state
    for (let i = 0; i < 200; i++) {
      if (fixtureSoFar(current, fixtureId).phase === phase) return current
      current = continueFixture(current, fixtureId)
    }
    throw new Error(`never reached ${phase}`)
  }

  it('starts with nothing shown', () => {
    const { events, phase } = fixtureSoFar(opened(), fixtureId)
    expect(phase).toBe('start')
    expect(events).toEqual([])
  })

  it('shows about a minute of play at a time', () => {
    const state = continueFixture(continueFixture(opened(), fixtureId), fixtureId)
    const { events, phase } = fixtureSoFar(state, fixtureId)
    expect(phase).toBe('running')
    expect(events.at(-1)!.clock).toBeLessThanOrEqual(120)
    expect(events.at(-1)!.clock).toBeGreaterThan(30)
  })

  it('stops at every intermission, and shows nothing past it', () => {
    const state = stepTo(opened(), 'intermission')
    const { events } = fixtureSoFar(state, fixtureId)
    expect(events.at(-1)).toMatchObject({ type: 'period_end', period: 1 })
  })

  it('plays the same Fixture when followed as when not', () => {
    const state = stepTo(opened(), 'ended')
    const shown = fixtureSoFar(state, fixtureId).events
    const followed = advanceDay(state).played.find((p) => p.fixture.id === fixtureId)!
    const plain = advanceDay(start).played.find((p) => p.fixture.id === fixtureId)!
    expect(followed.events).toEqual(plain.events)
    expect(shown).toEqual(plain.events.slice(0, shown.length))
    expect(plain.events.at(shown.length)?.type).toBe('match_end')
  })

  it('never changes what has been shown, whatever is chosen in mid-Period', () => {
    let state = opened()
    for (let i = 0; i < 6; i++) state = continueFixture(state, fixtureId)
    const before = fixtureSoFar(state, fixtureId)
    const lineup = reshuffled(before.lineups[clubId]!)

    state = continueFixture(state, fixtureId, [{ clubId, lineup }])
    const after = fixtureSoFar(state, fixtureId)
    expect(after.events.slice(0, before.events.length)).toEqual(before.events)
    expect(after.lineups[clubId]).toEqual(lineup)
  })

  it('reports fatigue on every Shift, rising from one to the next', () => {
    const { events } = fixtureSoFar(stepTo(opened(), 'ended'), fixtureId)
    const shifts = events.filter(isShift)
    const last = new Map<string, number>()
    for (const shift of shifts) {
      expect(shift.fatigue).toHaveLength(shift.onIce.length)
      shift.onIce.forEach((id, i) => {
        expect(shift.fatigue[i]!).toBeGreaterThanOrEqual(last.get(id) ?? 0)
        last.set(id, shift.fatigue[i]!)
      })
    }
    expect(Math.max(...last.values())).toBeGreaterThan(0)
  })

  it('keeps each Skater at their fatigue as last seen', () => {
    let state = opened()
    const atStart = fixtureSoFar(state, fixtureId).fatigue
    expect(Object.values(atStart).every((value) => value === 0)).toBe(true)

    state = stepTo(state, 'intermission')
    const { fatigue, events } = fixtureSoFar(state, fixtureId)
    const shift = events.filter(isShift).at(-1)!
    shift.onIce.forEach((id, i) => {
      expect(fatigue[id]).toBe(shift.fatigue[i])
    })
  })

  it('takes a change into the Fixture that advanceDay then plays', () => {
    let state = stepTo(opened(), 'running')
    const { lineups } = fixtureSoFar(state, fixtureId)
    state = continueFixture(state, fixtureId, [{ clubId, lineup: reshuffled(lineups[clubId]!) }])

    const { played, state: after } = advanceDay(state)
    const ours = played.find((p) => p.fixture.id === fixtureId)!
    expect(ours.events.some((e) => e.type === 'lineup_change')).toBe(true)
    expect(ours.input.changes).toHaveLength(1)
    expect(after.live).toEqual({})
  })

  it('survives being stored as JSON in mid-Period', () => {
    const state = stepTo(opened(), 'running')
    const saved = JSON.parse(JSON.stringify(state)) as SeasonState
    expect(fixtureSoFar(saved, fixtureId).events).toEqual(fixtureSoFar(state, fixtureId).events)
  })

  it('does not let a Manager go back: the Lineup is locked while followed', () => {
    const state = opened()
    expect(() => setLineup(state, clubId, state.lineups[clubId]!)).toThrow(/being followed/)
  })

  it('rejects a Player who is not dressed', () => {
    const state = opened()
    const lineup = fixtureSoFar(state, fixtureId).lineups[clubId]!
    const club = state.clubs.find((candidate) => candidate.id === clubId)!
    const third = club.goalies.find((g) => g.id !== lineup.starter && g.id !== lineup.backup)!

    expect(() =>
      continueFixture(state, fixtureId, [{ clubId, lineup: { ...lineup, backup: third.id } }]),
    ).toThrow(InvalidLineupError)
  })

  describe('with a Skater out of position after injuries (ADR-012)', () => {
    /** Every natural centre out, so wingers have to stand in. */
    const shortOfCentres = (): SeasonState => {
      const club = start.clubs.find((candidate) => candidate.id === clubId)!
      const centres = club.skaters.filter((skater) => skater.preferredPositions.includes('C'))
      const absent = Object.fromEntries(centres.map((skater) => [skater.id, 5]))
      return openFixture({ ...start, absent }, fixtureId)
    }

    it('lets a Manager rearrange around them', () => {
      const state = shortOfCentres()
      const lineup = fixtureSoFar(state, fixtureId).lineups[clubId]!
      const swapped = swapSlots(
        lineup,
        { group: 'line', index: 0, key: 'centre' },
        { group: 'line', index: 1, key: 'centre' },
      )
      const next = continueFixture(state, fixtureId, [{ clubId, lineup: swapped }])
      expect(next.live[fixtureId]!.changes).toHaveLength(1)
    })

    it('still refuses to put one more out of position', () => {
      const state = shortOfCentres()
      const lineup = fixtureSoFar(state, fixtureId).lineups[clubId]!
      const worse = swapSlots(
        lineup,
        { group: 'line', index: 0, key: 'leftWing' },
        { group: 'pairing', index: 0, key: 'leftDefence' },
      )
      expect(() => continueFixture(state, fixtureId, [{ clubId, lineup: worse }])).toThrow(
        InvalidLineupError,
      )
    })
  })

  it('rejects a Club that is not in the Fixture, and a Fixture not on the next day', () => {
    const lineup = opened().lineups[clubId]!
    expect(() => continueFixture(opened(), fixtureId, [{ clubId: 'nobody', lineup }])).toThrow(
      /not in Fixture/,
    )
    expect(() => openFixture(start, start.fixtures.at(-1)!.id)).toThrow(/not on the next day/)
  })

  it('stops once all of it has been shown', () => {
    const state = stepTo(opened(), 'ended')
    expect(() => continueFixture(state, fixtureId)).toThrow(/shown to its end/)
  })
})
