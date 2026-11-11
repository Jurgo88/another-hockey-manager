import { describe, expect, it } from 'vitest'
import type { Departure, NaturalPosition } from '../src/domain/player.js'
import type { StandingsRow } from '../src/domain/standings.js'
import type { RosterEntry, SeasonRecord } from '../src/stats/history.js'
import {
  ageProfile,
  leavingRate,
  leavingRows,
  levelByAge,
  pointsSpread,
  tableDynamics,
} from '../src/stats/league.js'

/** The league over a run, folded from records (#90). */

interface Seat {
  id: string
  age: number
  position?: NaturalPosition
  fixtures: number
  /** Ice time per Fixture, for a Skater. */
  perFixture?: number
  level?: number
}

function record(year: number, seats: readonly Seat[], options: { departures?: Departure[]; points?: Record<string, number> } = {}): SeasonRecord {
  const roster: RosterEntry[] = seats.map((s) => ({
    playerId: s.id,
    clubId: 'c',
    age: s.age,
    position: s.position ?? 'C',
    level: s.level ?? 10,
  }))
  const skaters = Object.fromEntries(
    seats
      .filter((s) => s.position !== 'G')
      .map((s) => [s.id, { gamesPlayed: s.fixtures, iceTimeSeconds: s.fixtures * (s.perFixture ?? 600) } as never]),
  )
  const goalies = Object.fromEntries(
    seats.filter((s) => s.position === 'G').map((s) => [s.id, { gamesPlayed: s.fixtures } as never]),
  )
  const standings = Object.entries(options.points ?? { a: 90 }).map(
    ([clubId, points]) => ({ clubId, points }) as unknown as StandingsRow,
  )
  return {
    seasonId: `s-${year}`,
    year,
    champion: 'a',
    standings,
    playoffs: { bracket: { formatId: 'x', seeds: [], rounds: [] }, wins: {}, champion: 'a' },
    totals: { regular: { matches: 0, skaters, goalies }, playoffs: { matches: 0, skaters: {}, goalies: {} } },
    draft: [],
    departures: options.departures ?? [],
    roster,
  }
}

const left = (playerId: string, reason: Departure['reason']): Departure => ({ playerId, clubId: 'c', age: 0, reason })

describe('the age of a league', () => {
  it('weights the mean by Fixtures and counts shares among those who played', () => {
    const profile = ageProfile(
      record(1, [
        { id: 'a', age: 20, fixtures: 60 },
        { id: 'b', age: 32, fixtures: 20 },
        { id: 'c', age: 26, fixtures: 20 },
        { id: 'd', age: 40, fixtures: 0 },
      ]),
    )
    expect(profile.meanAge).toBeCloseTo((20 * 60 + 32 * 20 + 26 * 20) / 100)
    expect(profile.oldShare).toBeCloseTo(1 / 3)
    expect(profile.youngShare).toBeCloseTo(1 / 3)
    expect(profile.oldest).toBe(32)
    expect(profile.players).toBe(3)
  })
})

describe('who leaves', () => {
  const seats: Seat[] = [
    { id: 'f1', age: 24, fixtures: 80, perFixture: 1200 },
    { id: 'f2', age: 25, fixtures: 80, perFixture: 900 },
    { id: 'f3', age: 36, fixtures: 40, perFixture: 600 },
    { id: 'spare', age: 22, fixtures: 10 },
    { id: 'g1', age: 30, position: 'G', fixtures: 60 },
    { id: 'g2', age: 33, position: 'G', fixtures: 22 },
  ]
  const rows = leavingRows([
    record(1, seats),
    record(2, [], { departures: [left('f3', 'retired'), left('spare', 'unsigned')] }),
  ])

  it('follows the regulars of each Season but the last into the next', () => {
    expect(rows.map((row) => row.playerId).sort()).toEqual(['f1', 'f2', 'f3', 'g1', 'g2'])
    expect(rows.find((row) => row.playerId === 'f3')).toMatchObject({ year: 1, age: 36, reason: 'retired' })
    expect(rows.find((row) => row.playerId === 'f1')!.reason).toBeNull()
  })

  it('ranks Skaters by ice time per Fixture and Goalies by Fixtures, within the group', () => {
    const third = (id: string) => rows.find((row) => row.playerId === id)!.third
    expect([third('f1'), third('f2'), third('f3')]).toEqual([0, 1, 2])
    expect([third('g1'), third('g2')]).toEqual([0, 1])
  })

  it('gives the share who left', () => {
    expect(leavingRate(rows)).toBeCloseTo(1 / 5)
  })
})

describe('the table across a run', () => {
  const run = [
    record(1, [], { points: { a: 110, b: 90, c: 70, d: 50 } }),
    record(2, [], { points: { a: 100, b: 60, c: 95, d: 55 } }),
    record(3, [], { points: { a: 105, b: 85, c: 75, d: 65 } }),
  ]

  it('reads how much of the top and bottom stays, and the longest run on top', () => {
    const table = tableDynamics(run, 2)
    expect(table.topStays).toBeCloseTo(0.5)
    expect(table.bottomStays).toBeCloseTo(0.5)
    expect(table.longestTopRun).toBe(3)
    expect(table.firstPlaceClubs).toBe(1)
    expect(table.correlation).toBeGreaterThan(0)
    expect(table.correlation).toBeLessThan(1)
  })

  it('gives the spread of points in a Season', () => {
    expect(pointsSpread(run[0]!)).toBeCloseTo(Math.sqrt((30 ** 2 + 10 ** 2 + 10 ** 2 + 30 ** 2) / 3))
  })
})

describe('the level by age', () => {
  it('averages the Skaters of each band, Goalies left out', () => {
    const bands = levelByAge([
      record(1, [
        { id: 'a', age: 29, fixtures: 1, level: 12 },
        { id: 'b', age: 30, fixtures: 1, level: 14 },
        { id: 'g', age: 29, position: 'G', fixtures: 1, level: 2 },
        { id: 'c', age: 20, fixtures: 1, level: 8 },
      ]),
    ])
    expect(bands.find((band) => band.label === '28-30')).toEqual({ label: '28-30', level: 13, players: 2 })
    expect(bands.find((band) => band.label === '21 or younger')!.level).toBe(8)
  })
})
