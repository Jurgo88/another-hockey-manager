import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS, writeRosterFile, type CompetitionRosters } from '@ahm/sim'
import { chooseRosters, estimateRosters } from './estimate.js'
import { ARCHIVED_VIEWS, fetchView } from './capwages/api.js'
import { fetchEdge, fetchMovement, fetchOutcome, fetchSeason } from './nhl/api.js'
import { movementOf } from './nhl/movement.js'
import { outcomeOf } from './nhl/outcome.js'
import { recordsOf } from './nhl/records.js'
import { withContracts } from './roster-contracts.js'

/**
 * ADR-021: estimate real NHL Rosters for a season and write them as a roster
 * file. With `--contracts`, each Player carries the contract CapWages shows for
 * the season (#125); that file is written apart and kept out of git, since only
 * derived tables of CapWages are committed (R-10).
 */

const HELP = `Usage: pnpm sim:estimate [options]

  --season <id>    NHL season, such as 20252026 (default)
  --out <path>     Where to write the roster file
                   (default packages/estimate/data/nhl-<season>.json)
  --contracts      Give each Player his real contract from CapWages, and write
                   the file to data/nhl-<season>-contracts.json, outside git (#125)
  --refresh        Fetch again instead of reading the cache
  --help           Show this message`

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function summary(rosters: CompetitionRosters): string {
  const counts = new Map<string, number>()
  let players = 0
  let filled = 0
  for (const club of rosters.clubs) {
    for (const player of [...club.skaters, ...club.goalies]) {
      players++
      if (!player.id.startsWith('nhl-')) filled++
      for (const entry of Object.values(player.provenance ?? {})) {
        counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1)
      }
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const shares = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([source, n]) => `${source} ${((n / total) * 100).toFixed(1)}%`)
  return `${players} Players, ${filled} generated to fill Rosters. Attributes: ${shares.join(', ')}`
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      season: { type: 'string', default: '20252026' },
      out: { type: 'string' },
      contracts: { type: 'boolean', default: false },
      refresh: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    console.log(HELP)
    return
  }

  const season = values.season
  if (!/^(\d{4})(\d{4})$/.test(season) || Number(season.slice(4)) !== Number(season.slice(0, 4)) + 1) {
    throw new Error(`--season must look like 20252026, got "${season}"`)
  }

  const fetchOptions = {
    cacheDir: join(PACKAGE, '.cache'),
    refresh: values.refresh,
    log: (message: string) => console.error(message),
  }
  const clubs = NHL_2026_27_CLUB_SEEDS
  const raw = await fetchSeason(season, clubs.map((c) => c.code), fetchOptions)

  // EDGE is one request per Player, so only for those who make a Roster.
  const chosen = chooseRosters(recordsOf(raw), clubs)
  const ids = chosen.flatMap((c) => [...c.forwards, ...c.defence].map((p) => p.record.playerId))
  const edge = await fetchEdge(season, ids, fetchOptions)

  const rosters = estimateRosters(recordsOf({ ...raw, edge }), {
    structure: NHL_2026_27,
    clubs,
    ageDate: `${season.slice(0, 4)}-10-01`,
  })

  const path = values.out
    ? resolve(process.env.INIT_CWD ?? process.cwd(), values.out)
    : join(PACKAGE, 'data', `nhl-${season}${values.contracts ? '-contracts' : ''}.json`)
  mkdirSync(dirname(path), { recursive: true })
  const year = Number(season.slice(0, 4))
  if (values.contracts) {
    if (!ARCHIVED_VIEWS[year] && year !== 2026) throw new Error(`No CapWages view of ${season}`)
    const { players } = movementOf(await fetchMovement([season], fetchOptions))
    const signed = withContracts(rosters, await fetchView(year, fetchOptions), players)
    writeFileSync(path, writeRosterFile(signed.rosters, signed.upperLimit))
    console.log(summary(signed.rosters))
    console.log(`${signed.contracted} of ${signed.players} Players hold their real contract`)
  } else {
    writeFileSync(path, writeRosterFile(rosters))
    console.log(summary(rosters))
  }
  console.log(`Wrote ${path}`)

  // What really happened, for pnpm sim:validate to compare with (#18).
  const outcome = outcomeOf(await fetchOutcome(raw, fetchOptions))
  const outcomePath = join(PACKAGE, 'data', `nhl-${season}-outcome.json`)
  writeFileSync(outcomePath, `${JSON.stringify(outcome, null, 1)}
`)
  console.log(`Wrote ${outcomePath}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
