import { ageOn } from './estimate.js'
import type { LeagueHistory, SeasonGoalie, SeasonSkater } from './nhl/history.js'

/**
 * The Phase 2 measurements (#83): how the real league changes from one season
 * to the next. Pure functions of the history; `pnpm sim:measure` prints them
 * for `04-validation-targets.md`.
 */

/** Age on 1 October of the season's first year, as the estimator takes it (ADR-021). */
const ageIn = (birthDate: string, season: number) => ageOn(birthDate, `${season}-10-01`)

const harmonic = (a: number, b: number) => (a + b === 0 ? 0 : (2 * a * b) / (a + b))

// ---------------------------------------------------------------------------
// Age curves, by the delta method

export interface AgeChange {
  /** Age in the first of the two seasons. */
  age: number
  change: number
  weight: number
}

export interface AgeCurve {
  /** Mean change from one season to the next, by age in the first. */
  steps: readonly { age: number; pairs: number; change: number }[]
  /** The steps added up, 0 at the peak. */
  level: readonly { age: number; level: number }[]
  peakAge: number
}

/**
 * The same Player in two consecutive seasons, the change averaged by age. It
 * compares a Player only with himself, but only Players who stayed in the
 * league are paired: those who declined out of it are missing, so the late
 * decline is, if anything, understated.
 */
export function ageCurve(changes: readonly AgeChange[], minPairs = 20): AgeCurve {
  const byAge = new Map<number, { sum: number; weight: number; pairs: number }>()
  for (const c of changes) {
    const at = byAge.get(c.age) ?? { sum: 0, weight: 0, pairs: 0 }
    byAge.set(c.age, { sum: at.sum + c.change * c.weight, weight: at.weight + c.weight, pairs: at.pairs + 1 })
  }
  const steps = [...byAge]
    .filter(([, at]) => at.pairs >= minPairs && at.weight > 0)
    .map(([age, at]) => ({ age, pairs: at.pairs, change: at.sum / at.weight }))
    .sort((a, b) => a.age - b.age)

  const level: { age: number; level: number }[] = []
  let running = 0
  if (steps.length > 0) level.push({ age: steps[0]!.age, level: 0 })
  for (const step of steps) {
    running += step.change
    level.push({ age: step.age + 1, level: running })
  }
  const peak = level.reduce((best, at) => (at.level > best.level ? at : best), level[0] ?? { age: 0, level: 0 })
  return {
    steps,
    level: level.map((at) => ({ age: at.age, level: at.level - peak.level })),
    peakAge: peak.age,
  }
}

function pairs<T extends { season: number; playerId: number }>(seasons: readonly T[]): [T, T][] {
  const byKey = new Map(seasons.map((s) => [`${s.playerId}:${s.season}`, s]))
  return seasons.flatMap((s) => {
    const next = byKey.get(`${s.playerId}:${s.season + 1}`)
    return next ? [[s, next] as [T, T]] : []
  })
}

const minutes5v5 = (s: SeasonSkater) => (s.toi5v5PerMatch * s.matchesPlayed) / 60
const per60 = (s: SeasonSkater) => (minutes5v5(s) > 0 ? (s.points5v5 / minutes5v5(s)) * 60 : 0)
const isDefence = (s: SeasonSkater) => s.position === 'D'

/** A weighted mean per season. */
function seasonMeans<T extends { season: number }>(
  rows: readonly T[],
  value: (row: T) => number,
  weight: (row: T) => number,
): Map<number, number> {
  const sums = new Map<number, { sum: number; weight: number }>()
  for (const row of rows) {
    const at = sums.get(row.season) ?? { sum: 0, weight: 0 }
    sums.set(row.season, { sum: at.sum + value(row) * weight(row), weight: at.weight + weight(row) })
  }
  return new Map([...sums].map(([season, at]) => [season, at.sum / at.weight]))
}

/**
 * 5v5 points per 60 as a share of that season's mean for the group. Scoring has
 * risen since 2015, and comparing raw rates a year apart would read the league's
 * trend as every Player's growth.
 */
