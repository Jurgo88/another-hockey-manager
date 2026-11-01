import { beforeAll, describe, expect, it } from 'vitest'
import type { PlayoffSeries } from '../src/domain/playoff.js'
import { seriesWinner } from '../src/engine/playoff.js'
import {
  advanceDay,
  isRegularSeasonOver,
  isSeasonOver,
  startSeason,
  type PlayedFixture,
  type SeasonState,
} from '../src/season/index.js'

const SEED = 41
const REGULAR_FIXTURES = 1344
const MIN_STARTER_SHARE = 0.8

let end: SeasonState
let playoffFixtures: PlayedFixture[]
let straight: PlayedFixture[]
let fromSaved: PlayedFixture[]

/** A whole Season. With `saved`, the state goes through JSON after every day. */
async function playThrough(saved: boolean): Promise<{ end: SeasonState; all: PlayedFixture[] }> {
  let state = await startSeason(SEED)
  const all: PlayedFixture[] = []
  while (!isSeasonOver(state)) {
    const day = advanceDay(state)
    all.push(...day.played)
    state = saved ? (JSON.parse(JSON.stringify(day.state)) as SeasonState) : day.state
  }
  return { end: state, all }
}

const allSeries = (state: SeasonState): readonly PlayoffSeries[] =>
  state.playoffs!.bracket.rounds.flatMap((round) => round.series)

const fixturesOf = (series: PlayoffSeries) =>
  playoffFixtures.filter(({ fixture }) =>
    [fixture.homeClubId, fixture.awayClubId].every(
      (id) => id === series.higherSeed.clubId || id === series.lowerSeed.clubId,
    ),
  )

beforeAll(async () => {
  const whole = await playThrough(false)
  end = whole.end
  straight = whole.all
  playoffFixtures = straight.slice(REGULAR_FIXTURES)
  fromSaved = (await playThrough(true)).all
}, 120_000)

describe('a Season to its champion', () => {
  it('runs from the first Fixture to a champion through saved state', () => {
    expect(end.playoffs!.champion).not.toBeNull()
    expect(fromSaved.map((p) => p.events)).toEqual(straight.map((p) => p.events))
  })

  it('plays four rounds of 8, 4, 2 and 1 series, each between four and seven games', () => {
    const { rounds } = end.playoffs!.bracket
    expect(rounds.map((round) => round.series.length)).toEqual([8, 4, 2, 1])
    for (const series of allSeries(end)) {
      const count = fixturesOf(series).length
      expect(count).toBeGreaterThanOrEqual(4)
      expect(count).toBeLessThanOrEqual(7)
      expect(seriesWinner(end.playoffs!, series)).not.toBeNull()
    }
  })

  it('crowns the winner of the Final', () => {
    const final = end.playoffs!.bracket.rounds[3]!.series[0]!
    expect(end.playoffs!.champion).toBe(seriesWinner(end.playoffs!, final)!.clubId)
  })

  it('moves only winners into the next round', () => {
    const { rounds } = end.playoffs!.bracket
    for (const [i, round] of rounds.slice(1).entries()) {
      const winners = rounds[i]!.series.map((s) => seriesWinner(end.playoffs!, s)!.clubId)
      const entrants = round.series.flatMap((s) => [s.higherSeed.clubId, s.lowerSeed.clubId])
      expect([...entrants].sort()).toEqual([...winners].sort())
    }
  })

  it('alternates venues 2-2-1-1-1 for the higher seed (FR-21)', () => {
    for (const series of allSeries(end)) {
      fixturesOf(series).forEach(({ fixture }, i) => {
        const higherAtHome = [0, 1, 4, 6].includes(i)
        const home = higherAtHome ? series.higherSeed : series.lowerSeed
        expect(fixture.homeClubId).toBe(home.clubId)
      })
    }
  })

  it('decides every game in overtime if need be, with no shootout (FR-09a)', () => {
    for (const { match } of playoffFixtures) {
      expect(match.result.winner).not.toBeNull()
      expect(match.result.decidedIn).not.toBe('shootout')
    }
  })

  it('keeps the declared starter in net, unlike the regular-Season rotation', () => {
    const starts = playoffFixtures.flatMap(({ input }) => [
      input.homeLineup.starter === end.lineups[input.homeClub.id]!.starter,
      input.awayLineup.starter === end.lineups[input.awayClub.id]!.starter,
    ])
    expect(starts.filter(Boolean).length / starts.length).toBeGreaterThan(MIN_STARTER_SHARE)
  })

  it('leaves the regular-Season table as it stood when the playoffs began', () => {
    expect(isRegularSeasonOver(end)).toBe(true)
    for (const row of end.standings) expect(row.gamesPlayed).toBe(84)
  })

  it('carries fatigue into the playoffs', () => {
    const first = playoffFixtures[0]!.input
    expect(first.homeClub.skaters.some((skater) => skater.fatigue > 0)).toBe(true)
  })

  it('refuses another day once there is a champion', () => {
    expect(() => advanceDay(end)).toThrow(/no Fixtures left/)
  })
})
