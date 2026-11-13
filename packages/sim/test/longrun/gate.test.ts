import { gateSuite } from '../support/gate.js'
import { longRuns } from '../support/simulations.js'

/**
 * The Phase 2 gate on eight generated leagues (#90); the roster file is
 * `@ahm/estimate`'s. Until the farm (ADR-036) a prospect takes a gap before he is
 * ready, as `SWAP.gap` lets him: the young crowd the Rosters and debut early.
 * Those targets are reported here, and asserted again with the farm.
 */
const FARM =
  'without a farm prospects take gaps before they are ready; asserted again with the farm, ADR-036'

gateSuite('eight generated leagues', longRuns, {
  'Players aged 23 or younger: 30% ±5 pp': FARM,
  'aged 23 or younger: 0.044 ±0.03': FARM,
  'round 2: a median of 3 Seasons to debut (±1)': FARM,
  'round 3: a median of 3 Seasons to debut (±1)': FARM,
  'round 4: a median of 3 Seasons to debut (±1)': FARM,
})
