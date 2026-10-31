import { describe, expect, it } from 'vitest'
import { SKATER_ATTRIBUTE_KEYS } from '../../src/domain/attributes.js'
import type { Club, Lineup, Tactics } from '../../src/domain/club.js'
import type { MatchEvent, MatchEndEvent } from '../../src/domain/event.js'
import type { PlayerId, Skater } from '../../src/domain/player.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../../src/data/nhl-2026-27.js'
import { buildNaiveLineup, DEFAULT_TACTICS } from '../../src/engine/lineup.js'
import { simulateFixture } from '../../src/engine/simulate.js'
import { createGeneratedRosterProvider } from '../../src/generate/roster.js'
import { foldMatch, points } from '../../src/stats/match.js'
import { fixtureBetween } from '../support/fixtures.js'

/**
 * Tier 3 (04-validation-targets.md): every Tactics dial has a measurable,
 * directionally correct effect. Rosters and seeds are held fixed and one dial
 * varies, on the home Club, so a difference can only come from that dial.
 */

const PAIRINGS_OF_CLUBS = 6
const FIXTURES_PER_PAIR = 300
const MEETINGS = 1000
const BEST_BEATS_WORST = 65

const provider = createGeneratedRosterProvider({
  structure: NHL_2026_27,
  seed: 77,
  clubIdentities: new Map(
    NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
  ),
})
const { clubs } = await provider.loadCompetition('nhl')

interface Aggregate {
  fixtures: number
  shotsFor: number
  shotsAgainst: number
  penalties: number
  meanDanger: number
  endFatigue: number
  firstLinePoints: number
  opposingFirstLinePoints: number
}

const firstLine = (lineup: Lineup): readonly PlayerId[] => {
  const { leftWing, centre, rightWing } = lineup.lines[0]
  return [leftWing, centre, rightWing]
}

function playAll(tactics: Partial<Tactics>): Aggregate {
  const total: Aggregate = {
    fixtures: 0,
    shotsFor: 0,
    shotsAgainst: 0,
    penalties: 0,
    meanDanger: 0,
    endFatigue: 0,
    firstLinePoints: 0,
    opposingFirstLinePoints: 0,
  }
  let dangerSum = 0
  let attempts = 0

  for (let pair = 0; pair < PAIRINGS_OF_CLUBS; pair++) {
    const home = clubs[2 * pair]!
    const away = clubs[2 * pair + 1]!
    const homeLineup = buildNaiveLineup(home, { ...DEFAULT_TACTICS, ...tactics })
    const awayLineup = buildNaiveLineup(away)
    const fixture = fixtureBetween(home.id, away.id)

    for (let i = 0; i < FIXTURES_PER_PAIR; i++) {
      const events = simulateFixture(
        { fixture, homeClub: home, awayClub: away, homeLineup, awayLineup },
        60_000 + pair * 1000 + i,
      )
      const match = foldMatch(fixture, events)
      const homeStats = match.clubs.get(home.id)!
      const pointsOf = (ids: readonly PlayerId[]) =>
        ids.reduce((sum, id) => {
          const skater = match.skaters.get(id)
          return sum + (skater ? points(skater) : 0)
        }, 0)

      total.fixtures++
      total.shotsFor += homeStats.shotsFor
      total.shotsAgainst += homeStats.shotsAgainst
      total.penalties += homeStats.penalties
      total.firstLinePoints += pointsOf(firstLine(homeLineup))
      total.opposingFirstLinePoints += pointsOf(firstLine(awayLineup))

      for (const event of events) {
        if (event.type === 'shot' && event.clubId === home.id && event.period !== 'SO') {
          dangerSum += event.danger
          attempts++
        }
      }
      total.endFatigue += endFatigueOf(events, home)
    }
  }

  total.meanDanger = dangerSum / attempts
  return total
}

