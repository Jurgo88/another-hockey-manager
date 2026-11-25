import { beforeAll, describe, expect, it } from 'vitest'
import { NHL_2026_27, NHL_FARM_LEAGUE, NHL_FARM_RULES } from '../src/data/nhl-2026-27.js'
import type { Club } from '../src/domain/club.js'
import { positionGroup, type Player, type PlayerId } from '../src/domain/player.js'
import { countMeetings, generateSchedule } from '../src/engine/schedule.js'
import {
  affiliateId,
  affiliateStructure,
  contractedOf,
  farmMoves,
  formSwaps,
  parentOf,
  type FarmDay,
  type FormDay,
} from '../src/farm/index.js'
import { createRng } from '../src/rng/index.js'
import {
  advanceDay,
  contractedSeason,
  countedPayroll,
  isSeasonOver,
  nextSeason,
  recordOf,
  startSeason,
  type PlayedDay,
  type SeasonState,
  type UncontractedSeason,
} from '../src/season/index.js'
import { FORM, foldRecent, formOf, leagueRates, type LeagueRates } from '../src/stats/form.js'
import type { MatchStats, SkaterStats } from '../src/stats/match.js'
import { NO_TOTALS } from '../src/stats/season.js'
import { SMALL_SEASON } from './support/league.js'

/** The farm's games (ADR-036, #135): the affiliates' league, minor-league Players, form. */

describe("the affiliates' schedule", () => {
  const structure = affiliateStructure(NHL_2026_27, NHL_FARM_LEAGUE)
  const fixtures = generateSchedule({ structure, seasonId: 'f', rng: createRng(3) })

  it('gives every affiliate 72 Fixtures, 36 at home', () => {
    for (const clubId of structure.divisions.flatMap((d) => d.clubIds)) {
      const own = fixtures.filter((f) => f.homeClubId === clubId || f.awayClubId === clubId)
      expect(own).toHaveLength(72)
      expect(own.filter((f) => f.homeClubId === clubId)).toHaveLength(36)
    }
  })

  it('meets each divisional opponent 8 times, 4 at home, and the rest of the Conference twice, none across', () => {
    const division = structure.divisions[0]!
    const conference = structure.divisions.filter((d) => d.conferenceId === division.conferenceId)
    const clubId = division.clubIds[0]!
    const meetings = countMeetings(fixtures, clubId)
    for (const [opponent, count] of meetings) {
      if (division.clubIds.includes(opponent)) expect(count).toEqual({ games: 8, home: 4, away: 4 })
      else {
        expect(conference.some((d) => d.clubIds.includes(opponent))).toBe(true)
        expect(count).toEqual({ games: 2, home: 1, away: 1 })
      }
    }
    expect(meetings.size).toBe(15)
  })

  it('ends as the NHL regular Season does, starting later', () => {
    const nhl = generateSchedule({ structure: NHL_2026_27, seasonId: 'n', rng: createRng(3) })
    const days = fixtures.map((f) => f.day)
    expect(Math.min(...days)).toBeGreaterThanOrEqual(24)
    expect(Math.max(...days)).toBeLessThanOrEqual(Math.max(...nhl.map((f) => f.day)) + 1)
  })

  it("mirrors the alignment, each affiliate in its Club's Division", () => {
    for (const [i, division] of structure.divisions.entries()) {
      expect(division.clubIds.map(parentOf)).toEqual(NHL_2026_27.divisions[i]!.clubIds)
    }
  })

  it('refuses a key that cannot be laid out in layers', () => {
    const odd = {
      ...NHL_2026_27,
      scheduleKey: { ...NHL_2026_27.scheduleKey, divisional: { games: 5, home: 3 } },
    }
    expect(() => generateSchedule({ structure: odd, seasonId: 'x', rng: createRng(1) })).toThrow(
      /layers/,
    )
  })
})

describe('a run without farm games', () => {
  it('keeps no affiliates, and a Season stored before #135 reads as one', async () => {
    const state = await startSeason(7, undefined, SMALL_SEASON)
    expect(state.affiliates).toBeNull()
    const stored: Partial<SeasonState> = { ...state }
    delete stored.affiliates
    const old = { ...stored, farmRules: { ...state.farmRules, league: undefined } }
    const read = contractedSeason(old as unknown as UncontractedSeason)
    expect(read.affiliates).toBeNull()
    expect(read.farmRules.league).toEqual(NHL_FARM_LEAGUE)
  })
})