export function productionChanges(history: LeagueHistory, defence: boolean, minMinutes = 300): AgeChange[] {
  const group = history.skaters.filter((s) => isDefence(s) === defence && minutes5v5(s) >= minMinutes)
  const mean = seasonMeans(group, per60, minutes5v5)
  const relative = (s: SeasonSkater) => per60(s) / mean.get(s.season)!
  return pairs(group).map(([a, b]) => ({
    age: ageIn(a.birthDate, a.season),
    change: relative(b) - relative(a),
    weight: harmonic(minutes5v5(a), minutes5v5(b)),
  }))
}

/** Ice time per Fixture in minutes: what coaches make of a Player overall. */
export function iceTimeChanges(history: LeagueHistory, minMatches = 20): AgeChange[] {
  const group = history.skaters.filter((s) => s.matchesPlayed >= minMatches)
  return pairs(group).map(([a, b]) => ({
    age: ageIn(a.birthDate, a.season),
    change: (b.toiPerMatch - a.toiPerMatch) / 60,
    weight: harmonic(a.matchesPlayed, b.matchesPlayed),
  }))
}

const evSave = (g: SeasonGoalie) => g.evSaves / g.evShotsAgainst

/**
 * Even-strength save percentage above that season's league figure, in
 * thousandths: league save percentage has fallen as scoring rose.
 */
export function goalieChanges(history: LeagueHistory, minShots = 500): AgeChange[] {
  const league = seasonMeans(
    history.goalies.filter((g) => g.evShotsAgainst > 0),
    evSave,
    (g) => g.evShotsAgainst,
  )
  const group = history.goalies.filter((g) => g.evShotsAgainst >= minShots)
  const relative = (g: SeasonGoalie) => (evSave(g) - league.get(g.season)!) * 1000
  return pairs(group).map(([a, b]) => ({
    age: ageIn(a.birthDate, a.season),
    change: relative(b) - relative(a),
    weight: harmonic(a.evShotsAgainst, b.evShotsAgainst),
  }))
}

/** NHL EDGE top speed in mph. One pair of seasons only: EDGE has no league-wide history. */
export function speedChanges(history: LeagueHistory): AgeChange[] {
  return history.speed.map((p) => ({
    age: ageIn(p.birthDate, p.season),
    change: p.after - p.before,
    weight: 1,
  }))
}

// ---------------------------------------------------------------------------
// Who leaves the league

export interface LeavingRow {
  group: string
  players: number
  left: number
  rate: number
}

export const AGE_BANDS: readonly { label: string; from: number; to: number }[] = [
  { label: '23 or younger', from: 0, to: 23 },
  { label: '24-27', from: 24, to: 27 },
  { label: '28-30', from: 28, to: 30 },
  { label: '31-33', from: 31, to: 33 },
  { label: '34-36', from: 34, to: 36 },
  { label: '37 or older', from: 37, to: 99 },
]

interface Appearance {
  season: number
  playerId: number
  age: number
  matchesPlayed: number
  /** 0 the top third of his group that season by ice time, 2 the bottom. */
  tier: number
}

/** Every Player-season of 20 or more Fixtures, with his ice-time third in his group. */
function appearances(history: LeagueHistory, minMatches: number): Appearance[] {
  const out: Appearance[] = []
  const seasons = [...new Set(history.skaters.map((s) => s.season))]
  for (const season of seasons) {
    const groups: { id: number; birthDate: string; matchesPlayed: number; score: number }[][] = [
      history.skaters
        .filter((s) => s.season === season && s.position !== 'D' && s.matchesPlayed >= minMatches)
        .map((s) => ({ id: s.playerId, birthDate: s.birthDate, matchesPlayed: s.matchesPlayed, score: s.toiPerMatch })),
      history.skaters
        .filter((s) => s.season === season && s.position === 'D' && s.matchesPlayed >= minMatches)
        .map((s) => ({ id: s.playerId, birthDate: s.birthDate, matchesPlayed: s.matchesPlayed, score: s.toiPerMatch })),
      history.goalies
        .filter((g) => g.season === season && g.matchesPlayed >= minMatches)
        .map((g) => ({ id: g.playerId, birthDate: g.birthDate, matchesPlayed: g.matchesPlayed, score: g.matchesPlayed })),
    ]
    for (const group of groups) {
      const ranked = [...group].sort((a, b) => b.score - a.score || a.id - b.id)
      ranked.forEach((p, rank) =>
        out.push({
          season,
          playerId: p.id,
          age: ageIn(p.birthDate, season),
          matchesPlayed: p.matchesPlayed,
          tier: Math.min(2, Math.floor((rank / ranked.length) * 3)),
        }),
      )
    }
  }
  return out
}

