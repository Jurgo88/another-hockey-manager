import { describe, expect, it } from 'vitest'
import type { StandingsRow } from '../src/domain/standings.js'
import { compareStandings, sortStandings } from '../src/domain/standings.js'
import {
  NHL_2026_27,
  NHL_2026_27_CLUB_SEEDS,
  NHL_PLAYOFF_FORMAT,
} from '../src/data/nhl-2026-27.js'
import { qualify, seedPlayoffs } from '../src/engine/playoff.js'

const divisionOf = (clubId: string) =>
  NHL_2026_27.divisions.find((division) => division.clubIds.includes(clubId))!

/**
 * Builds a standings table where points are supplied per Club id. Any Club
 * not named gets a low, deterministic record, so a test only has to state the
 * part it cares about.
 */
function standings(points: Record<string, number> = {}): StandingsRow[] {
  return NHL_2026_27_CLUB_SEEDS.map((club, index) => {
    const division = divisionOf(club.id)
    const pts = points[club.id] ?? 50 + (index % 7)

    return {
      clubId: club.id,
      divisionId: division.id,
      conferenceId: division.conferenceId,
      gamesPlayed: 84,
      wins: Math.floor(pts / 2),
      losses: 84 - Math.floor(pts / 2),
      otLosses: pts % 2,
      points: pts,
      regulationWins: Math.floor(pts / 2) - 5,
      goalsFor: 250 + pts,
      goalsAgainst: 250,
    }
  })
}

describe('compareStandings', () => {
  const base: StandingsRow = {
    clubId: 'aaa',
    divisionId: 'atlantic',
    conferenceId: 'eastern',
    gamesPlayed: 84,
    wins: 40,
    losses: 40,
    otLosses: 4,
    points: 84,
    regulationWins: 30,
    goalsFor: 250,
    goalsAgainst: 250,
  }

  it('orders by points first', () => {
    const better = { ...base, clubId: 'bbb', points: 90 }
    expect(sortStandings([base, better])[0]!.clubId).toBe('bbb')
  })

  it('breaks a points tie on regulation wins', () => {
    const more = { ...base, clubId: 'bbb', regulationWins: 35 }
    expect(sortStandings([base, more])[0]!.clubId).toBe('bbb')
  })

  it('breaks a regulation-wins tie on goal differential', () => {
    const better = { ...base, clubId: 'bbb', goalsFor: 280 }
    expect(sortStandings([base, better])[0]!.clubId).toBe('bbb')
  })

  it('falls back to Club id so the ordering is total and deterministic', () => {
    const twin = { ...base, clubId: 'zzz' }
    expect(compareStandings(base, twin)).toBeLessThan(0)
    expect(compareStandings(twin, base)).toBeGreaterThan(0)
  })

  it('does not mutate its input', () => {
    const rows = [base, { ...base, clubId: 'bbb', points: 99 }]
    const snapshot = JSON.stringify(rows)
    sortStandings(rows)
    expect(JSON.stringify(rows)).toBe(snapshot)
  })
})

describe('qualify with the NHL format', () => {
  const seeds = qualify(NHL_PLAYOFF_FORMAT, standings(), NHL_2026_27)

  it('admits 16 Clubs', () => {
    expect(seeds).toHaveLength(16)
  })

  it('admits nobody twice', () => {
    expect(new Set(seeds.map((seed) => seed.clubId)).size).toBe(16)
  })

  it('admits three Clubs per division by division place', () => {
    for (const division of NHL_2026_27.divisions) {
      const viaDivision = seeds.filter(
        (seed) => seed.divisionId === division.id && seed.via === 'division',
      )
      expect(viaDivision).toHaveLength(3)
      expect(viaDivision.map((seed) => seed.rankInGroup).sort()).toEqual([1, 2, 3])
    }
  })

  it('admits two wild cards per conference', () => {
    for (const conference of NHL_2026_27.conferences) {
      const wildcards = seeds.filter(
        (seed) => seed.conferenceId === conference.id && seed.via === 'wildcard',
      )
      expect(wildcards).toHaveLength(2)
      expect(wildcards.map((seed) => seed.rankInGroup).sort()).toEqual([1, 2])
    }
  })

  it('admits eight Clubs per conference', () => {
    for (const conference of NHL_2026_27.conferences) {
      expect(seeds.filter((seed) => seed.conferenceId === conference.id)).toHaveLength(8)
    }
  })

  it('never gives a wild card more points than a division winner it did not displace', () => {
    // A wild card may out-point a division winner; that is legal. But it must
    // never out-point the third-place Club of its own division, or the
    // qualification order was applied wrongly.
    for (const wildcard of seeds.filter((seed) => seed.via === 'wildcard')) {
      const thirdInOwnDivision = seeds.find(
        (seed) =>
          seed.divisionId === wildcard.divisionId && seed.via === 'division' && seed.rankInGroup === 3,
      )!
      expect(wildcard.points).toBeLessThanOrEqual(thirdInOwnDivision.points)
    }
  })

  it('takes the genuinely best remaining Clubs as wild cards', () => {
    const table = standings({
      // Make one Metropolitan Club a runaway wild card.
      nyr: 96,
      nyi: 95,
    })
    const result = qualify(NHL_PLAYOFF_FORMAT, table, NHL_2026_27)
    const easternWildcards = result
      .filter((seed) => seed.conferenceId === 'eastern' && seed.via === 'wildcard')
      .map((seed) => seed.clubId)

    // With 96 and 95 points they are top-3 in their own division, so they
    // qualify as division seeds rather than wild cards.
    expect(easternWildcards).not.toContain('nyr')
    expect(result.find((seed) => seed.clubId === 'nyr')!.via).toBe('division')
  })
})

