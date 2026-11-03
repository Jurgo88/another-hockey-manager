import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '@ahm/sim'
import type { SeasonOutcome } from './nhl/outcome.js'
import { compare, formatComparison, simulateSeasons } from './validate.js'

/** #18: simulate Seasons on the estimated Rosters and compare them with the real one. */

const HELP = `Usage: pnpm sim:validate [options]

  --season <id>    NHL season of the roster file, such as 20252026 (default)
  --seasons <n>    Simulated Seasons to average (default 10)
  --help           Show this message`

const DATA = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'data')

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      season: { type: 'string', default: '20252026' },
      seasons: { type: 'string', default: '10' },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    console.log(HELP)
    return
  }
  const count = Number(values.seasons)
  if (!Number.isSafeInteger(count) || count < 1) throw new Error(`--seasons must be a positive integer`)

  const rosterFile = readFileSync(join(DATA, `nhl-${values.season}.json`), 'utf8')
  const outcome = JSON.parse(
    readFileSync(join(DATA, `nhl-${values.season}-outcome.json`), 'utf8'),
  ) as SeasonOutcome
  const seeds = Array.from({ length: count }, (_, i) => i + 1)
  const simulated = await simulateSeasons(rosterFile, NHL_2026_27, seeds)
  console.log(formatComparison(compare(outcome, simulated, NHL_2026_27_CLUB_SEEDS), count))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
