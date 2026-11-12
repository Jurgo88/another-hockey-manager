import {
  advanceDay,
  careerTotals,
  clubHistory,
  goalieCareer,
  isSeasonOver,
  nextSeason,
  recordOf,
  skaterCareer,
  startSeason,
  type SeasonRecord,
  type SeasonState,
} from '@ahm/sim'
import { beforeAll, describe, expect, it } from 'vitest'
import { SMALL_SEASON } from '../../../packages/sim/test/support/league'
import { careerOf, type StoredSeasonRecord, type YearRow } from '../server/utils/history'
import { joinRecord, splitRecord } from '../server/utils/records'

function played(state: SeasonState): SeasonState {
  let current = state
  while (!isSeasonOver(current)) current = advanceDay(current).state
  return current
}

/** A career line without what only a stored row adds. */
const withoutAge = <L extends { age: unknown; position: unknown }>(line: L) =>
  Object.fromEntries(Object.entries(line).filter(([key]) => key !== 'age' && key !== 'position'))

/** History and careers read from what the application stores (ADR-025, ADR-029, #93). */
describe('a career read from stored records', () => {
  let records: SeasonRecord[]
  let stored: StoredSeasonRecord[]
  let rows: YearRow[]

  beforeAll(async () => {
    const first = played(await startSeason(11, undefined, SMALL_SEASON))
    const second = played(nextSeason(first))
    const third = played(nextSeason(second))
    records = [first, second, third].map(recordOf)
    const split = records.map(splitRecord)
    stored = split.map((part, i) => ({ year: records[i]!.year, record: part.record }))
    rows = split.flatMap((part, i) =>
      part.players.map((row) => ({ ...row, year: records[i]!.year })),
    )
  })

  it('gives a Skater the lines and totals the full records give', () => {
    const playerId = Object.keys(records[0]!.totals.regular.skaters)[0]!
    const career = careerOf(
      stored,
      rows.filter((row) => row.player_id === playerId),
      playerId,
      false,
    )
    const expected = skaterCareer(records, playerId)
    expect(career.lines.map(withoutAge)).toEqual(expected)
    expect(career.totals).toEqual(careerTotals(expected))
    expect(career.lines.length).toBeGreaterThan(1)
    expect(career.lines.every((line) => line.age !== null)).toBe(true)
  })

  it('gives a Goalie his lines', () => {
    const playerId = Object.keys(records[0]!.totals.regular.goalies)[0]!
    const career = careerOf(
      stored,
      rows.filter((row) => row.player_id === playerId),
      playerId,
      true,
    )
    expect(career.lines.map(withoutAge)).toEqual(goalieCareer(records, playerId))
  })

  it('reads a Club’s history from the records’ own parts alone', () => {
    const clubId = records[0]!.standings[0]!.clubId
    const ownOnly = stored.map(({ record }) => joinRecord(record, []))
    expect(clubHistory(ownOnly, clubId)).toEqual(clubHistory(records, clubId))
  })
})
