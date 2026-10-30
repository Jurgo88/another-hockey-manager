import { describe, expect, it } from 'vitest'
import type { PlayerId } from '../../src/domain/player.js'
import { simulateSeason } from '../../src/cli/season.js'

/**
 * FR-23 and the ice-time rows of Tier 2 (04-validation-targets.md).
 *
 * Forwards are ranked league-wide by ice time per Fixture: tier 1 is ranks
 * 1-96, tier 4 is ranks 289-384. The rank tiers are the measured definition,
 * not Lineup slots, so the engine is held to exactly what was measured.
 */

const SEASON_SEED = 2026
const TIER_SIZE = 96

const TIER_1_SECONDS = 19 * 60 + 34
const TIER_4_SECONDS = 12 * 60 + 3
const SECONDS_BAND = 60
const RATIO = 1.62
const RATIO_BAND = 0.12

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

async function forwardIceTimePerFixture(): Promise<number[]> {
  const { lineups, season } = await simulateSeason(SEASON_SEED)

  const forwards = new Set<PlayerId>(
    [...lineups.values()].flatMap((lineup) =>
      lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
    ),
  )

  return [...season.skaters]
    .filter(([id]) => forwards.has(id))
    .map(([, skater]) => skater.iceTimeSeconds / skater.gamesPlayed)
    .sort((a, b) => b - a)
}

describe('ice-time deployment (FR-23, Tier 2)', async () => {
  const perFixture = await forwardIceTimePerFixture()
  const tier1 = mean(perFixture.slice(0, TIER_SIZE))
  const tier4 = mean(perFixture.slice(3 * TIER_SIZE, 4 * TIER_SIZE))

  it('fields a full league of 384 dressed forwards', () => {
    expect(perFixture).toHaveLength(4 * TIER_SIZE)
  })

  it(`tier-1 forwards play ${TIER_1_SECONDS}s ±${SECONDS_BAND}s per Fixture`, () => {
    expect(tier1).toBeGreaterThanOrEqual(TIER_1_SECONDS - SECONDS_BAND)
    expect(tier1).toBeLessThanOrEqual(TIER_1_SECONDS + SECONDS_BAND)
  })

  it(`tier-4 forwards play ${TIER_4_SECONDS}s ±${SECONDS_BAND}s per Fixture`, () => {
    expect(tier4).toBeGreaterThanOrEqual(TIER_4_SECONDS - SECONDS_BAND)
    expect(tier4).toBeLessThanOrEqual(TIER_4_SECONDS + SECONDS_BAND)
  })

  it(`the tier-1 to tier-4 ratio is ${RATIO} ±${RATIO_BAND}`, () => {
    const ratio = tier1 / tier4
    expect(ratio).toBeGreaterThanOrEqual(RATIO - RATIO_BAND)
    expect(ratio).toBeLessThanOrEqual(RATIO + RATIO_BAND)
  })
})
