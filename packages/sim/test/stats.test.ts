import { describe, expect, it } from 'vitest'
import type { MatchEvent, Period, Strength } from '../src/domain/event.js'
import type { PlayerId } from '../src/domain/player.js'
import { foldMatch, points, savePercentage } from '../src/stats/match.js'
import { foldSeason } from '../src/stats/season.js'
import { fixtureBetween } from './support/fixtures.js'

const HOME = 'h'
const AWAY = 'a'
const fixture = fixtureBetween(HOME, AWAY)

const HOME_FIRST = ['h1', 'h2', 'h3', 'h4', 'h5']
const HOME_SECOND = ['h6', 'h7', 'h8', 'h9', 'h10']
const AWAY_FIRST = ['a1', 'a2', 'a3', 'a4', 'a5']

function periodStart(clock: number, period: Period = 1): MatchEvent {
  return { type: 'period_start', clock, period, strength: 'even' }
}

function periodEnd(clock: number, period: Period = 1): MatchEvent {
  return { type: 'period_end', clock, period, strength: 'even', homeGoals: 0, awayGoals: 0 }
}

function shift(clock: number, clubId: string, onIce: readonly PlayerId[]): MatchEvent {
  return { type: 'shift_change', clock, period: 1, strength: 'even', clubId, onIce, goalie: `${clubId}g` }
}

/** A `shot` with result 'goal' and the `goal` event it produces, at the same clock. */
function goal(
  clock: number,
  clubId: string,
  scorer: PlayerId,
  options: {
    assists?: PlayerId[]
    goalieBeaten?: PlayerId
    strength?: Strength
    period?: Period
  } = {},
): MatchEvent[] {
  const { assists = [], goalieBeaten, strength = 'even', period = 1 } = options
  return [
    { type: 'shot', clock, period, strength, clubId, shooter: scorer, result: 'goal', danger: 0.3 },
    {
      type: 'goal',
      clock,
      period,
      strength,
      clubId,
      scorer,
      assists,
      ...(goalieBeaten === undefined ? {} : { goalieBeaten }),
      emptyNet: goalieBeaten === undefined,
    },
  ]
}

/**
 * One 1200-second Period with a bit of everything: an even-strength goal, a
 * power-play goal, a save, a miss, a block, turnovers, a faceoff and a line
 * change.
 */
function busyPeriod(): MatchEvent[] {
  return [
    periodStart(0),
    shift(0, HOME, HOME_FIRST),
    shift(0, AWAY, AWAY_FIRST),
    {
      type: 'faceoff',
      clock: 0,
      period: 1,
      strength: 'even',
      wonBy: HOME,
      winner: 'h1',
      loser: 'a1',
    },
    {
      type: 'shot',
      clock: 30,
      period: 1,
      strength: 'even',
      clubId: HOME,
      shooter: 'h2',
      result: 'save',
      goalie: 'ag',
      danger: 0.1,
    },
    {
      type: 'save',
      clock: 30,
      period: 1,
      strength: 'even',
      clubId: AWAY,
      goalie: 'ag',
      shooter: 'h2',
      rebound: false,
    },
    {
      type: 'shot',
      clock: 40,
      period: 1,
      strength: 'even',
      clubId: HOME,
      shooter: 'h3',
      result: 'miss',
      danger: 0.05,
    },
    {
      type: 'shot',
      clock: 50,
      period: 1,
      strength: 'even',
      clubId: AWAY,
      shooter: 'a2',
      result: 'block',
      blocker: 'h4',
      danger: 0.05,
    },
    {
      type: 'turnover',
      clock: 55,
      period: 1,
      strength: 'even',
      clubId: AWAY,
      kind: 'giveaway',
      player: 'a3',
    },
    {
      type: 'turnover',
      clock: 56,
      period: 1,
      strength: 'even',
      clubId: HOME,
      kind: 'takeaway',
      player: 'h5',
    },
    ...goal(60, HOME, 'h1', { assists: ['h2', 'h3'], goalieBeaten: 'ag' }),
    shift(90, HOME, HOME_SECOND),
    {
      type: 'penalty',
      clock: 100,
      period: 1,
      strength: 'even',
      clubId: HOME,
      player: 'h7',
      kind: 'tripping',
      minutes: 2,
    },
    {
      type: 'powerplay_start',
      clock: 100,
      period: 1,
      strength: 'powerplay',
      clubId: AWAY,
      skatersFor: 5,
      skatersAgainst: 4,
    },
    ...goal(150, AWAY, 'a1', { assists: ['a2'], goalieBeaten: 'hg', strength: 'powerplay' }),
    {
      type: 'powerplay_end',
      clock: 150,
      period: 1,
      strength: 'powerplay',
      clubId: AWAY,
      reason: 'goal',
    },
    periodEnd(1200),
  ]
}

