// Why Players leave, by age band and by ice-time third: tsx leaving.mts <run.json...>
// Shares of all regulars in the group, in percent, by reason.
import { readRuns, sim } from './sim.mts'

const L = await sim('stats/league.ts')
const rows = readRuns(process.argv.slice(2)).flatMap((r) => L.leavingRows(r.seasons))
const reasons = ['retired', 'unsigned', 'released', 'rights-expired']
const shares = (group: any[]) =>
  Object.fromEntries(
    reasons.map((k) => [
      k,
      ((100 * group.filter((r: any) => r.reason === k).length) / group.length).toFixed(1),
    ]),
  )
for (const [a, b] of [
  [0, 23],
  [24, 27],
  [28, 30],
  [31, 33],
  [34, 99],
]) {
  const group = rows.filter((r: any) => r.age >= a && r.age <= b)
  console.log(
    `${a}-${b}`.padEnd(6),
    String(group.length).padStart(6),
    JSON.stringify(shares(group)),
  )
}
for (const third of [0, 1, 2]) {
  const group = rows.filter((r: any) => r.third === third)
  console.log(`third ${third + 1}`, String(group.length).padStart(6), JSON.stringify(shares(group)))
}
