import { aggregateSuite } from '../support/aggregate.js'
import { cachedSeason } from '../support/simulations.js'

/** On the first Seasons of eight generated leagues; `test/longrun/` holds their tenth (#90). */
aggregateSuite('eight first Seasons', () => Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(cachedSeason)))
