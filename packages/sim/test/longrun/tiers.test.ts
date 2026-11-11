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
 */

const tenth = async () => (await longRuns()).map((run) => run.last)

aggregateSuite('eight tenth Seasons', tenth)
distributionSuite('eight tenth Seasons', tenth)
standingsSuite('eight tenth Seasons', tenth)
restSuite('eight tenth Seasons', tenth)
iceTimeSuite('eight tenth Seasons', tenth)