describe('a run with farm games', () => {
  let start: SeasonState
  let without: SeasonState
  let days: PlayedDay[]
  let ended: SeasonState

  beforeAll(async () => {
    start = await startSeason(7, undefined, SMALL_SEASON, { playFarm: true })
    without = await startSeason(7, undefined, SMALL_SEASON)
    days = []
    let state = start
    while (!isSeasonOver(state)) {
      const day = advanceDay(state)
      days.push(day)
      state = day.state
    }
    ended = state
  })

  it("fills every affiliate to the league's shape with Players on minor-league contracts", () => {
    const shape = NHL_FARM_LEAGUE.roster
    for (const club of start.clubs) {
      const minors = start.affiliates!.minorLeague[club.id]!
      for (const group of ['forward', 'defence', 'goalie'] as const) {
        const count = (ps: readonly Player[]) => ps.filter((p) => positionGroup(p) === group).length
        expect(count(club.farm ?? []) + count(minors)).toBeGreaterThanOrEqual(shape[group])
      }
      for (const player of minors) {
        expect(player.contract).toBeUndefined()
        expect(player.clubId).toBe(club.id)
      }
    }
  })

  it('leaves the Clubs, their contracts and the cap as a run without them has them', () => {
    expect(start.clubs).toEqual(without.clubs)
    for (const club of start.clubs) {
      expect(countedPayroll(start, club)).toBe(countedPayroll(without, club))
      const minors = new Set(start.affiliates!.minorLeague[club.id]!.map((p) => p.id))
      expect(contractedOf(club).some((p) => minors.has(p.id))).toBe(false)
    }
  })

  it('plays every farm Fixture, its counts and table folded from its events', () => {
    const aff = ended.affiliates!
    expect(aff.nextFixture).toBe(aff.fixtures.length)
    const played = days.flatMap((d) => d.farmPlayed)
    expect(played).toHaveLength(aff.fixtures.length)
    expect(aff.totals.matches).toBe(played.length)
    const games = aff.standings.reduce((sum, row) => sum + row.gamesPlayed, 0)
    expect(games).toBe(played.length * 2)
    // A farm Fixture plays on its own stream, under the affiliates' ids.
    for (const { fixture } of played) {
      expect(fixture.id).toContain('-farm-')
      expect(fixture.homeClubId).toBe(affiliateId(parentOf(fixture.homeClubId)))
    }
  })

  it('dresses nobody on two Lineups in one day', () => {
    for (const day of days) {
      const ids = [...day.played, ...day.farmPlayed].flatMap(({ input }) =>
        [input.homeLineup, input.awayLineup].flatMap((l) => [
          ...l.lines.flatMap((x) => [x.leftWing, x.centre, x.rightWing]),
          ...l.pairings.flatMap((x) => [x.leftDefence, x.rightDefence]),
          l.starter,
          l.backup,
        ]),
      )
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it("keeps the Competition's own Fixtures and their streams", () => {
    const nhl = days.flatMap((d) => d.played).map((p) => [p.fixture.id, p.seed])
    expect(nhl.length).toBeGreaterThan(0)
    expect(new Set(nhl.map(([id]) => id)).size).toBe(nhl.length)
  })

  it('changes no result when stored and read back between days', () => {
    let a = start
    let b = start
    for (let i = 0; i < 30 && !isSeasonOver(a); i++) {
      a = advanceDay(a).state
      b = advanceDay(JSON.parse(JSON.stringify(b)) as SeasonState).state
    }
    expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(a)))
  })

  it("records the affiliates' table and counts with the Season", () => {
    const record = recordOf(ended)
    expect(record.farm?.totals.matches).toBe(ended.affiliates!.totals.matches)
    expect(recordOf(endedWithout()).farm).toBeUndefined()
  })

  it('goes on playing them the next Season, the minor-league Players a year older', () => {
    const next = nextSeason(ended)
    const aff = next.affiliates!
    expect(aff.nextFixture).toBe(0)
    expect(aff.fixtures[0]!.seasonId).toBe('s7-y2-farm')
    const before = new Map(
      Object.values(ended.affiliates!.minorLeague)
        .flat()
        .map((p) => [p.id, p]),
    )
    const stayed = Object.values(aff.minorLeague)
      .flat()
      .filter((p) => before.has(p.id))
    expect(stayed.length).toBeGreaterThan(0)
    for (const player of stayed) expect(player.age).toBe(before.get(player.id)!.age + 1)
  })

  function endedWithout(): SeasonState {
    let state = without
    while (!isSeasonOver(state)) state = advanceDay(state).state
    return state
  }
})

describe('form', () => {
  const skater = (seconds: number, points: number): SkaterStats => ({
    clubId: 'c',
    gamesPlayed: 1,
    goals: points,
    assists: 0,
    shotsOnGoal: 0,
    shotsMissed: 0,
    shotsBlocked: 0,
    blocks: 0,
    plusMinus: 0,
    penaltyMinutes: 0,
    powerPlayGoals: 0,
    shorthandedGoals: 0,
    faceoffWins: 0,
    faceoffsTaken: 0,
    giveaways: 0,
    takeaways: 0,
    iceTimeSeconds: seconds,
  })
  const match = (points: number) =>
    ({
      skaters: new Map([['p', skater(900, points)]]),
      goalies: new Map(),
    }) as unknown as MatchStats

  it(`keeps a Player's last ${FORM.window} Fixtures`, () => {
    let recent = {}
    for (let i = 0; i < FORM.window + 3; i++) recent = foldRecent(recent, match(i), 'farm')
    const kept = (recent as Record<string, { output: number }[]>)['p']!
    expect(kept).toHaveLength(FORM.window)
    expect(kept[0]!.output).toBe(3)
  })

  const rates: Record<'nhl' | 'farm', LeagueRates> = {
    nhl: { forward: { intercept: 0, slope: 0.2 }, defence: null, goalie: null },
    farm: { forward: { intercept: 0, slope: 0.2 }, defence: null, goalie: null },
  }
  const games = (n: number, points: number) =>
    Array.from({ length: n }, () => ({ league: 'farm' as const, exposure: 3600, output: points }))

  it('says nothing before enough Fixtures, or without a rate', () => {
    expect(formOf(games(FORM.minFixtures - 1, 2), 10, 'forward', rates)).toBeNull()
    expect(formOf(games(FORM.minFixtures, 2), 10, 'defence', rates)).toBeNull()
  })

  it('reads output as levels above or below what the level produces, within its limit', () => {
    // A level 10 forward is expected 2 points an hour; 2.2 is one level better.
    expect(formOf(games(5, 2), 10, 'forward', rates)).toBeCloseTo(0)
    expect(formOf(games(5, 2.2), 10, 'forward', rates)).toBeCloseTo(1)
    expect(formOf(games(5, 0), 10, 'forward', rates)).toBe(-FORM.limit)
  })

  it('fits a rate that rises with level', () => {
    const levels = new Map<PlayerId, number>()
    const skaters: Record<PlayerId, SkaterStats> = {}
    for (let i = 0; i < 20; i++) {
      levels.set(`s${i}`, 5 + i / 2)
      skaters[`s${i}`] = { ...skater(36_000, 5 + i), gamesPlayed: 10 }
    }
    const fitted = leagueRates({ ...NO_TOTALS, skaters }, (id) =>
      levels.has(id) ? { level: levels.get(id)!, group: 'forward' } : undefined,
    )
    expect(fitted.forward!.slope).toBeCloseTo(0.2)
    expect(fitted.defence).toBeNull()
  })
})

describe("the assistant's moves with farm games", () => {
  let club: Club
  beforeAll(async () => {
    club = (await startSeason(7, undefined, SMALL_SEASON)).clubs[0]!
  })
  const forwards = (players: readonly Player[]) =>
    players.filter((p) => positionGroup(p) === 'forward')
  const formDay = (merit: (id: PlayerId) => number | null, free = true): FormDay => ({
    merit,
    out: () => false,
    injuredReserve: () => false,
    free: () => free,
    mayRecall: () => true,
    affords: () => true,
  })

  it("swaps the farm's best for the weakest when he is clearly ahead", () => {
    const weakest = forwards(club.skaters).at(-1)!
    const best = forwards(club.farm ?? [])[0]!
    const merit = (id: PlayerId) => (id === best.id ? 20 : id === weakest.id ? 1 : 10)
    const moves = formSwaps(club, formDay(merit))
    expect(moves).toContainEqual({ clubId: club.id, playerId: weakest.id, kind: 'sentDown' })
    expect(moves).toContainEqual({ clubId: club.id, playerId: best.id, kind: 'calledUp' })
  })

  it('swaps nobody within the margin, or when nobody goes down without waivers', () => {
    expect(
      formSwaps(
        club,
        formDay(() => 10),
      ),
    ).toEqual([])
    const best = forwards(club.farm ?? [])[0]!
    const merit = (id: PlayerId) => (id === best.id ? 20 : 1)
    expect(formSwaps(club, formDay(merit, false))).toEqual([])
  })

  it('swaps no Goalie, whose form over a few Fixtures is mostly noise', () => {
    const farmGoalie = (club.farm ?? []).find((p) => positionGroup(p) === 'goalie')!
    const merit = (id: PlayerId) => (id === farmGoalie.id ? 20 : 1)
    expect(formSwaps(club, formDay(merit))).toEqual([])
  })

  it('recalls one sent down only after a farm Fixture, but in an emergency', () => {
    const hurt = new Set(
      forwards(club.skaters)
        .slice(0, 1)
        .map((p) => p.id),
    )
    const day = (mayRecall: boolean): FarmDay => ({
      out: (id) => hurt.has(id),
      injuredReserve: (id) => hurt.has(id),
      free: () => true,
      affords: () => true,
      emergencyCapHit: 0,
      mayRecall: () => mayRecall,
    })
    // 14 forwards, one on Injured Reserve: 13 fit, above the emergency line of 12.
    expect(farmMoves(club, NHL_FARM_RULES, day(false))).toEqual([])
    expect(farmMoves(club, NHL_FARM_RULES, day(true))).toHaveLength(1)
  })
})
