import { beforeAll, describe, expect, it } from 'vitest'
import {
  advanceDay,
  isSeasonOver,
  nextSeason,
  recordOf,
  startSeason,
  type SeasonState,
} from '../src/season/index.js'

/** Moving from one Season to the next (#85). */

const SEED = 5

function playToChampion(state: SeasonState): SeasonState {
  let current = state
  while (!isSeasonOver(current)) current = advanceDay(current).state
  return current
}

/** Through stored JSON, as the application keeps a Season between requests (ADR-014). */
const stored = (state: SeasonState): SeasonState => JSON.parse(JSON.stringify(state)) as SeasonState

describe('nextSeason', () => {
  let start: SeasonState
  let ended: SeasonState
  let next: SeasonState

  beforeAll(async () => {
    start = await startSeason(SEED)
    ended = playToChampion(start)
    next = nextSeason(ended)
  })

  it('refuses a Season without a champion', () => {
    expect(() => nextSeason(start)).toThrow(/no champion/)
  })

  it('keeps the first Season as it was before there were more', () => {
    expect(start.year).toBe(1)
    expect(start.fixtures[0]!.seasonId).toBe(`s${SEED}`)
  })

  it('counts the Season, and hands what is kept of the last one to the caller (#86)', () => {
    expect(next.year).toBe(2)
    expect(recordOf(ended)).toEqual({
      seasonId: `s${SEED}`,
      year: 1,
      champion: ended.playoffs!.champion,
      standings: ended.standings,
      playoffs: ended.playoffs,
      totals: ended.totals,
    })
    expect(() => recordOf(start)).toThrow(/no champion/)
  })

  it('makes every Player a year older, rested and of neutral form', () => {
    const before = new Map(
      ended.clubs.flatMap((club) => [...club.skaters, ...club.goalies]).map((p) => [p.id, p]),
    )
    for (const player of next.clubs.flatMap((club) => [...club.skaters, ...club.goalies])) {
      expect(player.age).toBe(before.get(player.id)!.age + 1)
      expect(player.form).toBe(50)
      expect(player.fatigue).toBe(0)
    }
  })

  it('starts the table, the counts and the schedule again', () => {
    expect(next.nextFixture).toBe(0)
    expect(next.playoffs).toBeNull()
    expect(next.standings.every((row) => row.gamesPlayed === 0)).toBe(true)
    expect(next.totals.regular.skaters).toEqual({})
    expect(next.fatigue).toEqual({})
    expect(next.lastPlayed).toEqual({})
    expect(next.goalieHistory).toEqual({})
    expect(next.fixtures).toHaveLength(start.fixtures.length)
  })

  it('draws the schedule from a stream of its own (D-08)', () => {
    expect(next.fixtures[0]!.seasonId).toBe(`s${SEED}-y2`)
    const pairs = (state: SeasonState) =>
      state.fixtures.slice(0, 50).map((f) => `${f.day}:${f.homeClubId}-${f.awayClubId}`)
    expect(pairs(next)).not.toEqual(pairs(start))
  })

  it('carries an absence over the summer by the calendar', () => {
    const [long, short] = ended.clubs[0]!.skaters.map((skater) => skater.id)
    const last = ended.fixtures.at(-1)!.day
    const after = nextSeason({ ...ended, absent: { [long!]: 365 + 20, [short!]: last + 5 } })
    expect(after.absent).toEqual({ [long!]: 20 })
  })

  it('keeps a Lineup that is still valid, and rebuilds one that is not with its Tactics', () => {
    const [kept, broken] = ended.clubs
    expect(next.lineups[kept!.id]).toEqual(ended.lineups[kept!.id])

    const gone = ended.lineups[broken!.id]!.lines[0].centre
    const tactics = { ...ended.lineups[broken!.id]!.tactics, matchup: 'exploit' as const }
    const shorter = {
      ...ended,
      clubs: ended.clubs.map((club) =>
        club.id === broken!.id
          ? { ...club, skaters: club.skaters.filter((skater) => skater.id !== gone) }
          : club,
      ),
      lineups: { ...ended.lineups, [broken!.id]: { ...ended.lineups[broken!.id]!, tactics } },
    }
    const rebuilt = nextSeason(shorter).lineups[broken!.id]!
    expect(JSON.stringify(rebuilt)).not.toContain(gone)
    expect(rebuilt.tactics).toEqual(tactics)
  })

  it('plays several Seasons in a row from one seed, however often it is stored', () => {
    let straight = next
    let reloaded = stored(next)
    for (let year = 2; year <= 3; year++) {
      straight = playToChampion(straight)
      // Stopped and reloaded on some day in the middle as well as between Seasons.
      for (let day = 0; day < 40; day++) reloaded = stored(advanceDay(reloaded).state)
      reloaded = playToChampion(reloaded)
      if (year < 3) {
        straight = nextSeason(straight)
        reloaded = stored(nextSeason(stored(reloaded)))
      }
    }
    expect(straight.year).toBe(3)
    expect(stored(straight)).toEqual(reloaded)
  })
})
