import { simulateSeason, simulateSeasons } from '../../src/cli/season.js'
import { entryPath, seasonEntry, write } from './simulations.js'

/**
 * Simulates one result for the cache of `simulations.ts`, in a process of its
 * own: `season <seed>` or `run <seed> <count>`.
 */

const [kind, seed, count] = process.argv.slice(2)

if (kind === 'season') {
  write(entryPath(`season-${seed}`), seasonEntry(await simulateSeason(Number(seed))))
} else if (kind === 'run') {
  write(entryPath(`run-${seed}-${count}`), await simulateSeasons(Number(seed), Number(count)))
} else {
  throw new Error(`Unknown simulation "${kind}"`)
}
