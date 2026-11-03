import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The gate simulates ten Seasons on the real Rosters.
    testTimeout: 300_000,
  },
})
