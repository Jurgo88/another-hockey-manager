import { describe, expect, it } from 'vitest'
import { simulateSeason } from '../support/season.js'

/**
 * Tier 1 rows that possession resolution (#4) owns: goals, shots on goal,
 * shooting and save percentage (04-validation-targets.md). Measured NHL
 * 2025-26 means.
 *
 * Pooled over eight Seasons of different generated leagues - 10,752
 * Fixtures, the spec's "10,000 Fixtures from fixed seeds". One league is not
 * enough: how good its goalies happen to be moves league scoring by more
 * than the band, and that is the talent model's variance, not the engine's.
 *
 * Every minute is still played at even strength. When special teams (#5)
 * add power-play goals, even-strength scoring must come down to make room -
 * these bands stay where they are.
 */

const SEASON_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

const within = (value: number, target: number, band: number) => {
  expect(value).toBeGreaterThanOrEqual(target - band)
  expect(value).toBeLessThanOrEqual(target + band)
}

describe('Tier 1 aggregate rates', async () => {
  let fixtures = 0
  let goals = 0
  let shotsOnGoal = 0
  let shotsAgainst = 0
  let saves = 0

  for (const seed of SEASON_SEEDS) {
    const { matches, season } = await simulateSeason(seed)
    fixtures += matches.length
    for (const club of season.clubs.values()) {
      goals += club.goalsFor
      shotsOnGoal += club.shotsFor
    }
    for (const goalie of season.goalies.values()) {
      shotsAgainst += goalie.shotsAgainst
      saves += goalie.saves
    }
  }

  it('goals per Fixture, both Clubs: 6.16 ±0.30', () => {
    within(goals / fixtures, 6.16, 0.3)
  })

  it('shots on goal per Club per Fixture: 27.8 ±2.0', () => {
    within(shotsOnGoal / fixtures / 2, 27.8, 2.0)
  })

  it('shooting percentage: 11.1% ±1.0 pp', () => {
    within((100 * goals) / shotsOnGoal, 11.1, 1.0)
  })

  it('league save percentage: 0.889 ±0.008', () => {
    within(saves / shotsAgainst, 0.889, 0.008)
  })
})
