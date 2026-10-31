import { describe, expect, it } from 'vitest'
import type { PlayerId } from '../../src/domain/player.js'
import { simulateSeason } from '../../src/cli/season.js'
import { points, savePercentage } from '../../src/stats/match.js'

/**
 * Tier 2 distribution (04-validation-targets.md): the gate that says scoring
 * lands on the right Players, not only in the right quantity (R-01). Ice time
 * and the standings extremes have their own suites.
 *
 * Every figure is averaged over eight Seasons, so one Season may fall outside
 * its band while the engine stays on target.
 *
 * `it.fails` marks a row known to be red until calibration (#15). It keeps CI
 * green, and trips when the row lands, so the marker has to come off then.
 * The bands themselves do not move (04-validation-targets.md, Failure protocol).
 */

const SEASON_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]
const TIER_SIZE = 96
const QUALIFYING_SKATER_FIXTURES = 40
const QUALIFYING_GOALIE_FIXTURES = 20
const LEADERBOARD_SIZE = 10

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
      const { lineups, season } = await simulateSeason(seed)
      const forwardIds = new Set<PlayerId>(
        [...lineups.values()].flatMap((lineup) =>
          lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
        ),
      )

      const skaters = [...season.skaters.values()]
      const pointTotals = skaters.map(points).sort(descending)
      const qualified = skaters.filter((s) => s.gamesPlayed >= QUALIFYING_SKATER_FIXTURES)

      const forwards = [...season.skaters].filter(([id]) => forwardIds.has(id)).map(([, s]) => s)
      const byPoints = forwards.map(points).sort(descending)
      const byIceTime = forwards.map((s) => s.iceTimeSeconds / s.gamesPlayed).sort(descending)
      const tierRatio = (ranked: readonly number[]) =>
        mean(ranked.slice(0, TIER_SIZE)) / mean(ranked.slice(3 * TIER_SIZE, 4 * TIER_SIZE))

      const goals = skaters.map((s) => s.goals).sort(descending)
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
        goalieSpread: percentile(savePercentages, 0.9) - percentile(savePercentages, 0.1),
        medianGoalie: percentile(savePercentages, 0.5),
      }
    }),
  )

  const average = (read: (season: (typeof seasons)[number]) => number) => mean(seasons.map(read))

  // Known red, mean 113 (#15): the top is too even, leader over fifth is 1.12 against 1.34.
  it.fails('league scoring leader: 141 ±25 points', () => {
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

  // Known red, mean 5.92 (#15), and no Season is inside the band.
  it.fails('forward tier-1 to tier-4 point ratio: 4.4 ±0.8', () => {
    within(
      average((s) => s.pointRatio),
      4.4,
      0.8,
    )
  })

  // Known red, mean 3.65 (#15). Ice time is on target, so the gap is in the scoring rate.
  it.fails('forward tier-1 to tier-4 points-per-minute ratio: 2.71 ±0.50', () => {
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

  // Measured over 66 Goalies with 20+ appearances. Until backups play (#33) the
  // engine's sample is its 32 starters, so these two rows prove less than they seem to.
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
})
