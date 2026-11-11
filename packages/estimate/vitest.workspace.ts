import { defineWorkspace } from 'vitest/config'

/** The test tiers (#106): the Phase 0.5 gate simulates ten Seasons, the rest is quick. */
export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['test/**/*.test.ts'],
      exclude: ['test/validation.test.ts'],
      testTimeout: 120_000,
    },
  },
  // The gate simulates ten Seasons on the real Rosters.
  { test: { name: 'realism', include: ['test/validation.test.ts'], testTimeout: 300_000 } },
])
