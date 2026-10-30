import { describe, expect, it } from 'vitest'
import { simulateSeason } from '../../src/cli/season.js'

/**
 * Tier 1 aggregate rates (04-validation-targets.md): scoring from possession
 * resolution (#4) and special teams (#5). Measured NHL 2025-26 means.
 *
 * Pooled over eight Seasons of different generated leagues - 10,752
 * Fixtures, the spec's "10,000 Fixtures from fixed seeds". One league is not
 * enough: how good its goalies happen to be moves league scoring by more
 * than the band, and that is the talent model's variance, not the engine's.
 *
 * The three special-teams figures are linked - penalties times conversion is
 * power-play goals, and goals cutting power plays short is what brings 2.88
 * minors down to 285 seconds - so they are asserted together.
 */

const SEASON_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

const within = (value: number, target: number, band: number) => {
  expect(value).toBeGreaterThanOrEqual(target - band)
  expect(value).toBeLessThanOrEqual(target + band)
}

function standardDeviation(values: readonly number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1))
}

describe('Tier 1 aggregate rates', async () => {
  let fixtures = 0
  let goals = 0
  let shotsOnGoal = 0
  let shotsAgainst = 0
  let saves = 0
  let penalties = 0
  let powerPlayGoals = 0
  let powerPlaySeconds = 0
  let opportunities = 0
  let goalsAgainstShorthanded = 0
  let timesShorthanded = 0
  const penaltySpread: number[] = []

  for (const seed of SEASON_SEEDS) {
    const { matches, season } = await simulateSeason(seed)
    fixtures += matches.length
    for (const club of season.clubs.values()) {
      goals += club.goalsFor
      shotsOnGoal += club.shotsFor
      penalties += club.penalties
      powerPlayGoals += club.powerPlayGoals
      powerPlaySeconds += club.powerPlaySeconds
      opportunities += club.powerPlayOpportunities
      goalsAgainstShorthanded += club.powerPlayGoalsAgainst
      timesShorthanded += club.timesShorthanded
    }
    for (const goalie of season.goalies.values()) {
      shotsAgainst += goalie.shotsAgainst
      saves += goalie.saves
    }
    penaltySpread.push(
      standardDeviation([...season.clubs.values()].map((c) => c.penalties / c.gamesPlayed)),
    )
  }
  const perClub = (total: number) => total / fixtures / 2

  it('goals per Fixture, both Clubs: 6.16 ±0.30', () => {
    within(goals / fixtures, 6.16, 0.3)
  })

  it('shots on goal per Club per Fixture: 27.8 ±2.0', () => {
    within(perClub(shotsOnGoal), 27.8, 2.0)
  })

  it('shooting percentage: 11.1% ±1.0 pp', () => {
    within((100 * goals) / shotsOnGoal, 11.1, 1.0)
  })

  it('league save percentage: 0.889 ±0.008', () => {
    within(saves / shotsAgainst, 0.889, 0.008)
  })

  it('penalties committed per Club per Fixture: 2.88 ±0.15', () => {
    within(perClub(penalties), 2.88, 0.15)
  })

  it('power-play goals per Club per Fixture: 0.61 ±0.06', () => {
    within(perClub(powerPlayGoals), 0.61, 0.06)
  })

  it('power-play time per Club per Fixture: 285 s ±20 s', () => {
    within(perClub(powerPlaySeconds), 285, 20)
  })

  it('power-play success: 21.1% ±2.5 pp', () => {
    within((100 * powerPlayGoals) / opportunities, 21.1, 2.5)
  })

  it('penalty-kill success: 78.9% ±2.5 pp', () => {
    within(100 * (1 - goalsAgainstShorthanded / timesShorthanded), 78.9, 2.5)
  })

  it('mean duration of one power play: 99 s ±8 s', () => {
    within(powerPlaySeconds / opportunities, 99, 8)
  })

  it('SD across Clubs of penalties per Fixture: 0.22 ±0.10', () => {
    // Averaged over the Seasons: one Season's SD carries its own sampling noise.
    within(penaltySpread.reduce((sum, s) => sum + s, 0) / penaltySpread.length, 0.22, 0.1)
  })
})