describe('seedPlayoffs with the NHL format', () => {
  const bracket = seedPlayoffs(NHL_PLAYOFF_FORMAT, standings(), NHL_2026_27)

  it('builds one first round of eight series', () => {
    expect(bracket.rounds).toHaveLength(1)
    expect(bracket.rounds[0]!.series).toHaveLength(8)
    expect(bracket.rounds[0]!.name).toBe('First Round')
  })

  it('puts every qualified Club in exactly one series', () => {
    const inSeries = bracket.rounds[0]!.series.flatMap((series) => [
      series.higherSeed.clubId,
      series.lowerSeed.clubId,
    ])
    expect(inSeries).toHaveLength(16)
    expect(new Set(inSeries).size).toBe(16)
    expect(new Set(inSeries)).toEqual(new Set(bracket.seeds.map((seed) => seed.clubId)))
  })

  it('makes every series best-of-seven', () => {
    for (const series of bracket.rounds[0]!.series) {
      expect(series.winsRequired).toBe(4)
    }
  })

  it('never matches Clubs from different conferences in the first round', () => {
    for (const series of bracket.rounds[0]!.series) {
      expect(series.higherSeed.conferenceId).toBe(series.lowerSeed.conferenceId)
    }
  })

  it('pairs the better division winner with the weaker wild card', () => {
    for (const conference of NHL_2026_27.conferences) {
      const conferenceSeries = bracket.rounds[0]!.series.filter(
        (series) => series.higherSeed.conferenceId === conference.id,
      )

      const winnerSeries = conferenceSeries.filter(
        (series) => series.lowerSeed.via === 'wildcard',
      )
      expect(winnerSeries).toHaveLength(2)

      const topWinnerSeries = winnerSeries.reduce((best, series) =>
        series.higherSeed.conferenceRank < best.higherSeed.conferenceRank ? series : best,
      )

      // The better division winner faces wild card 2, the weaker one.
      expect(topWinnerSeries.lowerSeed.rankInGroup).toBe(2)
    }
  })

  it('matches second against third inside each division', () => {
    const intraDivision = bracket.rounds[0]!.series.filter(
      (series) => series.higherSeed.via === 'division' && series.lowerSeed.via === 'division',
    )

    expect(intraDivision).toHaveLength(4)
    for (const series of intraDivision) {
      expect(series.higherSeed.divisionId).toBe(series.lowerSeed.divisionId)
      expect(series.higherSeed.rankInGroup).toBe(2)
      expect(series.lowerSeed.rankInGroup).toBe(3)
    }
  })

  it('gives home ice to the higher seed in every series', () => {
    for (const series of bracket.rounds[0]!.series) {
      expect(series.higherSeed.points).toBeGreaterThanOrEqual(series.lowerSeed.points)
    }
  })

  it('is deterministic for the same standings', () => {
    const again = seedPlayoffs(NHL_PLAYOFF_FORMAT, standings(), NHL_2026_27)
    expect(again).toEqual(bracket)
  })

  it('rejects a structure that cannot form the bracket', () => {
    const brokenFormat = {
      ...NHL_PLAYOFF_FORMAT,
      qualification: [{ kind: 'division-top', count: 3 }] as const,
    }
    expect(() => seedPlayoffs(brokenFormat, standings(), NHL_2026_27)).toThrow(
      /2 division winners and 2 wild cards/,
    )
  })
})
