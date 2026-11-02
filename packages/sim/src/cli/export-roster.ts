import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { NHL_2026_27 } from '../data/nhl-2026-27.js'
import { writeRosterFile } from '../roster/file.js'
import { startSeason } from '../season/index.js'
import { integerOption, typedPath } from './options.js'

/** FR-19: write the generated Rosters of a seed as a roster file, to edit and import again. */

const HELP = `Usage: pnpm sim:roster [options]

  --seed <n>       Seed of the generated league, an integer (default 1)
  --out <path>     Write the file here instead of printing it
  --help           Show this message`

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      seed: { type: 'string', default: '1' },
      out: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  // The Rosters a Season of this seed would start on, exactly.
  const { clubs } = await startSeason(integerOption('--seed', values.seed, 0))
  const text = writeRosterFile({ structure: NHL_2026_27, clubs })

  if (values.out === undefined) {
    process.stdout.write(text)
    return
  }
  const path = typedPath(values.out)
  writeFileSync(path, text)
  console.log(`Wrote ${path}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
