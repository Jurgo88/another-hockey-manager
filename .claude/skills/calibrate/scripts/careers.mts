// The shape of careers from development alone: tsx careers.mts [seed]
//
// Ages a generated league's Skaters ten Seasons with no one leaving, and prints
// the mean level change from 18 by age band, as a regular and as not. This is
// what test/develop.test.ts asserts. It separates growth from selection: the
// level of the Rosters by age also depends on who leaves (fit-report "level").
// PATCH works as in fit-run.mts.
import { mean, sim } from './sim.mts'

if (process.env.PATCH) {
  const patch = JSON.parse(process.env.PATCH) as Record<string, Record<string, object>>
  for (const [path, exports] of Object.entries(patch)) {
    const module = await sim(path)
    for (const [name, values] of Object.entries(exports)) Object.assign(module[name], values)
  }
}

const { startSeason } = await sim('season/index.ts')
const { develop } = await sim('develop/index.ts')
const { playerLevel } = await sim('domain/player.ts')
const { createRng } = await sim('rng/index.ts')

const seed = Number(process.argv[2] ?? 87)
const state = await startSeason(seed)
for (const regular of [true, false]) {
  const change: Record<number, number[]> = {}
  let players = state.clubs.flatMap((c: any) => c.skaters)
  for (let y = 1; y <= 10; y++)
    players = players.map((p: any) => {
      const next = develop(p, createRng(seed).fork(`careers:${y}:${p.id}`), { regular })
      ;(change[p.age] ??= []).push(playerLevel(next) - playerLevel(p))
      return { ...next, age: p.age + 1 }
    })
  let sum = 0
  const fromEighteen: Record<number, number> = {}
  for (let age = 18; age <= 40; age++) {
    fromEighteen[age] = sum
    if (change[age]) sum += mean(change[age])
  }
  const band = (a: number, b: number) =>
    mean(Array.from({ length: b - a + 1 }, (_, i) => fromEighteen[a + i]!)).toFixed(2)
  console.log(
    regular ? 'regular    ' : 'not regular',
    ...[
      [22, 24],
      [25, 27],
      [28, 30],
      [31, 33],
      [34, 36],
      [37, 39],
    ].map(([a, b]) => `${a}-${b} ${band(a!, b!)}`),
  )
}