/**
 * Of the Players with 20 or more Fixtures in a season, how many play none the
 * next, by age and by ice-time third. The last season has no next and is left out.
 */
export function leaving(history: LeagueHistory, minMatches = 20): { byAge: LeavingRow[]; byTier: LeavingRow[] } {
  const played = new Set([
    ...history.skaters.map((s) => `${s.playerId}:${s.season}`),
    ...history.goalies.map((g) => `${g.playerId}:${g.season}`),
  ])
  const last = Math.max(...history.skaters.map((s) => s.season))
  const rows = appearances(history, minMatches).filter((a) => a.season < last)
  const leftAfter = (a: Appearance) => !played.has(`${a.playerId}:${a.season + 1}`)

  const tally = (label: string, members: Appearance[]): LeavingRow => {
    const left = members.filter(leftAfter).length
    return { group: label, players: members.length, left, rate: members.length ? left / members.length : 0 }
  }
  return {
    byAge: AGE_BANDS.map((band) =>
      tally(band.label, rows.filter((a) => a.age >= band.from && a.age <= band.to)),
    ),
    byTier: ['Top third by ice time', 'Middle third', 'Bottom third'].map((label, tier) =>
      tally(label, rows.filter((a) => a.tier === tier)),
    ),
  }
}

/** Players per season who play none the next, and Players who play their first. */
export function turnoverOfPlayers(history: LeagueHistory): { leaving: number; debuts: number } {
  const bySeason = new Map<number, Set<number>>()
  for (const p of [...history.skaters, ...history.goalies]) {
    bySeason.set(p.season, (bySeason.get(p.season) ?? new Set()).add(p.playerId))
  }
  const seasons = [...bySeason.keys()].sort((a, b) => a - b)
  let leavingTotal = 0
  for (let i = 0; i + 1 < seasons.length; i++) {
    const next = bySeason.get(seasons[i + 1]!)!
    leavingTotal += [...bySeason.get(seasons[i]!)!].filter((id) => !next.has(id)).length
  }
  const debutSeasons = seasons.slice(1)
  const debuts = history.careers.filter((c) => c.firstSeason !== undefined && debutSeasons.includes(c.firstSeason)).length
  return { leaving: leavingTotal / (seasons.length - 1), debuts: debuts / debutSeasons.length }
}

// ---------------------------------------------------------------------------
// Draft

