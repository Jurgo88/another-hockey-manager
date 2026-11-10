import { describe, expect, it } from 'vitest'
import { simulateSeasons } from '../../src/cli/season.js'
import { draftOutcomes, type DraftRoundOutcome } from '../../src/stats/history.js'

/**
 * What the draft yields (ADR-024, ADR-028, #89), against the Phase 2 targets in
 * `04-validation-targets.md`: of the first four classes, those of Seasons 2 to
 * 5, read in Season 10, the share of each round with 200 or more regular-Season
 * Fixtures and the median Seasons to debut, as `07-league-over-time.md` measured
 * the NHL classes of 2010 to 2018.
 *
 * Three ten-Season runs on generated leagues, each with nothing declared, so
 * every pick and move is the assistant's. Shares are pooled over the three, and
 * the median Seasons to debut is the median of the three medians.
 */

const SEEDS = [1, 2, 3]
const CLASSES = [2, 3, 4, 5]

const TARGETS = [
  { round: 1, regulars: 0.749, band: 0.12, debut: 1 },
  { round: 2, regulars: 0.385, band: 0.12, debut: 3 },
  { round: 3, regulars: 0.199, band: 0.1, debut: 3 },
  { round: 4, regulars: 0.165, band: 0.1, debut: 3 },
]

const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!

describe('the draft over ten Seasons', async () => {
  const tables: DraftRoundOutcome[][] = await Promise.all(
    SEEDS.map(async (seed) => draftOutcomes((await simulateSeasons(seed, 10)).seasons, CLASSES)),
  )

  for (const target of TARGETS) {
    const rows = tables.map((table) => table.find((row) => row.round === target.round)!)

    it(`round ${target.round}: ${target.regulars * 100}% play 200 Fixtures or more`, () => {
      const regulars = rows.reduce((sum, row) => sum + row.regulars, 0) / rows.length
      expect(regulars).toBeGreaterThanOrEqual(target.regulars - target.band)
      expect(regulars).toBeLessThanOrEqual(target.regulars + target.band)
    })

    it(`round ${target.round}: a median of ${target.debut} Seasons to debut`, () => {
      const debut = median(rows.map((row) => row.seasonsToDebut))
      expect(Math.abs(debut - target.debut)).toBeLessThanOrEqual(1)
    })
  }

  it('picks four rounds of 32 in every class', () => {
    for (const table of tables) expect(table.map((row) => row.picks)).toEqual([128, 128, 128, 128])
  })
})
