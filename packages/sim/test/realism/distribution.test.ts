import { describe, expect, it } from 'vitest'
import type { PlayerId, SkaterPosition } from '../../src/domain/player.js'
import { simulateSeason } from '../../src/cli/season.js'
import { points, savePercentage } from '../../src/stats/match.js'

/**
 * Tier 2 distribution (04-validation-targets.md): the gate that says scoring
 * lands on the right Players, not only in the right quantity (R-01). Ice time
 * and the standings extremes have their own suites.
 *
 * Every figure is averaged over eight Seasons, so one Season may fall outside
 * its band while the engine stays on target.
 */

const SEASON_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]
const TIER_SIZE = 96
const QUALIFYING_SKATER_FIXTURES = 40
const QUALIFYING_GOALIE_FIXTURES = 20
const FIXTURES_PER_CLUB = 84
const LEADERBOARD_SIZE = 10
const DEFENCE_POSITIONS: readonly SkaterPosition[] = ['LD', 'RD']

const within = (value: number, target: number, band: number) => {
  expect(value).toBeGreaterThanOrEqual(target - band)
  expect(value).toBeLessThanOrEqual(target + band)
}

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length
const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0)
const descending = (a: number, b: number) => b - a

/** Nearest rank on an ascending copy: 0.5 is the median of an odd-sized sample. */
function percentile(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.round(share * (sorted.length - 1))]!
}

