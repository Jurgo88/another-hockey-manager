import { readFileSync } from 'node:fs'
import { createFileRosterProvider, NHL_2026_27 } from '@ahm/sim'
import { simulateSeasons } from '../../sim/src/cli/season.js'
import { gateSuite } from '../../sim/test/support/gate.js'

/**
 * The Phase 2 gate on the NHL 2025-26 roster file (#90): one run of ten
 * Seasons, asserted on its own, as `04-validation-targets.md` asks beside the
 * eight generated leagues of `@ahm/sim`.
 */

const rosterFile = readFileSync(new URL('../data/nhl-20252026.json', import.meta.url), 'utf8')

gateSuite('the 2025-26 roster file', async () => [
  await simulateSeasons(1, 10, createFileRosterProvider(rosterFile, NHL_2026_27)),
])
