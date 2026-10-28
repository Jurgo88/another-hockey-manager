import { describe, expect, it } from 'vitest'
import type { Club, Lineup } from '../../src/domain/club.js'
import type { ClubId, PlayerId } from '../../src/domain/player.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../../src/data/nhl-2026-27.js'
import { buildNaiveLineup } from '../../src/engine/lineup.js'
import { generateSchedule } from '../../src/engine/schedule.js'
import { runShiftLoop } from '../../src/engine/shift-loop.js'
import { createGeneratedRosterProvider } from '../../src/generate/roster.js'
import { createRng } from '../../src/rng/index.js'
import { foldMatch } from '../../src/stats/match.js'
import { foldSeason } from '../../src/stats/season.js'
import { inRegulationPeriods } from '../support/streams.js'

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
  const identities = new Map(
    NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
  )
  const provider = createGeneratedRosterProvider({
    structure: NHL_2026_27,
    seed: SEASON_SEED,
    clubIdentities: identities,
  })
  const { clubs } = await provider.loadCompetition(NHL_2026_27.id)

  const entries = new Map<ClubId, { club: Club; lineup: Lineup }>(
    clubs.map((club) => [club.id, { club, lineup: buildNaiveLineup(club) }]),
  )

  const seasonRng = createRng(SEASON_SEED)
  const fixtures = generateSchedule({
    structure: NHL_2026_27,
    seasonId: 's2026',
    rng: seasonRng.fork('schedule'),
  })

  const matches = fixtures.map((fixture) => {
    const shifts = runShiftLoop(
      entries.get(fixture.homeClubId)!,
      entries.get(fixture.awayClubId)!,
      seasonRng.fork(`fixture:${fixture.id}`),
    )
    return foldMatch(fixture, inRegulationPeriods(shifts))
  })
  const season = foldSeason(matches)

  const forwards = new Set<PlayerId>(
    [...entries.values()].flatMap(({ lineup }) =>
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