describe('Tier 2 distribution', async () => {
  const seasons = await Promise.all(
    SEASON_SEEDS.map(async (seed) => {
      const { clubs, lineups, season } = await simulateSeason(seed)
      const starterIds = new Set<PlayerId>([...lineups.values()].map((lineup) => lineup.starter))
      const poolSavePercentage = (starters: boolean) => {
        const goalies = [...season.goalies].filter(([id]) => starterIds.has(id) === starters)
        return sum(goalies.map(([, g]) => g.saves)) / sum(goalies.map(([, g]) => g.shotsAgainst))
      }
      const forwardIds = new Set<PlayerId>(
        [...lineups.values()].flatMap((lineup) =>
          lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
        ),
      )

      const starterFixtures = [...season.goalies]
        .filter(([id]) => starterIds.has(id))
        .map(([, g]) => g.gamesPlayed)
      const dressedIds = new Set<PlayerId>([
        ...forwardIds,
        ...[...lineups.values()].flatMap((lineup) =>
          lineup.pairings.flatMap((pairing) => [pairing.leftDefence, pairing.rightDefence]),
        ),
      ])
      const regulars = [...season.skaters]
        .filter(([id, s]) => dressedIds.has(id) && s.iceTimeSeconds / s.gamesPlayed >= 15 * 60)
        .map(([, s]) => s)

      const skaters = [...season.skaters.values()]
      const pointTotals = skaters.map(points).sort(descending)
      const qualified = skaters.filter((s) => s.gamesPlayed >= QUALIFYING_SKATER_FIXTURES)

      // Every forward who appeared, spares too: the measured ranks cover the whole league.
      const appearedForwardIds = new Set<PlayerId>(
        clubs.flatMap((club) =>
          club.skaters
            .filter((s) => !DEFENCE_POSITIONS.includes(s.preferredPositions[0]!))
            .map((s) => s.id),
        ),
      )
      const forwards = [...season.skaters]
        .filter(([id]) => appearedForwardIds.has(id))
        .map(([, s]) => s)
      const byPoints = forwards.map(points).sort(descending)
      const byIceTime = forwards.map((s) => s.iceTimeSeconds / s.gamesPlayed).sort(descending)
      const tierRatio = (ranked: readonly number[]) =>
        mean(ranked.slice(0, TIER_SIZE)) / mean(ranked.slice(3 * TIER_SIZE, 4 * TIER_SIZE))

      const goals = skaters.map((s) => s.goals).sort(descending)
      const topByPoints = [...skaters]
        .sort((a, b) => points(b) - points(a))
        .slice(0, LEADERBOARD_SIZE)
      const defencemen = [...season.skaters]
        .filter(([id]) => !appearedForwardIds.has(id))
        .map(([, s]) => s)
      const defenceShare = (read: (skater: (typeof skaters)[number]) => number) =>
        (100 * sum(defencemen.map(read))) / sum(skaters.map(read))
      const savePercentages = [...season.goalies.values()]
        .filter((g) => g.gamesPlayed >= QUALIFYING_GOALIE_FIXTURES)
        .map(savePercentage)

      return {
        leader: pointTotals[0]!,
        fifth: pointTotals[4]!,
        medianSkater: percentile(qualified.map(points), 0.5),
        pointRatio: tierRatio(byPoints),
        pointsPerMinuteRatio: tierRatio(byPoints) / tierRatio(byIceTime),
        topScorersShare: (100 * sum(goals.slice(0, LEADERBOARD_SIZE))) / sum(goals),
        mostGoals: goals[0]!,
        tenthMostGoals: goals[LEADERBOARD_SIZE - 1]!,
        fortyGoalScorers: goals.filter((total) => total >= 40).length,
        assistsPerGoalAtTheTop:
          sum(topByPoints.map((s) => s.assists)) / sum(topByPoints.map((s) => s.goals)),
        defenceGoals: defenceShare((s) => s.goals),
        defenceAssists: defenceShare((s) => s.assists),
        defenceShots: defenceShare((s) => s.shotsOnGoal),
        goalieSpread: percentile(savePercentages, 0.9) - percentile(savePercentages, 0.1),
        medianGoalie: percentile(savePercentages, 0.5),
        regularGoalies: savePercentages.length,
        starterShare:
          (100 * sum(starterFixtures)) /
          sum([...season.goalies.values()].map((g) => g.gamesPlayed)),
        missed: 100 * (1 - mean(regulars.map((s) => s.gamesPlayed)) / FIXTURES_PER_CLUB),
        startersGap: poolSavePercentage(true) - poolSavePercentage(false),
      }
    }),
  )

  const average = (read: (season: (typeof seasons)[number]) => number) => mean(seasons.map(read))

  it('league scoring leader: 141 ±25 points', () => {
    within(
      average((s) => s.leader),
      141,
      25,
    )
  })

  it('fifth-highest scorer: 106 ±20 points', () => {
    within(
      average((s) => s.fifth),
      106,
      20,
    )
  })

  it('median Skater with 40+ Fixtures: 30 ±6 points', () => {
    within(
      average((s) => s.medianSkater),
      30,
      6,
    )
  })

  it('forward tier-1 to tier-4 point ratio: 4.4 ±0.8', () => {
    within(
      average((s) => s.pointRatio),
      4.4,
      0.8,
    )
  })

  it('forward tier-1 to tier-4 points-per-minute ratio: 2.71 ±0.50', () => {
    within(
      average((s) => s.pointsPerMinuteRatio),
      2.71,
      0.5,
    )
  })

  it("top-10 goalscorers' share of league goals: 5.7% ±1.5 pp", () => {
    within(
      average((s) => s.topScorersShare),
      5.7,
      1.5,
    )
  })

  it('most goals in a Season: 54 ±8', () => {
    within(
      average((s) => s.mostGoals),
      54,
      8,
    )
  })

  it('tenth-most goals in a Season: 43 ±5', () => {
    within(
      average((s) => s.tenthMostGoals),
      43,
      5,
    )
  })

  it('Skaters with 40+ goals: 15 ±6', () => {
    within(
      average((s) => s.fortyGoalScorers),
      15,
      6,
    )
  })

  it('top-10 scorers by points: 1.75 ±0.35 assists per goal', () => {
    within(
      average((s) => s.assistsPerGoalAtTheTop),
      1.75,
      0.35,
    )
  })

  it("defencemen's share of goals: 15.2% ±2.5 pp", () => {
    within(
      average((s) => s.defenceGoals),
      15.2,
      2.5,
    )
  })

  it("defencemen's share of assists: 31.3% ±3 pp", () => {
    within(
      average((s) => s.defenceAssists),
      31.3,
      3,
    )
  })

  it("defencemen's share of shots on goal: 27.6% ±3 pp", () => {
    within(
      average((s) => s.defenceShots),
      27.6,
      3,
    )
  })

  it('Goalie save percentage spread, p90 - p10: 0.0335 ±0.010', () => {
    within(
      average((s) => s.goalieSpread),
      0.0335,
      0.01,
    )
  })

  it('median Goalie save percentage: 0.895 ±0.008', () => {
    within(
      average((s) => s.medianGoalie),
      0.895,
      0.008,
    )
  })

  it('Goalies with 20+ Fixtures: 61 ±8', () => {
    within(
      average((s) => s.regularGoalies),
      61,
      8,
    )
  })

  it('the most-used Goalie has 59.0% ±5 pp of the Fixtures', () => {
    within(
      average((s) => s.starterShare),
      59,
      5,
    )
  })

  it('Skaters on the regular Lineups miss 12.8% ±3 pp of Fixtures', () => {
    within(
      average((s) => s.missed),
      12.8,
      3,
    )
  })

  it('a starter out-saves the rest by 0.0065 ±0.005', () => {
    within(
      average((s) => s.startersGap),
      0.0065,
      0.005,
    )
  })
})
