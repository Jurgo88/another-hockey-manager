import { describe, expect, it } from 'vitest'
import { NHL_2026_27, NHL_PLAYOFF_FORMAT } from '../src/data/nhl-2026-27.js'
import type { ClubId } from '../src/domain/player.js'
import { qualify } from '../src/engine/playoff.js'
import type { Decision, MatchStats } from '../src/stats/match.js'
import { conferenceTables, divisionTables, foldStandings } from '../src/stats/standings.js'

const [BOS, TOR, MTL] = ['bos', 'tor', 'mtl'] as const

/** A played Match with only what standings read: the Clubs and the result. */
function played(
  home: ClubId,
  away: ClubId,
  homeGoals: number,
  awayGoals: number,
  decidedIn: Decision = 'regulation',
  id = `${home}-${away}-${homeGoals}-${awayGoals}`,
): MatchStats {
  return {
    fixtureId: id,
    homeClubId: home,
    awayClubId: away,
    result: {
      homeGoals,
      awayGoals,
      decidedIn,
      winner: homeGoals > awayGoals ? home : homeGoals < awayGoals ? away : null,
      shootout: decidedIn === 'shootout' ? { homeGoals: 1, awayGoals: 0 } : null,
    },
    periods: [],
    fatigue: new Map(),
    injuries: [],
    scoring: [],
    clubs: new Map(),
    skaters: new Map(),
    goalies: new Map(),
  }
}

const rowOf = (rows: ReturnType<typeof foldStandings>, clubId: ClubId) =>
  rows.find((row) => row.clubId === clubId)!

describe('foldStandings', () => {
  it('lists every Club in the structure, played or not', () => {
    const rows = foldStandings(NHL_2026_27, [])
    expect(rows).toHaveLength(32)
    expect(rows.every((row) => row.gamesPlayed === 0 && row.points === 0)).toBe(true)
    expect(rowOf(rows, BOS)).toMatchObject({ divisionId: 'atlantic', conferenceId: 'eastern' })
  })

  it('awards 2 for a win and 0 for a regulation loss', () => {
    const rows = foldStandings(NHL_2026_27, [played(BOS, TOR, 4, 2)])
    expect(rowOf(rows, BOS)).toMatchObject({
      wins: 1,
      regulationWins: 1,
      points: 2,
      goalsFor: 4,
      goalsAgainst: 2,
    })
    expect(rowOf(rows, TOR)).toMatchObject({
      losses: 1,
      otLosses: 0,
      points: 0,
      goalsFor: 2,
      goalsAgainst: 4,
    })
  })

  it('awards 1 for an overtime or shootout loss, and no regulation win to the winner', () => {
    const rows = foldStandings(NHL_2026_27, [
      played(BOS, TOR, 3, 2, 'overtime'),
      played(MTL, BOS, 3, 2, 'shootout'),
    ])
    expect(rowOf(rows, BOS)).toMatchObject({ wins: 1, regulationWins: 0, otLosses: 1, points: 3 })
    expect(rowOf(rows, TOR)).toMatchObject({ losses: 0, otLosses: 1, points: 1 })
    expect(rowOf(rows, MTL)).toMatchObject({ wins: 1, regulationWins: 0, points: 2, goalsFor: 3 })
  })

  it('reconciles points and games played against the Fixtures', () => {
    const matches = [
      played(BOS, TOR, 4, 2),
      played(TOR, MTL, 1, 2, 'overtime'),
      played(MTL, BOS, 3, 2, 'shootout'),
      played(BOS, MTL, 5, 1),
    ]
    const rows = foldStandings(NHL_2026_27, matches)
    const sum = (read: (row: (typeof rows)[number]) => number) =>
      rows.reduce((s, r) => s + read(r), 0)
    const extraTime = matches.filter((m) => m.result.decidedIn !== 'regulation').length

    expect(sum((r) => r.gamesPlayed)).toBe(2 * matches.length)
    expect(sum((r) => r.wins)).toBe(matches.length)
    expect(sum((r) => r.points)).toBe(2 * matches.length + extraTime)
    expect(sum((r) => r.goalsFor)).toBe(sum((r) => r.goalsAgainst))
    for (const row of rows) expect(row.wins + row.losses + row.otLosses).toBe(row.gamesPlayed)
  })

  it('orders the league table by the NHL tiebreakers', () => {
    const rows = foldStandings(NHL_2026_27, [
      played(BOS, TOR, 2, 1, 'overtime'),
      played(MTL, TOR, 3, 1),
    ])
    // BOS and MTL level on 2 points; MTL has the regulation win.
    expect(rows.slice(0, 2).map((row) => row.clubId)).toEqual([MTL, BOS])
  })

  it('refuses a Fixture that ended level, which the NHL scheme cannot score', () => {
    expect(() => foldStandings(NHL_2026_27, [played(BOS, TOR, 2, 2)])).toThrow(/ended level/)
  })

  it('refuses a Club outside the structure', () => {
    expect(() => foldStandings(NHL_2026_27, [played(BOS, 'xyz', 2, 1)])).toThrow(/not in nhl/)
  })

  it('splits into sorted division and conference tables', () => {
    const rows = foldStandings(NHL_2026_27, [played(BOS, TOR, 4, 2)])
    const divisions = divisionTables(rows)
    const conferences = conferenceTables(rows)

    expect([...divisions.values()].map((table) => table.length)).toEqual([8, 8, 8, 8])
    expect([...conferences.values()].map((table) => table.length)).toEqual([16, 16])
    expect(divisions.get('atlantic')![0]!.clubId).toBe(BOS)
    expect(divisions.get('atlantic')!.at(-1)!.clubId).toBe(TOR)
  })

  it('feeds playoff qualification directly', () => {
    const matches = NHL_2026_27.divisions
      .flatMap((d) => d.clubIds)
      .map((clubId, i, all) =>
        played(clubId, all[(i + 1) % all.length]!, 3, 1, 'regulation', `f${i}`),
      )
    const seeds = qualify(NHL_PLAYOFF_FORMAT, foldStandings(NHL_2026_27, matches), NHL_2026_27)
    expect(seeds).toHaveLength(16)
  })
})
