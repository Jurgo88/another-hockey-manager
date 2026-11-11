// The Phase 2 gate figures, pooled over fit runs: tsx fit-report.mts <run.json...>
//
// "ok" or "XX" against the band. Targets and bands are copied from
// .clauden/04-validation-targets.md and test/support/gate.ts: keep them in step.
// Lines without a flag are reported, not asserted.
import { mean, readRuns, sim } from './sim.mts'

const L = await sim('stats/league.ts')
const { draftOutcomes } = await sim('stats/history.ts')
const runs = readRuns(process.argv.slice(2))
if (runs.length === 0) throw new Error('usage: tsx fit-report.mts <run.json...>')

const line = (name: string, value: number, target: number, band: number, digits = 3) =>
  console.log(
    `${Math.abs(value - target) <= band ? 'ok ' : 'XX '}${name.padEnd(30)} ${value.toFixed(digits)}  (${target} ±${band})`,
  )
const lastSeasons = runs.map((r) => r.seasons.at(-1))

// The age of the league, last Season
const ages = lastSeasons.map(L.ageProfile)
line('mean age', mean(ages.map((a: any) => a.meanAge)), 27, 0.7, 2)
line('31+', mean(ages.map((a: any) => a.oldShare)), 0.18, 0.05)
line('23-', mean(ages.map((a: any) => a.youngShare)), 0.3, 0.05)
console.log('    oldest', ages.map((a: any) => a.oldest).join(' '))

// Who leaves, by age and by ice-time third
const rows = runs.flatMap((r) => L.leavingRows(r.seasons))
const byAge = [
  [0, 23, 0.044, 0.03],
  [24, 27, 0.073, 0.03],
  [28, 30, 0.074, 0.03],
  [31, 33, 0.13, 0.04],
  [34, 36, 0.23, 0.06],
  [37, 99, 0.43, 0.12],
] as const
for (const [a, b, t, band] of byAge)
  line(`leave ${a}-${b}`, L.leavingRate(rows.filter((r: any) => r.age >= a && r.age <= b)), t, band)
const byThird = [
  [0, 0.013, 0.02],
  [1, 0.053, 0.03],
  [2, 0.201, 0.06],
] as const
for (const [i, t, band] of byThird)
  line(`leave third ${i + 1}`, L.leavingRate(rows.filter((r: any) => r.third === i)), t, band)
const reasons: Record<string, number> = {}
for (const r of rows) if (r.reason) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1
console.log('    reasons', JSON.stringify(reasons), 'rows', rows.length)

// What each draft round yields
const drafts = runs.map((r) => draftOutcomes(r.seasons, [2, 3, 4, 5]))
const byRound = [
  [1, 0.749, 0.12, 1],
  [2, 0.385, 0.12, 3],
  [3, 0.199, 0.1, 3],
  [4, 0.165, 0.1, 3],
] as const
for (const [round, t, band, debut] of byRound) {
  const rounds = drafts.map((d) => d.find((x: any) => x.round === round))
  const debuts = rounds.map((x: any) => x.seasonsToDebut).sort((a: number, b: number) => a - b)
  line(`draft r${round} regulars`, mean(rounds.map((x: any) => x.regulars)), t, band)
  line(`draft r${round} debut`, debuts[Math.floor(debuts.length / 2)], debut, 1, 0)
}

// How the table moves
const tables = runs.map((r) => L.tableDynamics(r.seasons))
line('table corr', mean(tables.map((t: any) => t.correlation)), 0.51, 0.12)
line('top8 stays', mean(tables.map((t: any) => t.topStays)), 0.46, 0.12)
line('bottom8 stays', mean(tables.map((t: any) => t.bottomStays)), 0.51, 0.12)
console.log(
  '    reported, Phase 3 gate: longest top8',
  tables.map((t: any) => t.longestTopRun).join(' '),
  '(at most 9) | firsts',
  tables.map((t: any) => t.firstPlaceClubs).join(' '),
  '(at least 5) | points SD last',
  mean(lastSeasons.map(L.pointsSpread)).toFixed(1),
  '(16.1 ±3)',
)
const seasons = runs[0].seasons.length
console.log(
  '    points SD by Season',
  Array.from({ length: seasons }, (_, y) =>
    mean(runs.map((r) => L.pointsSpread(r.seasons[y]))).toFixed(1),
  ).join(' '),
)
const levels = (list: any[]) =>
  L.levelByAge(list)
    .map((b: any) => `${b.label} ${b.level.toFixed(2)}`)
    .join(' | ')
console.log('    level last', levels(lastSeasons))
console.log('    level S1  ', levels(runs.map((r) => r.seasons[0])))

// A quick look at Tier 1 in the last Season; the full suites are test/longrun/tiers.test.ts.
let goals = 0
let matches = 0
let shots = 0
let saves = 0
let penalties = 0
let clubGames = 0
for (const r of runs)
  for (const m of r.last.matches) {
    matches++
    goals += m.result.homeGoals + m.result.awayGoals
    for (const [, g] of m.goalies.__map ?? []) {
      shots += g.shotsAgainst
      saves += g.saves
    }
    for (const [, c] of m.clubs.__map ?? Object.entries(m.clubs)) {
      penalties += (c as any).penalties
      clubGames++
    }
  }
line('T1 goals per Fixture, last', goals / matches, 6.16, 0.3, 2)
line('T1 save pct, last', saves / shots, 0.889, 0.008)
line('T1 penalties per Club, last', penalties / clubGames, 2.88, 0.15, 2)

const attrs = Object.keys(runs[0].attrs ?? {})
console.log(
  '    attributes last (generated S1: skill 10.84 reading 11.12 physical 10.78 goalie 15.9):',
  attrs.map((k) => `${k} ${mean(runs.map((r) => r.attrs[k])).toFixed(2)}`).join(' '),
)