export interface DraftRow {
  round: number
  picks: number
  /** Share who played at least one NHL Fixture. */
  reached: number
  /** Share who played 200 or more. */
  regulars: number
  /** Median seasons from the draft to the first NHL season, of those who reached it. */
  yearsToDebut: number
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function draftOutcomes(history: LeagueHistory, years: readonly number[]): DraftRow[] {
  const rounds = [...new Set(history.draftPicks.map((p) => p.round))].sort((a, b) => a - b)
  return rounds.map((round) => {
    const picks = history.draftPicks
      .filter((p) => p.round === round && years.includes(p.year))
      .reduce((sum, p) => sum + p.picks, 0)
    const drafted = history.careers.filter(
      (c) => c.draftRound === round && c.draftYear !== undefined && years.includes(c.draftYear),
    )
    return {
      round,
      picks,
      reached: picks ? drafted.length / picks : 0,
      regulars: picks ? drafted.filter((c) => c.matchesPlayed >= 200).length / picks : 0,
      yearsToDebut: median(
        drafted.flatMap((c) => (c.firstSeason !== undefined ? [c.firstSeason - c.draftYear!] : [])),
      ),
    }
  })
}

// ---------------------------------------------------------------------------
// The table from one season to the next

export interface TableTurnover {
  /** Mean correlation of Club point shares between consecutive seasons. */
  yearToYear: number
  /** Of the top 8 in a season, the share in the top 8 the next. */
  topStays: number
  bottomStays: number
  /** The longest run of consecutive seasons any Club spent in the top 8. */
  longestTopRun: { code: string; seasons: number }
  /** Clubs that finished first in the measured seasons. */
  distinctFirst: number
  seasons: number
  /** Standard deviation of points over 84 Fixtures, per season, averaged. */
  spread: number
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

export function tableTurnover(history: LeagueHistory, band = 8): TableTurnover {
  const seasons = [...new Set(history.clubs.map((c) => c.season))].sort((a, b) => a - b)
  const table = (season: number) =>
    history.clubs.filter((c) => c.season === season).sort((a, b) => b.pointShare - a.pointShare)

  let correlation = 0
  let topStay = 0
  let bottomStay = 0
  for (let i = 0; i + 1 < seasons.length; i++) {
    const [now, next] = [table(seasons[i]!), table(seasons[i + 1]!)]
    const shared = now.filter((c) => next.some((n) => n.code === c.code))
    correlation += pearson(
      shared.map((c) => c.pointShare),
      shared.map((c) => next.find((n) => n.code === c.code)!.pointShare),
    )
    const top = new Set(next.slice(0, band).map((c) => c.code))
    const bottom = new Set(next.slice(-band).map((c) => c.code))
    topStay += now.slice(0, band).filter((c) => top.has(c.code)).length / band
    bottomStay += now.slice(-band).filter((c) => bottom.has(c.code)).length / band
  }
  const pairsCount = seasons.length - 1

  const runs = new Map<string, { current: number; best: number }>()
  for (const season of seasons) {
    const top = new Set(table(season).slice(0, band).map((c) => c.code))
    for (const code of new Set(history.clubs.map((c) => c.code))) {
      const run = runs.get(code) ?? { current: 0, best: 0 }
      run.current = top.has(code) ? run.current + 1 : 0
      run.best = Math.max(run.best, run.current)
      runs.set(code, run)
    }
  }
  const [code, run] = [...runs].sort((a, b) => b[1].best - a[1].best || a[0].localeCompare(b[0]))[0]!

  const spread =
    seasons.reduce((sum, season) => {
      const points = table(season).map((c) => c.pointShare * 168)
      const mean = points.reduce((s, x) => s + x, 0) / points.length
      return sum + Math.sqrt(points.reduce((s, x) => s + (x - mean) ** 2, 0) / points.length)
    }, 0) / seasons.length

  return {
    yearToYear: correlation / pairsCount,
    topStays: topStay / pairsCount,
    bottomStays: bottomStay / pairsCount,
    longestTopRun: { code, seasons: run.best },
    distinctFirst: new Set(seasons.map((s) => table(s)[0]!.code)).size,
    seasons: seasons.length,
    spread,
  }
}

// ---------------------------------------------------------------------------
// The age of the league

export interface AgeProfile {
  season: number
  /** Weighted by Fixtures played. */
  meanAge: number
  /** Shares of the Players who played, by count. */
  share31Plus: number
  share23OrYounger: number
  oldest: number
}

export function ageProfiles(history: LeagueHistory): AgeProfile[] {
  const seasons = [...new Set(history.skaters.map((s) => s.season))].sort((a, b) => a - b)
  return seasons.map((season) => {
    const players = [...history.skaters, ...history.goalies]
      .filter((p) => p.season === season)
      .map((p) => ({ age: ageIn(p.birthDate, season), matches: p.matchesPlayed }))
    const matches = players.reduce((s, p) => s + p.matches, 0)
    return {
      season,
      meanAge: players.reduce((s, p) => s + p.age * p.matches, 0) / matches,
      share31Plus: players.filter((p) => p.age >= 31).length / players.length,
      share23OrYounger: players.filter((p) => p.age <= 23).length / players.length,
      oldest: Math.max(...players.map((p) => p.age)),
    }
  })
}

/**
 * How old Players are, the age profile the generator draws from (#84): those
 * of 20 or more Fixtures by their ice-time third in their group, and as a
 * fourth table those who played fewer, who stand in for a Roster's spares.
 */
export function agesByTier(history: LeagueHistory, regular = 20): Map<number, number>[] {
  const tiers = [0, 1, 2, 3].map(() => new Map<number, number>())
  const add = (tier: number, age: number) => tiers[tier]!.set(age, (tiers[tier]!.get(age) ?? 0) + 1)
  for (const a of appearances(history, regular)) add(a.tier, a.age)
  for (const a of appearances(history, 1)) if (a.matchesPlayed < regular) add(3, a.age)
  return tiers
}
