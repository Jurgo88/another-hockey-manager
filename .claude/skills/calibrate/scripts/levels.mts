// Where the league's level goes: tsx levels.mts <run.json...>
//
// Per Season, the Skaters' mean level, by age band, drafted against generated,
// and the Goalies' mean; then percentiles in Seasons 1, 2, 5 and the last.
// A rise at the bottom percentiles is Roster depth, at the top it is stars.
import { mean, readRuns } from './sim.mts'

const runs = readRuns(process.argv.slice(2))
const bands = [
  [0, 21],
  [22, 24],
  [25, 27],
  [28, 30],
  [31, 33],
  [34, 99],
] as const
const f = (x: number) => (Number.isNaN(x) ? '  -  ' : x.toFixed(2).padStart(5))
const avg = (v: number[]) => (v.length ? mean(v) : NaN)
const isGoalie = (e: any) => e.position === 'G'
const drafted = (e: any) => String(e.playerId).startsWith('draft-')

console.log(
  'S   all   | ' +
    bands.map(([a, b]) => `${a}-${b}`.padStart(5)).join(' ') +
    ' | drafted share, drafted, generated | Goalies',
)
const seasons = runs[0].seasons.length
for (let y = 0; y < seasons; y++) {
  const roster = runs.flatMap((r) => r.seasons[y].roster)
  const skaters = roster.filter((e: any) => !isGoalie(e))
  const level = (list: any[]) => avg(list.map((e: any) => e.level))
  console.log(
    `${String(y + 1).padStart(2)} ${f(level(skaters))} | ` +
      bands
        .map(([a, b]) => f(level(skaters.filter((e: any) => e.age >= a && e.age <= b))))
        .join(' ') +
      ` | ${(skaters.filter(drafted).length / skaters.length).toFixed(2)} ${f(level(skaters.filter(drafted)))} ${f(level(skaters.filter((e: any) => !drafted(e))))}` +
      ` | ${f(level(roster.filter(isGoalie)))}`,
  )
}

const q = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(p * (sorted.length - 1))]!.toFixed(1)
}
for (const y of [...new Set([0, 1, 4, seasons - 1])].filter((y) => y < seasons)) {
  const roster = runs.flatMap((r) => r.seasons[y].roster)
  const sk = roster.filter((e: any) => !isGoalie(e)).map((e: any) => e.level)
  const g = roster.filter(isGoalie).map((e: any) => e.level)
  console.log(
    `S${y + 1} Skaters p05 ${q(sk, 0.05)} p25 ${q(sk, 0.25)} p50 ${q(sk, 0.5)} p75 ${q(sk, 0.75)} p90 ${q(sk, 0.9)} p99 ${q(sk, 0.99)}` +
      ` | Goalies p10 ${q(g, 0.1)} p50 ${q(g, 0.5)} p90 ${q(g, 0.9)}`,
  )
}
