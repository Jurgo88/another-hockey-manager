import {
  advanceDay,
  endSeason,
  isSeasonOver,
  nextSeason,
  recordOf,
  startNextSeason,
  startSeason,
  type SeasonState,
} from '@ahm/sim'
import { beforeAll, describe, expect, it } from 'vitest'
import { SMALL_SEASON } from '../../../packages/sim/test/support/league'
import { joinRecord, splitRecord } from '../server/utils/records'

function played(state: SeasonState): SeasonState {
  let current = state
  while (!isSeasonOver(current)) current = advanceDay(current).state
  return current
}

/** What a database column gives back: JSON, numbers and strings only. */
const throughJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('a Season record stored split (ADR-029)', () => {
  let first: SeasonState
  let second: SeasonState

  beforeAll(async () => {
    first = played(await startSeason(7, undefined, SMALL_SEASON))
    second = played(nextSeason(first))
  })

  it('reads back as the record recordOf made, in the first Season and the next', () => {
    for (const state of [first, second]) {
      const record = recordOf(state)
      const { record: own, players } = throughJson(splitRecord(record))
      expect(joinRecord(own, players)).toEqual(record)
    }
  })

  it('keeps one row per Player, and nothing of the Players in the record itself', () => {
    const record = recordOf(second)
    const { record: own, players } = splitRecord(record)
    const ids = players.map((row) => row.player_id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(record.roster.length)
    expect(own).not.toHaveProperty('totals')
    expect(own).not.toHaveProperty('roster')
    // A Season after the first has a draft and departures to keep.
    expect(own.draft.length).toBeGreaterThan(0)
    expect(own.departures.length).toBeGreaterThan(0)
  })

  it('loses nothing of a Player who was counted but not on a Roster as it ended', () => {
    const record = recordOf(first)
    const [gone, ...stayed] = record.roster
    const trimmed = { ...record, roster: stayed }
    const { record: own, players } = splitRecord(trimmed)
    const row = players.find((candidate) => candidate.player_id === gone!.playerId)!
    expect(row.roster_order).toBeNull()
    expect(row.regular).not.toBeNull()
    expect(joinRecord(own, players)).toEqual(trimmed)
  })
})

describe('a career moving on through storage (ADR-029)', () => {
  it('gives the same next Season when the Offseason is stored between the steps', async () => {
    const ended = played(await startSeason(7, undefined, SMALL_SEASON))
    // What the routes do: the ended Season, then the Offseason, each through a json column.
    const offseason = throughJson(endSeason(throughJson(ended)))
    expect(startNextSeason(offseason)).toEqual(nextSeason(ended))
  })
})
