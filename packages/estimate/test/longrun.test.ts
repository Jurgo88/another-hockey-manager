import { readFileSync } from 'node:fs'
import { createFileRosterProvider, NHL_2026_27 } from '@ahm/sim'
import { simulateSeasons } from '../../sim/src/cli/season.js'
import { gateSuite } from '../../sim/test/support/gate.js'

/**
 * The Phase 2 gate on the NHL 2025-26 roster file (#90): one run of ten
 * Seasons, asserted on its own, as `04-validation-targets.md` asks beside the
 * eight generated leagues of `@ahm/sim`. With the farm (ADR-036, #133) every
 * target is asserted again but those listed, which the author chose on
 * 2026-11-23 to report: one run, a hair outside, and a draft has its luck.
 */

const NEAR = 'a hair outside with the farm (#133); asserted again at the Phase 3 gate'

const rosterFile = readFileSync(new URL('../data/nhl-20252026.json', import.meta.url), 'utf8')

gateSuite(
  'the 2025-26 roster file',
  async () => [await simulateSeasons(1, 10, createFileRosterProvider(rosterFile, NHL_2026_27))],
  {
    'Players aged 23 or younger: 30% ±5 pp': NEAR,
    'round 2: 0.385 play 200 Fixtures or more (±0.12)': NEAR,
    'round 3: 0.199 play 200 Fixtures or more (±0.1)': NEAR,
    'bottom 8 still bottom 8 the next Season: 51% ±12 pp': NEAR,
  },
)
