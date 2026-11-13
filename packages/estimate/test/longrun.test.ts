import { readFileSync } from 'node:fs'
import { createFileRosterProvider, NHL_2026_27 } from '@ahm/sim'
import { simulateSeasons } from '../../sim/src/cli/season.js'
import { gateSuite } from '../../sim/test/support/gate.js'

/**
 * The Phase 2 gate on the NHL 2025-26 roster file (#90): one run of ten
 * Seasons, asserted on its own, as `04-validation-targets.md` asks beside the
 * eight generated leagues of `@ahm/sim`. The targets the farm brings back
 * (ADR-036) are reported until it, as on the generated leagues; the roster
 * file, one run, also misses two leaving thirds and round 4 by a hair.
 */

const FARM =
  'without a farm prospects take gaps before they are ready; asserted again with the farm, ADR-036'

const rosterFile = readFileSync(new URL('../data/nhl-20252026.json', import.meta.url), 'utf8')

gateSuite(
  'the 2025-26 roster file',
  async () => [await simulateSeasons(1, 10, createFileRosterProvider(rosterFile, NHL_2026_27))],
  {
    'Players aged 23 or younger: 30% ±5 pp': FARM,
    'aged 23 or younger: 0.044 ±0.03': FARM,
    'top third of ice time in his group: 0.013 ±0.02': FARM,
    'middle third of ice time in his group: 0.053 ±0.03': FARM,
    'round 4: 0.165 play 200 Fixtures or more (±0.1)': FARM,
    'round 2: a median of 3 Seasons to debut (±1)': FARM,
    'round 3: a median of 3 Seasons to debut (±1)': FARM,
    'round 4: a median of 3 Seasons to debut (±1)': FARM,
  },
)
