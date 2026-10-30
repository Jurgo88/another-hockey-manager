import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { NHL_2026_27 } from '../data/nhl-2026-27.js'
import { renderPlayByPlay, renderSeason, seasonDump } from './format.js'
import { simulateSeason } from './season.js'

/** FR-13: simulate one Season and print its tables. */

const HELP = `Usage: pnpm sim:season [options]

  --seed <n>       Season seed, an integer (default 1)
  --top <n>        Rows in each leaders table (default 20)
  --fixture <id>   Also print one Fixture's play-by-play, e.g. s1-r00-00
  --json <path>    Also write the Season to a JSON file
  --help           Show this message`

function integerOption(flag: string, value: string, min: number): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new Error(`${flag} must be an integer of at least ${min}, got "${value}"`)
  }
  return parsed
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    // `pnpm sim:season -- --seed 7` passes the separator through to the script.
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      seed: { type: 'string', default: '1' },
      top: { type: 'string', default: '20' },
      fixture: { type: 'string' },
      json: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  const seed = integerOption('--seed', values.seed, 0)
  const top = integerOption('--top', values.top, 1)

  const season = await simulateSeason(seed)
  console.log(renderSeason(season, NHL_2026_27, top))

  if (values.fixture !== undefined) {
    console.log(`\n\n${renderPlayByPlay(season, values.fixture)}`)
  }

  if (values.json !== undefined) {
    // pnpm runs the script from the package; the path is meant from where it was typed.
    const path = resolve(process.env.INIT_CWD ?? process.cwd(), values.json)
    writeFileSync(path, JSON.stringify(seasonDump(season, NHL_2026_27), null, 2))
    console.log(`\nWrote ${path}`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
