import { defineWorkspace } from 'vitest/config'

/**
 * The test tiers (#106). `unit` is the loop while working. `realism` asserts the
 * targets of one Season and `longrun` those of a run of Seasons (Phase 2), both
 * on Seasons simulated once and cached (`test/support/simulations.ts`). The
 * Definition of Done needs all three.
 *
 * `farm` (#135) runs the realism suites of a Season on Seasons whose affiliates
 * play their games, against the same bands, with the farm's own report. It is
 * not part of `pnpm test`: it runs on request (`pnpm test:farm`) and weekly in
 * CI. The tactics suites play no Season, so they are left out of it.
 */
export default defineWorkspace([
  { test: { name: 'unit', include: ['test/*.test.ts'], testTimeout: 120_000 } },
  // Realism suites simulate tens of thousands of fixtures; they need room.
  { test: { name: 'realism', include: ['test/realism/**/*.test.ts'], testTimeout: 300_000 } },
  { test: { name: 'longrun', include: ['test/longrun/**/*.test.ts'], testTimeout: 600_000 } },
  {
    test: {
      name: 'farm',
      include: ['test/realism/**/*.test.ts', 'test/farm/**/*.test.ts'],
      exclude: ['test/realism/tactics-*.test.ts'],
      env: { AHM_PLAY_FARM: '1' },
      testTimeout: 600_000,
    },
  },
])
