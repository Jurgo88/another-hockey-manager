import { aggregateSuite } from '../support/aggregate.js'
import { distributionSuite } from '../support/distribution.js'
import { iceTimeSuite } from '../support/ice-time.js'
import { restSuite } from '../support/rest.js'
import { longRuns } from '../support/simulations.js'
import { standingsSuite } from '../support/standings.js'

/**
 * Tier 1 and Tier 2 must hold in the tenth Season as well as the first (Phase 2
 * gate, #90): the realism suites on the last regular Season of each of the
 * eight generated runs, pooled as the first Seasons are.
 *
 * Six targets are reported here, not asserted (04-validation-targets.md). They
 * stay asserted in the first Season.
 */

const tenth = async () => (await longRuns()).map((run) => run.last)

/**
 * Over ten Seasons Clubs replace their weakest Players with prospects, so the
 * bottom of a Roster is deeper than in the generated league the engine is
 * fitted on. Contracts change that in Phase 3.
 */
const DEPTH = 'deeper Rosters over ten Seasons, asserted at the Phase 3 gate'

/** Nothing but a Roster keeps a Club strong or weak until Phase 3, so a run converges. */
const CONVERGES = 'a run converges without contracts, asserted at the Phase 3 gate'

/** Rosters crowded with young Players until the farm (ADR-036). */
const FARM =
  'without a farm prospects take gaps before they are ready; asserted again with the farm, ADR-036'

aggregateSuite('eight tenth Seasons', tenth, {
  'penalties committed per Club per Fixture: 2.88 ±0.15': FARM,
  'lowest Club penalties per Fixture: 2.40 ±0.15': DEPTH,
  'highest Club penalties per Fixture: 3.24 ±0.15': DEPTH,
})
distributionSuite('eight tenth Seasons', tenth, {
  'Skaters with 40+ goals: 15 ±6': FARM,
  'league scoring leader: 141 ±25 points': DEPTH,
  'forward tier-1 to tier-4 points-per-minute ratio: 2.71 ±0.50': DEPTH,
})
standingsSuite('eight tenth Seasons', tenth, {
  'standings spread, best minus worst: 65 ±18 (Tier 2)': CONVERGES,
})
restSuite('eight tenth Seasons', tenth, {
  'a back-to-back costs 0.20 ±0.15 goals for': "the engine's fatigue is weak in every Season, #109",
})
iceTimeSuite('eight tenth Seasons', tenth)
