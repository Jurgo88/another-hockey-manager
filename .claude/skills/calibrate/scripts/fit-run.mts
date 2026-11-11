// One run for fitting: tsx fit-run.mts <seed> <out.json> [rosterFile]
//
// PATCH (env): JSON {"<module under src>": {"<export>": {<key>: <value>}}}, assigned
//   onto the exported object before the run, so a trial needs no source edit.
//   Example: PATCH='{"draft/index.ts":{"SWAP":{"margin":2}}}'
//   Only properties of exported objects can be patched, not exported numbers.
// SEASONS (env): how many Seasons, default 10.
import { readFileSync, writeFileSync } from 'node:fs'
import { replacer, sim } from './sim.mts'

if (process.env.PATCH) {
  const patch = JSON.parse(process.env.PATCH) as Record<string, Record<string, object>>
  for (const [path, exports] of Object.entries(patch)) {
    const module = await sim(path)
    for (const [name, values] of Object.entries(exports)) {
      if (typeof module[name] !== 'object') throw new Error(`${path}: ${name} is not an object`)
      Object.assign(module[name], values)
    }
  }
}

const { simulateSeasons } = await sim('cli/season.ts')
const { createFileRosterProvider } = await sim('roster/file.ts')
const { NHL_2026_27 } = await sim('data/nhl-2026-27.ts')

const [seed, out, roster] = process.argv.slice(2)
if (!seed || !out) throw new Error('usage: tsx fit-run.mts <seed> <out.json> [rosterFile]')
const provider = roster
  ? createFileRosterProvider(readFileSync(roster, 'utf8'), NHL_2026_27)
  : undefined
const run = await simulateSeasons(Number(seed), Number(process.env.SEASONS ?? 10), provider)

// Mean attribute groups of the last Season, to see which kind of growth drifts.
const skaters = run.last.clubs.flatMap((c: any) => c.skaters)
const goalies = run.last.clubs.flatMap((c: any) => c.goalies)
const group = (players: any[], keys: string[]) =>
  players.reduce((t, p) => t + keys.reduce((u, k) => u + p.attributes[k], 0) / keys.length, 0) /
  players.length
const attrs = {
  skill: group(skaters, ['shooting', 'puckControl', 'checking']),
  reading: group(skaters, ['passing', 'offPositioning', 'defPositioning', 'shotBlocking']),
  physical: group(skaters, ['speed', 'stamina']),
  goalie: group(goalies, ['reflexes', 'recovery', 'positioning', 'reboundControl']),
}
writeFileSync(
  out,
  JSON.stringify({ attrs, seasons: run.seasons, last: { matches: run.last.matches } }, replacer),
)