describe('foldMatch', () => {
  const stats = foldMatch(fixture, busyPeriod())

  it('derives the result from goal events', () => {
    expect(stats.result).toEqual({
      homeGoals: 1,
      awayGoals: 1,
      decidedIn: 'regulation',
      winner: null,
      shootout: null,
    })
  })

  it('counts shots on goal as goals plus saves, never misses or blocks', () => {
    const home = stats.clubs.get(HOME)!
    const away = stats.clubs.get(AWAY)!
    expect(home.shotsFor).toBe(2)
    expect(home.shotsAgainst).toBe(1)
    expect(home.shotsMissed).toBe(1)
    expect(home.blocks).toBe(1)
    expect(away.shotsFor).toBe(1)
    expect(away.shotsAgainst).toBe(2)
    expect(away.shotsBlocked).toBe(1)
  })

  it('builds the box score line per Period', () => {
    expect(stats.periods).toEqual([
      { period: 1, homeGoals: 1, awayGoals: 1, homeShots: 2, awayShots: 1 },
    ])
  })

  it('records the scoring summary with the running score', () => {
    expect(stats.scoring.map((play) => [play.scorer, play.homeGoals, play.awayGoals])).toEqual([
      ['h1', 1, 0],
      ['a1', 1, 1],
    ])
    expect(stats.scoring[1]!.strength).toBe('powerplay')
  })

  it('credits goals, assists and points to the right Players', () => {
    expect(stats.skaters.get('h1')).toMatchObject({ clubId: HOME, goals: 1, shotsOnGoal: 1 })
    expect(stats.skaters.get('h2')).toMatchObject({ assists: 1, shotsOnGoal: 1 })
    expect(stats.skaters.get('a1')).toMatchObject({ clubId: AWAY, goals: 1, powerPlayGoals: 1 })

    // Tier 4: points sum to goals plus assists, with no orphan credit.
    const totalPoints = [...stats.skaters.values()].reduce((sum, s) => sum + points(s), 0)
    expect(totalPoints).toBe(2 + 3)
  })

  it('applies plus-minus to even-strength goals and skips power-play goals', () => {
    for (const id of HOME_FIRST) expect(stats.skaters.get(id)!.plusMinus).toBe(1)
    for (const id of AWAY_FIRST) expect(stats.skaters.get(id)!.plusMinus).toBe(-1)
    for (const id of HOME_SECOND) expect(stats.skaters.get(id)!.plusMinus).toBe(0)
  })

  it('credits faceoffs, turnovers, blocks and penalty minutes', () => {
    expect(stats.skaters.get('h1')).toMatchObject({ faceoffWins: 1, faceoffsTaken: 1 })
    expect(stats.skaters.get('a1')).toMatchObject({ faceoffWins: 0, faceoffsTaken: 1 })
    expect(stats.skaters.get('a3')!.giveaways).toBe(1)
    expect(stats.skaters.get('h5')!.takeaways).toBe(1)
    expect(stats.skaters.get('h4')!.blocks).toBe(1)
    expect(stats.skaters.get('a2')!.shotsBlocked).toBe(1)
    expect(stats.skaters.get('h7')!.penaltyMinutes).toBe(2)
    expect(stats.clubs.get(HOME)).toMatchObject({ penalties: 1, penaltyMinutes: 2, faceoffWins: 1 })
  })

  it('folds goalie lines from saves and goals against', () => {
    expect(stats.goalies.get('ag')).toMatchObject({
      clubId: AWAY,
      shotsAgainst: 2,
      saves: 1,
      goalsAgainst: 1,
    })
    expect(stats.goalies.get('hg')).toMatchObject({
      clubId: HOME,
      shotsAgainst: 1,
      saves: 0,
      goalsAgainst: 1,
    })
    expect(savePercentage(stats.goalies.get('ag')!)).toBe(0.5)
  })

  it('times the power play and ends it on the goal', () => {
    expect(stats.clubs.get(AWAY)).toMatchObject({
      powerPlayOpportunities: 1,
      powerPlayGoals: 1,
      powerPlaySeconds: 50,
    })
    expect(stats.clubs.get(HOME)).toMatchObject({ timesShorthanded: 1, powerPlayGoalsAgainst: 1 })
  })

  it('measures ice time from shift_change events, closing the last Shift at period_end', () => {
    expect(stats.skaters.get('h1')!.iceTimeSeconds).toBe(90)
    expect(stats.skaters.get('h6')!.iceTimeSeconds).toBe(1110)
    expect(stats.skaters.get('a1')!.iceTimeSeconds).toBe(1200)

    for (const clubId of [HOME, AWAY]) {
      const total = [...stats.skaters.values()]
        .filter((s) => s.clubId === clubId)
        .reduce((sum, s) => sum + s.iceTimeSeconds, 0)
      expect(total).toBe(5 * 1200)
    }
  })

  it('counts a short-handed goal for plus-minus and as short-handed', () => {
    const events = [
      periodStart(0),
      shift(0, HOME, HOME_FIRST),
      shift(0, AWAY, AWAY_FIRST),
      ...goal(10, HOME, 'h1', { goalieBeaten: 'ag', strength: 'penaltykill' }),
      periodEnd(1200),
    ]
    const result = foldMatch(fixture, events)
    expect(result.clubs.get(HOME)!.shorthandedGoals).toBe(1)
    expect(result.skaters.get('h1')).toMatchObject({ shorthandedGoals: 1, plusMinus: 1 })
    expect(result.skaters.get('a1')!.plusMinus).toBe(-1)
  })

  it('counts an empty-net goal as a shot on goal against no goalie', () => {
    const events = [periodStart(0), ...goal(10, HOME, 'h1'), periodEnd(1200)]
    const result = foldMatch(fixture, events)
    expect(result.clubs.get(HOME)!.shotsFor).toBe(1)
    expect(result.goalies.size).toBe(0)
    expect(result.scoring[0]!.emptyNet).toBe(true)
  })

  it('merges overlapping advantages into one stretch of power-play time', () => {
    const advantage = (clock: number): MatchEvent => ({
      type: 'powerplay_start',
      clock,
      period: 1,
      strength: 'powerplay',
      clubId: HOME,
      skatersFor: 5,
      skatersAgainst: 4,
    })
    const expire = (clock: number): MatchEvent => ({
      type: 'powerplay_end',
      clock,
      period: 1,
      strength: 'powerplay',
      clubId: HOME,
      reason: 'expired',
    })
    const events = [
      periodStart(0),
      advantage(100),
      advantage(130),
      expire(220),
      expire(250),
      advantage(1150),
      periodEnd(1200),
    ]
    const result = foldMatch(fixture, events)
    // 100-250 continuously, plus an advantage still running at period_end.
    expect(result.clubs.get(HOME)).toMatchObject({
      powerPlayOpportunities: 3,
      powerPlaySeconds: 150 + 50,
    })
    expect(result.clubs.get(AWAY)!.timesShorthanded).toBe(3)
  })

  it('marks a Fixture decided by an overtime goal', () => {
    const events = [
      periodStart(0),
      periodEnd(1200),
      periodStart(1200, 'OT'),
      ...goal(1230, AWAY, 'a1', { goalieBeaten: 'hg', period: 'OT' }),
      periodEnd(1230, 'OT'),
    ]
    const result = foldMatch(fixture, events)
    expect(result.result).toMatchObject({
      homeGoals: 0,
      awayGoals: 1,
      decidedIn: 'overtime',
      winner: AWAY,
    })
    expect(result.periods.map((p) => p.period)).toEqual([1, 'OT'])
  })

  it('awards the shootout winner one goal and counts nothing else from it', () => {
    const attempt = (clubId: string, shooter: PlayerId, scored: boolean): MatchEvent => ({
      type: 'shot',
      clock: 1500,
      period: 'SO',
      strength: 'even',
      clubId,
      shooter,
      result: scored ? 'goal' : 'save',
      ...(scored ? {} : { goalie: clubId === HOME ? 'ag' : 'hg' }),
      danger: 0.3,
    })
    const events = [
      periodStart(0),
      periodEnd(1200),
      periodStart(1200, 'OT'),
      periodEnd(1500, 'OT'),
      attempt(HOME, 'h1', true),
      attempt(AWAY, 'a1', false),
      attempt(HOME, 'h2', false),
      attempt(AWAY, 'a2', false),
    ]
    const result = foldMatch(fixture, events)
    expect(result.result).toEqual({
      homeGoals: 1,
      awayGoals: 0,
      decidedIn: 'shootout',
      winner: HOME,
      shootout: { homeGoals: 1, awayGoals: 0 },
    })
    expect(result.clubs.get(HOME)).toMatchObject({ goalsFor: 0, shotsFor: 0 })
    expect(result.skaters.size).toBe(0)
    expect(result.goalies.size).toBe(0)
  })

  it('refuses a stream that never ends its last Period', () => {
    expect(() => foldMatch(fixture, [periodStart(0), shift(0, HOME, HOME_FIRST)])).toThrow(
      /period_end/,
    )
  })

  it('refuses an event from a Club outside the Fixture', () => {
    expect(() =>
      foldMatch(fixture, [periodStart(0), ...goal(10, 'x', 'x1'), periodEnd(1200)]),
    ).toThrow(/not in Fixture/)
  })
})

