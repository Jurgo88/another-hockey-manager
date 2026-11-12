import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  ageCurve,
  ageProfiles,
  agesByTier,
  draftOutcomes,
  goalieChanges,
  iceTimeChanges,
  leaving,
  productionChanges,
  speedChanges,
  tableTurnover,
  turnoverOfPlayers,
  type AgeCurve,
  type LeavingRow,
} from './measure.js'
import { fetchHistory, fetchMovement } from './nhl/api.js'
import { historyOf } from './nhl/history.js'
import { movementOf } from './nhl/movement.js'
import { contractsReport, movementReport } from './report-movement.js'
import { fetchView } from './capwages/api.js'
import { capShares, type CapShares } from './contracts.js'

/** #83: how the real league changes over time, as markdown for `04-validation-targets.md`. */

const HELP = `Usage: pnpm sim:measure [options]

  --first <year>   First season, by its starting year (default 2015)
  --last <year>    Last season, by its starting year (default 2025)
  --ages           Print the age profile by tier as a data module for @ahm/sim
  --movement       Print who changes Club, who moves during a season, and continuity (#122)
  --contracts      Print cap shares, payrolls, terms and re-signing from CapWages (#122)
  --module         With --contracts, print the cap shares as a data module for @ahm/sim (#125)
  --refresh        Fetch again instead of reading the cache
  --help           Show this message`

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DRAFT_YEARS = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018]

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const fixed = (x: number, digits = 2) => (x >= 0 ? ' ' : '') + x.toFixed(digits)

function curveTable(title: string, unit: string, curve: AgeCurve, digits = 2): string {
  const level = new Map(curve.level.map((l) => [l.age, l.level]))
  return [
    `### ${title}`,
    '',
    `Peak at ${curve.peakAge}. Change is from the season at that age to the next; level is relative to the peak.`,
    '',
    `| Age | Pairs | Change (${unit}) | Level at age + 1 |`,
    '| --- | --- | --- | --- |',
    ...curve.steps.map(
      (s) =>
        `| ${s.age} | ${s.pairs} | ${fixed(s.change, digits)} | ${fixed(level.get(s.age + 1) ?? 0, digits)} |`,
    ),
  ].join('\n')
}

function leavingTable(title: string, rows: readonly LeavingRow[]): string {
  return [
    `### ${title}`,
    '',
    '| Group | Player-seasons | Gone the next season | Rate |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.group} | ${r.players} | ${r.left} | ${pct(r.rate)} |`),
  ].join('\n')
}

/** The age profile as `packages/sim/src/generate/nhl-age-profile.ts`. */
function ageModule(tiers: readonly Map<number, number>[], first: number, last: number): string {
  const span = (year: number) => `${year}-${String(year + 1).slice(2)}`
  const rows = tiers.map((tier) =>
    [...tier]
      .sort((a, b) => a[0] - b[0])
      .map(([age, count]) => `[${age}, ${count}]`)
      .join(', '),
  )
  return [
    '/**',
    ` * Ages of NHL Players, ${span(first)} to ${span(last)} (#84): those with 20 or more`,
    ' * Fixtures in a season by their ice-time third in their position group, and',
    " * those with fewer, who stand in for a Roster's spares. Each entry is",
    ' * [age, Player-seasons]. Written by `pnpm sim:measure --ages` into src/generate.',
    ' */',
    'export const NHL_AGES_BY_TIER: readonly (readonly (readonly [number, number])[])[] = [',
    '  // Top third by ice time',
    `  [${rows[0]}],`,
    '  // Middle third',
    `  [${rows[1]}],`,
    '  // Bottom third',
    `  [${rows[2]}],`,
    '  // Fewer than 20 Fixtures',
    `  [${rows[3]}],`,
    ']',
    '',
  ].join('\n')
}

