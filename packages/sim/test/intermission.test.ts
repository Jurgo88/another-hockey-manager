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

const inputWith = (intermissions: FixtureInput['intermissions'] = []): FixtureInput => ({
  fixture: fixtureBetween(home.id, away.id),
  homeClub: home,
  awayClub: away,
  homeLineup,
  awayLineup,
  intermissions,
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

describe('a change at an intermission (ADR-016)', () => {
  it('leaves every event before it byte-identical, for every seed', () => {
    for (let seed = 0; seed < FIXTURES; seed++) {
      const plain = simulateFixture(inputWith(), seed)
      const changed = simulateFixture(
        inputWith([{ afterPeriod: 1, clubId: home.id, lineup: reshuffled(homeLineup) }]),
        seed,
      )
      const end = periodEnd(plain, 1)
      expect(changed.slice(0, end + 1)).toEqual(plain.slice(0, end + 1))
      expect(changed[end + 1]).toMatchObject({ type: 'lineup_change', clubId: home.id })
      expect(changed.slice(end + 2)).not.toEqual(plain.slice(end + 1))
    }
  })

  it('stands in the stream and folds like any Fixture', () => {
    const input = inputWith([{ afterPeriod: 2, clubId: away.id, lineup: reshuffled(awayLineup) }])
    const events = simulateFixture(input, SEED)
    expect(events.at(-1)!.type).toBe('match_end')
    expect(foldMatch(input.fixture, events).result.winner).not.toBeNull()
  })

  it('replays from the stored input and seed (FR-02)', () => {
    const input = inputWith([{ afterPeriod: 2, clubId: home.id, lineup: reshuffled(homeLineup) }])
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
    const events = simulateFixture(inputWith([{ afterPeriod: 1, clubId: home.id, lineup }]), SEED)
    const after = events.slice(periodEnd(events, 1)).filter(isShift)
    const ours = after.filter((shift) => shift.clubId === home.id && shift.goalie !== null)
    expect(ours.every((shift) => shift.goalie === homeLineup.backup)).toBe(true)
  })

  it('keeps a Skater hurt earlier off the ice, whatever the new Lineup says', () => {
    let found = 0
    for (let seed = 0; seed < FIXTURES * 5 && found < 3; seed++) {
      const plain = simulateFixture(inputWith(), seed)
      const hurt = plain
        .slice(0, periodEnd(plain, 1))
        .filter(isInjury)
        .find((e) => !e.offIce && e.clubId === home.id && e.player !== homeLineup.starter)
      if (!hurt) continue
      found++
      const events = simulateFixture(
        inputWith([{ afterPeriod: 1, clubId: home.id, lineup: reshuffled(homeLineup) }]),
        seed,
      )
      const after = events.slice(periodEnd(events, 1)).filter(isShift)
      expect(after.some((shift) => shift.onIce.includes(hurt.player))).toBe(false)
    }
    expect(found).toBeGreaterThan(0)
  })
})

describe('following a Fixture (ADR-016)', () => {
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

  it('shows the first Period and nothing past it', () => {
    const { events } = fixtureSoFar(opened(), fixtureId)
    expect(events.at(-1)).toMatchObject({ type: 'period_end', period: 1 })
    expect(events.some((e) => e.type === 'period_start' && e.period === 2)).toBe(false)
  })

  it('plays the same Fixture when followed as when not', () => {
    let state = opened()
    state = continueFixture(state, fixtureId)
    state = continueFixture(state, fixtureId)
    state = continueFixture(state, fixtureId)

    const shown = fixtureSoFar(state, fixtureId).events
    const followed = advanceDay(state).played.find((p) => p.fixture.id === fixtureId)!
    const plain = advanceDay(start).played.find((p) => p.fixture.id === fixtureId)!
    expect(shown).toEqual(plain.events)
    expect(followed.events).toEqual(plain.events)
  })

  it('takes a change into the Fixture that advanceDay then plays', () => {
    let state = opened()
    const { lineups } = fixtureSoFar(state, fixtureId)
    state = continueFixture(state, fixtureId, [{ clubId, lineup: reshuffled(lineups[clubId]!) }])

    const { played, state: after } = advanceDay(state)
    const ours = played.find((p) => p.fixture.id === fixtureId)!
    expect(ours.events.some((e) => e.type === 'lineup_change')).toBe(true)
    expect(ours.input.intermissions).toHaveLength(1)
    expect(after.live).toEqual({})
  })

  it('survives being stored as JSON at an intermission', () => {
    const state = continueFixture(opened(), fixtureId)
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
    let state = opened()
    for (let i = 0; i < 3; i++) state = continueFixture(state, fixtureId)
    expect(() => continueFixture(state, fixtureId)).toThrow(/shown to its end/)
  })
})
