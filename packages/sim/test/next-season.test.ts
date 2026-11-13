import { beforeAll, describe, expect, it } from 'vitest'
import { develop } from '../src/develop/index.js'
import { validateLineup } from '../src/engine/lineup.js'
import { playerLevel } from '../src/domain/player.js'
import { createRng } from '../src/rng/index.js'
import {
  advanceDay,
  isSeasonOver,
  nextSeason,
  recordOf,
  startSeason,
  type SeasonState,
} from '../src/season/index.js'
import { SMALL_SEASON } from './support/league.js'

/** Moving from one Season to the next (#85), in the small Competition (ADR-014). */

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
    start = await startSeason(SEED, undefined, SMALL_SEASON)
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
      draft: [],
      departures: [],
      roster: expect.any(Array) as unknown,
    })
    const [first] = recordOf(ended).roster
    const player = ended.clubs[0]!.skaters[0]!
    expect(first).toEqual({
      playerId: player.id,
      clubId: ended.clubs[0]!.id,
      age: player.age,
      position: player.preferredPositions[0],
      level: playerLevel(player),
    })
    expect(recordOf(playToChampion(next)).departures).toEqual(next.departures)
    expect(() => recordOf(start)).toThrow(/no champion/)
  })

  it('makes every Player who stays a year older, rested and of neutral form', () => {
    const before = new Map(
      ended.clubs.flatMap((club) => [...club.skaters, ...club.goalies]).map((p) => [p.id, p]),
    )
    const stayed = next.clubs
      .flatMap((club) => [...club.skaters, ...club.goalies])
      .filter((player) => before.has(player.id))
    // The market moves some Players to other Clubs (ADR-032).
    expect(stayed.length).toBeGreaterThan(before.size * 0.75)
    for (const player of stayed) {
      expect(player.age).toBe(before.get(player.id)!.age + 1)
      expect(player.form).toBe(50)
      expect(player.fatigue).toBe(0)
    }
  })

  it('develops every Player by the age he played at, on a stream of his own (ADR-022)', () => {
    const club = ended.clubs[0]!
    const games = ended.standings.find((row) => row.clubId === club.id)!.gamesPlayed
    const after = new Map(
      next.clubs.flatMap((c) => [...c.skaters, ...c.goalies]).map((p) => [p.id, p]),
    )
    for (const player of [...club.skaters, ...club.goalies].filter((p) => after.has(p.id))) {
      const { skaters, goalies } = ended.totals.regular
      const dressed = (skaters[player.id] ?? goalies[player.id])?.gamesPlayed ?? 0
      const expected = develop(player, createRng(SEED).fork(`develop:y1:${player.id}`), {
        regular: dressed * 2 >= games,
      })
      const developed = after.get(player.id)!
      expect(developed.attributes).toEqual(expected.attributes)
      expect(developed.provenance).toEqual(expected.provenance)
      expect(developed.potential).toBe(expected.potential)
    }
    const changed = ended.clubs
      .flatMap((c) => [...c.skaters, ...c.goalies])
      .filter((p) => after.has(p.id))
      .filter((p) => JSON.stringify(after.get(p.id)!.attributes) !== JSON.stringify(p.attributes))
    expect(changed.length).toBeGreaterThan(after.size / 2)
  })

  it('lets some Players leave, and records who and why (ADR-023, ADR-027, ADR-032)', () => {
    const before = new Map(
      ended.clubs.flatMap((club) => [...club.skaters, ...club.goalies]).map((p) => [p.id, p]),
    )
    const after = new Set(next.clubs.flatMap((c) => [...c.skaters, ...c.goalies]).map((p) => p.id))
    const gone = [...before.keys()].filter((id) => !after.has(id))
    const fromRosters = next.departures.filter((d) => d.reason !== 'rights-expired')
    expect(fromRosters.map((d) => d.playerId).sort()).toEqual(gone.sort())
    // About 3 a Club in the NHL (ADR-028); a small league leans on its outside pool more.
    expect(gone.length).toBeGreaterThan(next.clubs.length)
    expect(gone.length).toBeLessThan(next.clubs.length * 8)
    for (const departure of fromRosters) {
      const player = before.get(departure.playerId)!
      expect(departure.clubId).toBe(player.clubId)
      expect(departure.age).toBe(player.age)
      expect(next.absent[departure.playerId]).toBeUndefined()
    }
    // Some Players sign with another Club in the market (ADR-032).
    const clubOf = new Map(
      next.clubs.flatMap((c) => [...c.skaters, ...c.goalies]).map((p) => [p.id, p.clubId]),
    )
    expect(
      [...before.values()].some((p) => clubOf.has(p.id) && clubOf.get(p.id) !== p.clubId),
    ).toBe(true)
    // Rights expire only for the oldest class the league opened with (#90).
    const opening = new Map(ended.prospects.map((p) => [p.player.id, p]))
    for (const departure of next.departures.filter((d) => d.reason === 'rights-expired')) {
      expect(opening.get(departure.playerId)?.year).toBe(-2)
    }
  })

  it('fills every gap with a prospect or an undrafted Player, so each Club keeps its 16-10-3 shape', () => {
    const before = new Set(
      ended.clubs.flatMap((c) => [...c.skaters, ...c.goalies]).map((p) => p.id),
    )
    for (const club of next.clubs) {
      const defence = club.skaters.filter((s) => ['LD', 'RD'].includes(s.preferredPositions[0]!))
      expect(club.skaters.length - defence.length).toBe(16)
      expect(defence.length).toBe(10)
      expect(club.goalies.length).toBe(3)
      for (const player of [...club.skaters, ...club.goalies]) {
        if (before.has(player.id)) continue
        const drafted = next.draft.some((p) => p.playerId === player.id && p.clubId === club.id)
        const held = ended.prospects.some((p) => p.player.id === player.id)
        // Or a Player from outside the league signed in the market (ADR-032).
        const outside = player.id.startsWith('fa-y2-')
        expect(drafted || held || outside || player.id.startsWith(`${club.id}-y2-u`)).toBe(true)
        expect(player.clubId).toBe(club.id)
        expect(Object.values(player.provenance!).every((p) => p.source === 'generated')).toBe(true)
      }
    }
    const ids = next.clubs.flatMap((c) => [...c.skaters, ...c.goalies]).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no departures before the first Season', () => {
    expect(start.departures).toEqual([])
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
    // In a small league a Club may lose a Player of its Lineup; one that loses none keeps it.
    const kept = next.clubs.find(
      (club) => validateLineup(ended.lineups[club.id]!, club).length === 0,
    )!
    const broken = ended.clubs.find((club) => club.id !== kept.id)
    expect(next.lineups[kept.id]).toEqual(ended.lineups[kept.id])

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
      for (let day = 0; day < 10; day++) reloaded = stored(advanceDay(reloaded).state)
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
