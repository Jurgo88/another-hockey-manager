import { gateSuite } from '../support/gate.js'
import { longRuns } from '../support/simulations.js'

/** The Phase 2 gate on eight generated leagues (#90); the roster file is `@ahm/estimate`'s. */
gateSuite('eight generated leagues', longRuns)
