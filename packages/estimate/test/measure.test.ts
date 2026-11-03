import { describe, expect, it } from 'vitest'
import { ageCurve, draftOutcomes, leaving, tableTurnover, turnoverOfPlayers, type AgeChange } from '../src/measure.js'
import type { LeagueHistory, SeasonSkater } from '../src/nhl/history.js'

const empty: LeagueHistory = { skaters: [], goalies: [], clubs: [], careers: [], draftPicks: [], speed: [] }

const skater = (playerId: number, season: number, birthYear: number, toi = 900): SeasonSkater => ({
  season,
  playerId,
  position: 'C',
  birthDate: `${birthYear}-01-01`,
  matchesPlayed: 60,
  toiPerMatch: toi,
  toi5v5PerMatch: toi * 0.8,
  points5v5: 20,
})

describe('age curves by the delta method', () => {
  it('finds the peak where the change turns negative', () => {
    const changes: AgeChange[] = []
    for (let age = 20; age <= 32; age++) {
      for (let i = 0; i < 30; i++) changes.push({ age, change: age < 26 ? 1 : -1, weight: 1 })
    }
    const curve = ageCurve(changes)
    expect(curve.peakAge).toBe(26)
    expect(curve.level.find((l) => l.age === 26)!.level).toBe(0)
    expect(curve.level.find((l) => l.age === 30)!.level).toBe(-4)
  })

  it('weighs a step by its sample and leaves out thin ages', () => {
    const curve = ageCurve(
      [
        ...Array.from({ length: 20 }, () => ({ age: 25, change: 1, weight: 3 })),
        ...Array.from({ length: 20 }, () => ({ age: 25, change: -1, weight: 1 })),
        ...Array.from({ length: 5 }, () => ({ age: 40, change: 9, weight: 1 })),
      ],
      20,
    )
    expect(curve.steps).toEqual([{ age: 25, pairs: 40, change: 0.5 }])
  })
})

describe('leaving the league', () => {
  it('counts who plays none the next season, by age and by ice time', () => {
    const history: LeagueHistory = {
      ...empty,
      skaters: [
        skater(1, 2015, 1980, 1200), // 35, top third, leaves
        skater(2, 2015, 1995, 1000), // 20, stays
        skater(2, 2016, 1995, 1000),
        skater(3, 2015, 1990, 600), // 25, bottom third, leaves
        skater(4, 2016, 1990, 900), // only in the last season, not counted
      ],
    }
    const { byAge, byTier } = leaving(history)
    expect(byAge.find((r) => r.group === '34-36')).toMatchObject({ players: 1, left: 1 })
    expect(byAge.find((r) => r.group === '23 or younger')).toMatchObject({ players: 1, left: 0 })
    expect(byTier[0]).toMatchObject({ players: 1, left: 1 })
    expect(byTier.reduce((sum, r) => sum + r.players, 0)).toBe(3)
    expect(turnoverOfPlayers(history).leaving).toBe(2)
  })
})

describe('draft outcomes', () => {
  it('measures each round against the picks made, not the Players found', () => {
    const history: LeagueHistory = {
      ...empty,
      draftPicks: [{ year: 2012, round: 1, picks: 4 }],
      careers: [
        { playerId: 1, goalie: false, draftYear: 2012, draftRound: 1, firstSeason: 2013, matchesPlayed: 500 },
        { playerId: 2, goalie: false, draftYear: 2012, draftRound: 1, firstSeason: 2015, matchesPlayed: 30 },
      ],
    }
    expect(draftOutcomes(history, [2012])).toEqual([
      { round: 1, picks: 4, reached: 0.5, regulars: 0.25, yearsToDebut: 2 },
    ])
  })
})

describe('the table over time', () => {
  it('measures how much of a table carries into the next', () => {
    const codes = ['A', 'B', 'C', 'D']
    const history: LeagueHistory = {
      ...empty,
      clubs: [2015, 2016, 2017].flatMap((season) =>
        codes.map((code, i) => ({ season, code, pointShare: 0.7 - i * 0.1 })),
      ),
    }
    const turnover = tableTurnover(history, 1)
    expect(turnover.yearToYear).toBeCloseTo(1)
    expect(turnover.topStays).toBe(1)
    expect(turnover.longestTopRun).toEqual({ code: 'A', seasons: 3 })
    expect(turnover.distinctFirst).toBe(1)
  })
})
