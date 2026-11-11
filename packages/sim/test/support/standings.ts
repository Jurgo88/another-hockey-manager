import { describe, expect, it } from 'vitest'
import { NHL_2026_27 } from '../../src/data/nhl-2026-27.js'
import { foldStandings } from '../../src/stats/standings.js'
import { targetIt, type Reported } from './reported.js'
import type { SeasonSample } from './simulations.js'

/**
 * Standings realism (04-validation-targets.md): the Tier 1 mean, and the
 * Tier 2 extremes that say talent turns into standings - and that luck alone
 * does not.
 *
 * The extremes are averaged over eight Seasons. One Season's best and worst
 * are the least stable statistics there are, which is why their bands are
 * wide; the average is what the engine is calibrated to.
 */

const FIXTURES_PER_CLUB = 84

const within = (value: number, target: number, band: number) => {
  expect(value).toBeGreaterThanOrEqual(target - band)
  expect(value).toBeLessThanOrEqual(target + band)
}

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

/** The suite on the Seasons given: the first of eight leagues, or their tenth (#90). */
export function standingsSuite(
  when: string,
  samples: () => Promise<readonly SeasonSample[]>,
  reported: Reported = {},
): void {
  const target = targetIt(reported)
  describe(`standings over a full Season, ${when}`, async () => {
    const all = await samples()
    const seasons = all.map(({ matches }) => ({
      matches,
      rows: foldStandings(NHL_2026_27, matches),
    }))

    it('reconciles every table against its Fixtures', () => {
      for (const { matches, rows } of seasons) {
        const extraTime = matches.filter((m) => m.result.decidedIn !== 'regulation').length
        expect(rows.every((row) => row.gamesPlayed === FIXTURES_PER_CLUB)).toBe(true)
        expect(rows.reduce((sum, row) => sum + row.points, 0)).toBe(2 * matches.length + extraTime)
      }
    })

    it('mean Club points: 94 ±3 (Tier 1)', () => {
      within(mean(seasons.flatMap(({ rows }) => rows.map((row) => row.points))), 94, 3)
    })

    it('best Club points: 124 ±14 (Tier 2)', () => {
      within(mean(seasons.map(({ rows }) => rows[0]!.points)), 124, 14)
    })

    it('worst Club points: 59 ±14 (Tier 2)', () => {
      within(mean(seasons.map(({ rows }) => rows.at(-1)!.points)), 59, 14)
    })

    target('standings spread, best minus worst: 65 ±18 (Tier 2)', () => {
      within(mean(seasons.map(({ rows }) => rows[0]!.points - rows.at(-1)!.points)), 65, 18)
    })
  })
}