/** The cap shares as `packages/sim/src/generate/nhl-cap-shares.ts`. */
function capSharesModule(shares: CapShares): string {
  const n = (value: number) => String(Math.round(value * 10_000) / 10_000)
  const list = (values: readonly number[]) => `[${values.map(n).join(', ')}]`
  const span = `${shares.season}-${String(shares.season + 1).slice(2)}`
  return [
    '/**',
    ` * Cap hits of NHL regulars (20 or more Fixtures), ${span}, from CapWages (#122,`,
    ' * #125): shares of the cap by tenth of role in each group, top first, and by',
    ' * third of role who holds an entry-level or restricted contract, what a',
    ' * restricted Skater is paid against an unrestricted one, and how long a new',
    " * standard contract runs. The generator prices a league's opening contracts",
    ' * from it (ADR-030). Written by `pnpm sim:measure --contracts --module`.',
    ' */',
    'export const NHL_CAP_SHARES = {',
    `  season: ${shares.season},`,
    `  regularsPerClub: { forward: ${n(shares.regularsPerClub.forward)}, defence: ${n(shares.regularsPerClub.defence)}, goalie: ${n(shares.regularsPerClub.goalie)} },`,
    '  byTenth: {',
    `    forward: ${list(shares.byTenth.forward)},`,
    `    defence: ${list(shares.byTenth.defence)},`,
    `    goalie: ${list(shares.byTenth.goalie)},`,
    '  },',
    '  byThird: [',
    ...shares.byThird.map(
      (t) =>
        `    { entryLevel: ${n(t.entryLevel)}, restricted: ${n(t.restricted)}, restrictedRatio: ${n(t.restrictedRatio)}, term: ${n(t.term)} },`,
    ),
    '  ],',
    '  // New standard contracts by third of role, then age band (to 24, 25-30, 31+), then term from 1 year',
    '  terms: [',
    ...shares.terms.map(
      (bands) => `    [${bands.map((counts) => `[${counts.join(', ')}]`).join(', ')}],`,
    ),
    '  ],',
    '} as const',
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      first: { type: 'string', default: '2015' },
      last: { type: 'string', default: '2025' },
      refresh: { type: 'boolean', default: false },
      ages: { type: 'boolean', default: false },
      movement: { type: 'boolean', default: false },
      contracts: { type: 'boolean', default: false },
      module: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) {
    console.log(HELP)
    return
  }
  const [first, last] = [Number(values.first), Number(values.last)]
  if (!(first >= 2010 && last > first && last <= 2025))
    throw new Error('--first and --last must be years, 2010-2025')

  const seasons = Array.from({ length: last - first + 1 }, (_, i) => `${first + i}${first + i + 1}`)
  const options = {
    cacheDir: join(PACKAGE, '.cache'),
    refresh: values.refresh,
    log: (message: string) => console.error(message),
  }
  if (values.movement) {
    console.log(movementReport(movementOf(await fetchMovement(seasons, options))))
    return
  }
  if (values.contracts) {
    const nhl = movementOf(await fetchMovement(['20242025', '20252026'], options))
    const views = [
      await fetchView(2024, options),
      await fetchView(2025, options),
      await fetchView(2026, options),
    ]
    console.log(
      values.module
        ? capSharesModule(capShares(views[1]!, nhl.players, [views[1]!, views[2]!]))
        : contractsReport(views, nhl.players),
    )
    return
  }
  const raw = await fetchHistory(
    seasons,
    { first: '20102011', last: seasons.at(-1)! },
    DRAFT_YEARS,
    options,
  )
  const history = historyOf(raw)
  if (values.ages) {
    console.log(ageModule(agesByTier(history), first, last))
    return
  }

  const players = turnoverOfPlayers(history)
  const table = tableTurnover(history)
  const out = [
    `## Measured, NHL ${first}-${String(first + 1).slice(2)} to ${last}-${String(last + 1).slice(2)} (pnpm sim:measure)`,
    '',
    curveTable(
      'Forwards: 5v5 points per 60, share of the mean',
      'share',
      ageCurve(productionChanges(history, false)),
    ),
    '',
    curveTable(
      'Defencemen: 5v5 points per 60, share of the mean',
      'share',
      ageCurve(productionChanges(history, true)),
    ),
    '',
    curveTable('Skaters: ice time per Fixture', 'minutes', ageCurve(iceTimeChanges(history))),
    '',
    curveTable(
      'Goalies: even-strength save percentage',
      'thousandths',
      ageCurve(goalieChanges(history, 500), 10),
      1,
    ),
    '',
    curveTable(
      'Skaters: NHL EDGE top speed, one pair of seasons',
      'mph',
      ageCurve(speedChanges(history), 10),
    ),
    '',
    leavingTable('Leaving the league, by age (20 or more Fixtures)', leaving(history).byAge),
    '',
    leavingTable('Leaving the league, by ice time in the group', leaving(history).byTier),
    '',
    `Per season, ${players.leaving.toFixed(0)} Players who played do not play the next, and ${players.debuts.toFixed(0)} play their first.`,
    '',
    `### Draft, classes ${DRAFT_YEARS[0]}-${DRAFT_YEARS.at(-1)}`,
    '',
    '| Round | Picks | Reached the NHL | 200 or more Fixtures | Median seasons to debut |',
    '| --- | --- | --- | --- | --- |',
    ...draftOutcomes(history, DRAFT_YEARS).map(
      (r) =>
        `| ${r.round} | ${r.picks} | ${pct(r.reached)} | ${pct(r.regulars)} | ${r.yearsToDebut} |`,
    ),
    '',
    '### The table from one season to the next',
    '',
    '| Measure | Value |',
    '| --- | --- |',
    `| Correlation of Club point shares, consecutive seasons | ${table.yearToYear.toFixed(2)} |`,
    `| Top 8 still top 8 the next season | ${pct(table.topStays)} |`,
    `| Bottom 8 still bottom 8 the next season | ${pct(table.bottomStays)} |`,
    `| Longest run in the top 8 | ${table.longestTopRun.seasons} seasons (${table.longestTopRun.code}) |`,
    `| Clubs that finished first, in ${table.seasons} seasons | ${table.distinctFirst} |`,
    `| Standard deviation of points over 84 Fixtures | ${table.spread.toFixed(1)} |`,
    '',
    '### The age of the league',
    '',
    '| Season | Mean age, by Fixtures | Aged 31 or more | Aged 23 or younger | Oldest |',
    '| --- | --- | --- | --- | --- |',
    ...ageProfiles(history).map(
      (p) =>
        `| ${p.season}-${String(p.season + 1).slice(2)} | ${p.meanAge.toFixed(1)} | ${pct(p.share31Plus)} | ${pct(p.share23OrYounger)} | ${p.oldest} |`,
    ),
  ]
  console.log(out.join('\n'))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
