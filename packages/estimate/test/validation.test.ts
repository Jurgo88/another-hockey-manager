import { readFileSync } from 'node:fs'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '@ahm/sim'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SeasonOutcome } from '../src/nhl/outcome.js'
import { PHASE_GATE, compare, simulateSeasons, spearman, type Comparison } from '../src/validate.js'

/**
 * The Phase 0.5 gate (#18): Seasons on the estimated NHL 2025-26 Rosters
 * against the real 2025-26 season. A failure means calibrate the estimator,
 * not lower the gate (`04-validation-targets.md`).
 */

const data = (name: string) => readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8')
const SEASONS = 10

let comparison: Comparison

beforeAll(async () => {
  const outcome = JSON.parse(data('nhl-20252026-outcome.json')) as SeasonOutcome
  const simulated = await simulateSeasons(
    data('nhl-20252026.json'),
    NHL_2026_27,
    Array.from({ length: SEASONS }, (_, i) => i + 1),
  )
  comparison = compare(outcome, simulated, NHL_2026_27_CLUB_SEEDS)
})

describe('Phase 0.5 gate: the real 2025-26 season, simulated', () => {
  it('puts the Clubs roughly in the right order', () => {
    expect(comparison.clubRank).toBeGreaterThanOrEqual(PHASE_GATE.clubRank)
  })

  it('puts the right Players near the top of the scoring race', () => {
    expect(comparison.leadersFound).toBeGreaterThanOrEqual(PHASE_GATE.leadersFound)
  })

  it('orders the Goalies by save percentage as they really were', () => {
    expect(comparison.goalies.length).toBeGreaterThanOrEqual(25)
    expect(comparison.goalieRank).toBeGreaterThanOrEqual(PHASE_GATE.goalieRank)
  })
})

describe('rank correlation', () => {
  it('is 1 for the same order and -1 for the reverse, ties shared', () => {
    expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1)
    expect(spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1)
    expect(spearman([1, 1, 2], [5, 5, 9])).toBeCloseTo(1)
  })
})
