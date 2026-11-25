import { simulateSeason, simulateSeasons } from '../../src/cli/season.js'
import { entryPath, seasonEntry, write } from './simulations.js'

/**
 * Simulates one result for the cache of `simulations.ts`, in a process of its
 * own: `season <seed> [farm]` or `run <seed> <count> [farm]`, `farm` playing
 * the farm's games (#135).
 */

const [kind, seed, ...rest] = process.argv.slice(2)
const playFarm = rest.includes('farm')
const farm = playFarm ? 'farm-' : ''

if (kind === 'season') {
  write(
    entryPath(`season-${farm}${seed}`),
    seasonEntry(await simulateSeason(Number(seed), undefined, undefined, { playFarm })),
  )
} else if (kind === 'run') {
  const count = rest[0]
  write(
    entryPath(`run-${farm}${seed}-${count}`),
    await simulateSeasons(Number(seed), Number(count), undefined, undefined, { playFarm }),
  )
} else {
  throw new Error(`Unknown simulation "${kind}"`)
}
