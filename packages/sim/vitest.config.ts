import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Realism suites simulate tens of thousands of fixtures; they need room.
    testTimeout: 120_000,
  },
})