function endFatigueOf(events: readonly MatchEvent[], club: Club): number {
  const { fatigue } = events.at(-1) as MatchEndEvent
  const values = club.skaters.map((skater) => fatigue[skater.id]!)
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

const skaterQuality = (skater: Skater) =>
  SKATER_ATTRIBUTE_KEYS.reduce((sum, key) => sum + skater.attributes[key], 0)

/** The naive builder run on inverted attributes, which picks the worst of everything. */
function worstLineup(club: Club): Lineup {
  const inverted = (skater: Skater): Skater => {
    const attributes = { ...skater.attributes }
    for (const key of SKATER_ATTRIBUTE_KEYS) attributes[key] = 21 - attributes[key]
    return { ...skater, attributes }
  }
  return buildNaiveLineup({
    ...club,
    skaters: [...club.skaters].sort((a, b) => skaterQuality(a) - skaterQuality(b)).map(inverted),
    goalies: [...club.goalies].reverse(),
  })
}

/** The same Roster under other ids, so a Club can meet itself. */
function twin(club: Club): Club {
  const rename = <T extends { id: string; clubId: string }>(player: T): T => ({
    ...player,
    id: `twin-${player.id}`,
    clubId: `twin-${club.id}`,
  })
  return {
    ...club,
    id: `twin-${club.id}`,
    skaters: club.skaters.map(rename),
    goalies: club.goalies.map(rename),
  }
}

function bestBeatsWorstRate(club: Club): number {
  const other = twin(club)
  const best = buildNaiveLineup(club)
  const worst = worstLineup(other)
  const fixture = fixtureBetween(club.id, other.id)
  const reversed = fixtureBetween(other.id, club.id)

  let wins = 0
  for (let i = 0; i < MEETINGS; i++) {
    const atHome = i % 2 === 0
    const input = atHome
      ? { fixture, homeClub: club, awayClub: other, homeLineup: best, awayLineup: worst }
      : { fixture: reversed, homeClub: other, awayClub: club, homeLineup: worst, awayLineup: best }
    const { result } = foldMatch(input.fixture, simulateFixture(input, 70_000 + i))
    if (result.winner === club.id) wins++
  }
  return (100 * wins) / MEETINGS
}

describe('Tier 3 - tactics are not placebos', () => {
  const none = playAll({})
  const aggressive = playAll({ aggression: 75 })
  const passive = playAll({ aggression: 25 })
  const shooting = playAll({ shotVolume: 75 })
  const selective = playAll({ shotVolume: 25 })
  const shortShifts = playAll({ shiftLength: 75 })
  const longShifts = playAll({ shiftLength: 25 })
  const exploit = playAll({ matchup: 'exploit' })
  const shutdown = playAll({ matchup: 'shutdown' })

  it('plays the same number of Fixtures under every dial', () => {
    expect(aggressive.fixtures).toBe(none.fixtures)
    expect(none.fixtures).toBe(PAIRINGS_OF_CLUBS * FIXTURES_PER_PAIR)
  })

  it('aggression raises shots for, shots against and penalties', () => {
    expect(aggressive.shotsFor).toBeGreaterThan(passive.shotsFor)
    expect(aggressive.shotsAgainst).toBeGreaterThan(passive.shotsAgainst)
    expect(aggressive.penalties).toBeGreaterThan(passive.penalties)
  })

  it('shotVolume raises shots and lowers their mean danger', () => {
    expect(shooting.shotsFor).toBeGreaterThan(selective.shotsFor)
    expect(shooting.meanDanger).toBeLessThan(selective.meanDanger)
  })

  it('shorter Shifts leave a Roster less tired at the end of a Fixture', () => {
    expect(shortShifts.endFatigue).toBeLessThan(longShifts.endFatigue)
  })

  it('exploit raises the first Line point production', () => {
    expect(exploit.firstLinePoints).toBeGreaterThan(none.firstLinePoints)
  })

  it('shutdown lowers the opposing first Line point production', () => {
    expect(shutdown.opposingFirstLinePoints).toBeLessThan(none.opposingFirstLinePoints)
  })

  it(`a Club's best Lineup beats its worst more than ${BEST_BEATS_WORST}% of the time`, () => {
    expect(bestBeatsWorstRate(clubs[0]!)).toBeGreaterThan(BEST_BEATS_WORST)
  })
})
