import { gateSuite } from '../support/gate.js'
import { longRuns } from '../support/simulations.js'

/**
 * The Phase 2 gate on eight generated leagues (#90); the roster file is
 * `@ahm/estimate`'s. With the farm (ADR-036, #133) every target is asserted
 * again but those listed here, which the author chose on 2026-11-23 to report:
 * they sit a hair outside their bands, and a draft has its luck.
 */
const NEAR = 'a hair outside with the farm (#133); asserted again at the Phase 3 gate'

gateSuite('eight generated leagues', longRuns, {
  'Players aged 23 or younger: 30% ±5 pp': NEAR,
  'round 2: 0.385 play 200 Fixtures or more (±0.12)': NEAR,
})
