import { describe, expect, it } from 'vitest'
import { simulateSeason } from '../../src/cli/season.js'

/**
 * The age of a generated league (#84), against the Phase 2 targets in
 * `04-validation-targets.md`: the NHL 2015-16 to 2025-26 measured in
 * `07-league-over-time.md`. Ages are weighted by the Fixtures each Player
 * played, as the measurement is, so a Season is simulated for each seed.
 */

const SEASON_SEEDS = [1, 2, 3]

const within = (value: number, target: number, band: number) => {
  expect(value).toBeGreaterThanOrEqual(target - band)
  expect(value).toBeLessThanOrEqual(target + band)
}

describe('the age of a generated league', async () => {
  const leagues = await Promise.all(
    SEASON_SEEDS.map(async (seed) => {
      const season = await simulateSeason(seed)
      const ages = new Map(
        season.clubs.flatMap((club) => [...club.skaters, ...club.goalies]).map((p) => [p.id, p.age]),
      )
      return [...season.season.skaters, ...season.season.goalies]
        .filter(([, stats]) => stats.gamesPlayed > 0)
        .map(([id, stats]) => ({ age: ages.get(id)!, matches: stats.gamesPlayed }))
    }),
  )

  it.each(SEASON_SEEDS.map((seed, i) => [seed, leagues[i]!] as const))(
    'matches the measured profile, seed %i',
    (_, players) => {
      const matches = players.reduce((sum, p) => sum + p.matches, 0)
      const share = (test: (age: number) => boolean) => players.filter((p) => test(p.age)).length / players.length

      within(players.reduce((sum, p) => sum + p.age * p.matches, 0) / matches, 27.0, 0.7)
      within(share((age) => age >= 31), 0.18, 0.05)
      within(share((age) => age <= 23), 0.3, 0.05)
      expect(Math.max(...players.map((p) => p.age))).toBeGreaterThanOrEqual(38)
    },
  )
})
