import { iceTimeSuite } from '../support/ice-time.js'
import { cachedSeason } from '../support/simulations.js'

/** On the first Season of one generated league; `test/longrun/` holds the tenth of eight (#90). */
iceTimeSuite('one first Season', async () => [await cachedSeason(2026)])