describe('foldSeason', () => {
  it('sums Match statistics and counts appearances', () => {
    const first = foldMatch(fixtureBetween(HOME, AWAY, 'f1'), busyPeriod())
    const second = foldMatch(fixtureBetween(HOME, AWAY, 'f2'), busyPeriod())
    const season = foldSeason([first, second])

    expect(season.matches).toBe(2)
    expect(season.clubs.get(HOME)).toMatchObject({
      gamesPlayed: 2,
      goalsFor: 2,
      shotsFor: 4,
      powerPlayGoalsAgainst: 2,
    })
    expect(season.skaters.get('h1')).toMatchObject({
      gamesPlayed: 2,
      goals: 2,
      iceTimeSeconds: 180,
      plusMinus: 2,
    })
    expect(season.goalies.get('ag')).toMatchObject({ gamesPlayed: 2, shotsAgainst: 4, saves: 2 })
    expect(savePercentage(season.goalies.get('ag')!)).toBe(0.5)
  })

  it('does not mutate the Match statistics it folds', () => {
    const match = foldMatch(fixture, busyPeriod())
    foldSeason([match, match])
    expect(match.skaters.get('h1')!.goals).toBe(1)
    expect(match.clubs.get(HOME)!.gamesPlayed).toBe(1)
  })
})
