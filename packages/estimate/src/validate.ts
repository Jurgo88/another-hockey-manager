import {
  advanceDay,
  createFileRosterProvider,
  foldSeason,
  foldStandings,
  isRegularSeasonOver,
  startSeason,
  type CompetitionStructure,
  type MatchStats,
} from '@ahm/sim'
import type { ClubIdentity } from './estimate.js'
import type { SeasonOutcome } from './nhl/outcome.js'

/**
 * The Phase 0.5 gate (#18): Seasons simulated on the estimated Rosters,
 * against what really happened. One simulated Season is one sample of a game
 * with enormous variance, so the comparison is on the mean of several.
 */

export const PHASE_GATE = {
  /** Spearman rank correlation of Club points. */
  clubRank: 0.6,
  /** Of the real top 20 point scorers, how many are in the simulated top 30. */
  leadersFound: 10,
  leaders: 20,
  within: 30,
  /** Spearman rank correlation of save percentage, Goalies with this many real Fixtures. */
  goalieRank: 0.4,
  goalieMatches: 40,
} as const

export interface SimulatedTotals {
  seasons: number
  /** Mean points per Club id. */
  clubPoints: ReadonlyMap<string, number>
  /** Mean points per Player id. */
  skaterPoints: ReadonlyMap<string, number>
  goalies: ReadonlyMap<string, { shotsAgainst: number; saves: number }>
}

/** Regular Seasons on the roster file, one per seed. */
export async function simulateSeasons(
  rosterFile: string,
  structure: CompetitionStructure,
  seeds: readonly number[],
): Promise<SimulatedTotals> {
  const clubPoints = new Map<string, number>()
  const skaterPoints = new Map<string, number>()
  const goalies = new Map<string, { shotsAgainst: number; saves: number }>()
  const add = (map: Map<string, number>, key: string, value: number) =>
    map.set(key, (map.get(key) ?? 0) + value / seeds.length)

  for (const seed of seeds) {
    let state = await startSeason(seed, createFileRosterProvider(rosterFile, structure))
    const matches: MatchStats[] = []
    while (!isRegularSeasonOver(state)) {
      const day = advanceDay(state)
      state = day.state
      for (const played of day.played) matches.push(played.match)
    }
    for (const row of foldStandings(structure, matches)) add(clubPoints, row.clubId, row.points)
    const season = foldSeason(matches)
    for (const [id, stats] of season.skaters) add(skaterPoints, id, stats.goals + stats.assists)
    for (const [id, stats] of season.goalies) {
      const total = goalies.get(id) ?? { shotsAgainst: 0, saves: 0 }
      goalies.set(id, {
        shotsAgainst: total.shotsAgainst + stats.shotsAgainst,
        saves: total.saves + stats.saves,
      })
    }
  }
  return { seasons: seeds.length, clubPoints, skaterPoints, goalies }
}

/** Ranks from 1, ties sharing the mean of their places. */
function ranks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const result = new Array<number>(values.length)
  for (let i = 0; i < order.length; ) {
    let j = i
    while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j++
    for (let k = i; k <= j; k++) result[order[k]!.index] = (i + j) / 2 + 1
    i = j + 1
  }
  return result
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const [ma, mb] = [mean(a), mean(b)]
  let num = 0
  let da = 0
  let db = 0
  a.forEach((x, i) => {
    num += (x - ma) * (b[i]! - mb)
    da += (x - ma) ** 2
    db += (b[i]! - mb) ** 2
  })
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db)
}

export function spearman(a: readonly number[], b: readonly number[]): number {
  return pearson(ranks(a), ranks(b))
}

export interface Comparison {
  clubRank: number
  leadersFound: number
  goalieRank: number
  clubs: readonly { code: string; real: number; simulated: number }[]
  leaders: readonly { id: string; name: string; real: number; simulated: number; simulatedRank: number }[]
  simulatedLeaders: readonly { id: string; name: string; real: number; simulated: number }[]
  goalies: readonly { id: string; name: string; real: number; simulated: number }[]
}

