import type { Rng } from '../rng/index.js'
import { weightedIndex } from './draw.js'

/**
 * Injuries (ADR-012). Measured as absences of regular Skaters, NHL 2025-26.
 *
 * Every chance here is drawn inside `simulateFixture`, so an injury exists only
 * as an event in the stream (D-03), including one from outside a Match.
 */

/** Absences begun per Fixture played. A Player already out cannot get hurt, hence not per Club Fixture. */
const ABSENCES_PER_FIXTURE = 0.029
/** Share of absences begun away from a Match, as a chance before the opening faceoff. Unmeasured. */
const OFF_ICE_SHARE = 0.15

/** Mean seconds played by the regular Skaters the rate was measured on, 15+ minutes a Fixture. */
const MEAN_SKATER_SECONDS = 1200
const GOALIE_SECONDS = 3600

const IN_MATCH = ABSENCES_PER_FIXTURE * (1 - OFF_ICE_SHARE)

/** Chance a Player is hurt before the opening faceoff. */
export const OFF_ICE_INJURY_CHANCE = ABSENCES_PER_FIXTURE * OFF_ICE_SHARE

/** Chance a Skater is hurt in `seconds` on the ice: more ice time, more exposure. */
export function skaterInjuryChance(seconds: number): number {
  return (IN_MATCH * seconds) / MEAN_SKATER_SECONDS
}

/** Chance a Goalie is hurt in `seconds` in net. */
export function goalieInjuryChance(seconds: number): number {
  return (IN_MATCH * seconds) / GOALIE_SECONDS
}

/** Club Fixtures missed: shortest, longest, and the measured share of absences that long. */
const ABSENCE_LENGTHS: readonly (readonly [number, number, number])[] = [
  [1, 1, 40.9],
  [2, 3, 23.1],
  [4, 7, 16.0],
  [8, 15, 12.3],
  [16, 30, 6.1],
  [31, 60, 1.5],
]

/**
 * Calendar days per Club Fixture in the Season the lengths were measured on:
 * 82 Fixtures from 7 October 2025 to 16 April 2026, less the Olympic break.
 * An absence is kept in days (#97), so a summer heals as a Season's days do.
 */
const MEASURED_DAYS_PER_FIXTURE = 2.1

/**
 * How many calendar days an absence lasts, from the day of the Fixture it began
 * in. The Fixtures missed are drawn as measured, and the Player is back half a
 * Fixture's days after the last of them, so the next Fixture is missed however
 * the calendar falls. Off the ice this Fixture is the first one missed.
 */
export function absenceDays(rng: Rng, offIce = false): number {
  const index = weightedIndex(
    rng,
    ABSENCE_LENGTHS.map(([, , share]) => share),
  )
  const [shortest, longest] = ABSENCE_LENGTHS[index]!
  const after = rng.int(shortest, longest) - (offIce ? 1 : 0)
  return Math.round((after + 0.5) * MEASURED_DAYS_PER_FIXTURE)
}
