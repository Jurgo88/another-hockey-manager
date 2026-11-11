import { describe, expect, it } from 'vitest'
import { BEST_BEATS_WORST, bestBeatsWorstRate, clubs } from '../support/tactics.js'

/**
 * Tier 3 (04-validation-targets.md): every Tactics dial has a measurable,
 * directionally correct effect. The Lineup a Manager picks.
 */

describe('Tier 3 - tactics are not placebos: the Lineup', () => {
  it(`a Club's best Lineup beats its worst more than ${BEST_BEATS_WORST}% of the time`, () => {
    expect(bestBeatsWorstRate(clubs[0]!)).toBeGreaterThan(BEST_BEATS_WORST)
  })
})