export function compare(
  outcome: SeasonOutcome,
  simulated: SimulatedTotals,
  clubs: readonly ClubIdentity[],
): Comparison {
  // Points over 82 real Fixtures are scaled to the 84 a simulated Season plays.
  const clubRows = clubs.map((club) => {
    const real = outcome.clubs.find((c) => c.code === club.code)
    if (!real) throw new Error(`The outcome has no Club ${club.code}`)
    return {
      code: club.code,
      real: (real.points * 84) / real.matchesPlayed,
      simulated: simulated.clubPoints.get(club.id) ?? 0,
    }
  })

  const names = new Map(outcome.skaters.map((s) => [s.id, s]))
  const simulatedOrder = [...simulated.skaterPoints].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const simulatedRank = new Map(simulatedOrder.map(([id], index) => [id, index + 1]))
  const leaders = outcome.skaters.slice(0, PHASE_GATE.leaders).map((s) => ({
    id: s.id,
    name: s.name,
    real: s.points,
    simulated: simulated.skaterPoints.get(s.id) ?? 0,
    simulatedRank: simulatedRank.get(s.id) ?? Infinity,
  }))

  const goalies = outcome.goalies
    .filter((g) => g.matchesPlayed >= PHASE_GATE.goalieMatches && g.shotsAgainst > 0)
    .flatMap((g) => {
      const sim = simulated.goalies.get(g.id)
      return sim && sim.shotsAgainst > 0
        ? [{ id: g.id, name: g.name, real: g.saves / g.shotsAgainst, simulated: sim.saves / sim.shotsAgainst }]
        : []
    })

  return {
    clubRank: spearman(
      clubRows.map((c) => c.real),
      clubRows.map((c) => c.simulated),
    ),
    leadersFound: leaders.filter((l) => l.simulatedRank <= PHASE_GATE.within).length,
    goalieRank: spearman(
      goalies.map((g) => g.real),
      goalies.map((g) => g.simulated),
    ),
    clubs: clubRows.sort((a, b) => b.real - a.real),
    leaders,
    simulatedLeaders: simulatedOrder.slice(0, PHASE_GATE.leaders).map(([id, points]) => ({
      id,
      name: names.get(id)?.name ?? id,
      real: names.get(id)?.points ?? 0,
      simulated: points,
    })),
    goalies,
  }
}

/** The comparison as text, for the command line. */
export function formatComparison(comparison: Comparison, seasons: number): string {
  const pass = (ok: boolean) => (ok ? 'pass' : 'FAIL')
  const lines = [
    `Mean of ${seasons} simulated Seasons against the real one (Phase 0.5 gate, #18)`,
    '',
    `Club points, rank correlation   ${comparison.clubRank.toFixed(2)}  (gate ${PHASE_GATE.clubRank})  ${pass(comparison.clubRank >= PHASE_GATE.clubRank)}`,
    `Real top ${PHASE_GATE.leaders} in simulated top ${PHASE_GATE.within}     ${comparison.leadersFound}  (gate ${PHASE_GATE.leadersFound})  ${pass(comparison.leadersFound >= PHASE_GATE.leadersFound)}`,
    `Save percentage, rank corr.     ${comparison.goalieRank.toFixed(2)}  (gate ${PHASE_GATE.goalieRank}, ${comparison.goalies.length} Goalies)  ${pass(comparison.goalieRank >= PHASE_GATE.goalieRank)}`,
    '',
    'Club   real  simulated   (real points scaled to 84 Fixtures)',
    ...comparison.clubs.map((c) => `${c.code.padEnd(5)} ${c.real.toFixed(0).padStart(5)}  ${c.simulated.toFixed(0).padStart(9)}`),
    '',
    `Real top ${PHASE_GATE.leaders}                      real  simulated  sim rank`,
    ...comparison.leaders.map(
      (l) =>
        `${l.name.padEnd(30)} ${String(l.real).padStart(4)}  ${l.simulated.toFixed(0).padStart(9)}  ${String(l.simulatedRank).padStart(8)}`,
    ),
    '',
    `Simulated top ${PHASE_GATE.leaders}                 real  simulated`,
    ...comparison.simulatedLeaders.map(
      (l) => `${l.name.padEnd(30)} ${String(l.real).padStart(4)}  ${l.simulated.toFixed(0).padStart(9)}`,
    ),
  ]
  return lines.join('\n')
}
