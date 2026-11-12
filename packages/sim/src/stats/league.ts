import type { Contract } from '../domain/contract.js'
import type { ClubId, Departure, PlayerId } from '../domain/player.js'
import { sortStandings } from '../domain/standings.js'
import type { RosterEntry, SeasonRecord } from './history.js'

/**
 * The league over a run of Seasons (#90), folded from the records alone
 * (ADR-025), as `07-league-over-time.md` measured the NHL for the Phase 2 gate.
 */

/** Who played: Players with a regular-Season Fixture, by their counts. */
function fixturesOf(record: SeasonRecord, playerId: PlayerId): number {
  const { skaters, goalies } = record.totals.regular
  return (skaters[playerId] ?? goalies[playerId])?.gamesPlayed ?? 0
}

export interface AgeProfile {
  /** Weighted by the Fixtures each Player played, as measured. */
  meanAge: number
  /** Shares of the Players who played. */
  oldShare: number
  youngShare: number
  oldest: number
  players: number
}

/** The age of a Season's league: those aged 31 or more are old, 23 or younger young. */
export function ageProfile(record: SeasonRecord): AgeProfile {
  const played = record.roster
    .map((entry) => ({ age: entry.age, fixtures: fixturesOf(record, entry.playerId) }))
    .filter((p) => p.fixtures > 0)
  const fixtures = played.reduce((sum, p) => sum + p.fixtures, 0)
  const share = (test: (age: number) => boolean) => played.filter((p) => test(p.age)).length / played.length
  return {
    meanAge: played.reduce((sum, p) => sum + p.age * p.fixtures, 0) / fixtures,
    oldShare: share((age) => age >= 31),
    youngShare: share((age) => age <= 23),
    oldest: Math.max(...played.map((p) => p.age)),
    players: played.length,
  }
}

export interface Payrolls {
  /** Each Club's cap hits in all, as a share of the cap, by Club. */
  byClub: ReadonlyMap<ClubId, number>
  mean: number
  /** Standard deviation across Clubs. */
  sd: number
  lowest: number
  highest: number
}

/** A Player's contract as a Season ended. */
export interface RosterContract {
  playerId: PlayerId
  clubId: ClubId
  contract?: Contract
}

/**
 * What each Club paid in a Season, as shares of the cap (ADR-030, ADR-031): its
 * Roster's contracts and its dead money.
 */
export function payrolls(
  contracts: readonly RosterContract[],
  dead: Readonly<Record<ClubId, number>> = {},
): Payrolls {
  const byClub = new Map<ClubId, number>(Object.entries(dead))
  for (const entry of contracts) {
    byClub.set(entry.clubId, (byClub.get(entry.clubId) ?? 0) + (entry.contract?.capHit ?? 0))
  }
  const shares = [...byClub.values()]
  const mean = shares.reduce((sum, s) => sum + s, 0) / shares.length
  return {
    byClub,
    mean,
    sd: Math.sqrt(shares.reduce((sum, s) => sum + (s - mean) ** 2, 0) / shares.length),
    lowest: Math.min(...shares),
    highest: Math.max(...shares),
  }
}

export interface ReSigningRate {
  /** Regulars whose contract ran out with the Season. */
  expiring: number
  /** Of them, those on the same Club's Roster the next Season. */
  kept: number
}

/**
 * Who of a Season's regulars, 20 or more Fixtures, kept his Club when his
 * contract ran out, by what he was on expiry, as #122 measured the NHL (ADR-032).
 */
export function reSigningRates(
  record: SeasonRecord,
  contracts: readonly RosterContract[],
  next: readonly RosterContract[],
): { restricted: ReSigningRate; unrestricted: ReSigningRate } {
  const clubNext = new Map(next.map((entry) => [entry.playerId, entry.clubId]))
  const rates = { restricted: { expiring: 0, kept: 0 }, unrestricted: { expiring: 0, kept: 0 } }
  for (const { playerId, clubId, contract } of contracts) {
    if (contract?.years !== 1 || fixturesOf(record, playerId) < LEAVING_MIN_FIXTURES) continue
    const rate = rates[contract.onExpiry]
    rate.expiring++
    if (clubNext.get(playerId) === clubId) rate.kept++
  }
  return rates
}

/** Measured over Players with this many regular-Season Fixtures. */
export const LEAVING_MIN_FIXTURES = 20

export interface LeavingRow {
  playerId: PlayerId
  year: number
  age: number
  /** His ice-time third in his position group across the league, 0 the top. */
  third: 0 | 1 | 2
  /** Why he left before the next Season, or null if he stayed. */
  reason: Departure['reason'] | null
}

const groupOf = (entry: RosterEntry) =>
  entry.position === 'G' ? 'goalie' : entry.position === 'LD' || entry.position === 'RD' ? 'defence' : 'forward'

/**
 * Who of a Season's regulars left before the next, Season after Season: every
 * record but the last, which has no next. Skaters are ranked by ice time per
 * Fixture, Goalies by Fixtures, as measured.
 */
export function leavingRows(records: readonly SeasonRecord[]): LeavingRow[] {
  return records.slice(0, -1).flatMap((record, i) => {
    const gone = new Map(records[i + 1]!.departures.map((d) => [d.playerId, d.reason]))
    const regulars = record.roster.filter(
      (entry) => fixturesOf(record, entry.playerId) >= LEAVING_MIN_FIXTURES,
    )
    return (['forward', 'defence', 'goalie'] as const).flatMap((group) => {
      const ranked = regulars
        .filter((entry) => groupOf(entry) === group)
        .map((entry) => {
          const fixtures = fixturesOf(record, entry.playerId)
          const skater = record.totals.regular.skaters[entry.playerId]
          return { entry, score: skater ? skater.iceTimeSeconds / fixtures : fixtures }
        })
        .sort((a, b) => b.score - a.score || (a.entry.playerId < b.entry.playerId ? -1 : 1))
      return ranked.map(({ entry }, rank) => ({
        playerId: entry.playerId,
        year: record.year,
        age: entry.age,
        third: Math.min(2, Math.floor((rank / ranked.length) * 3)) as 0 | 1 | 2,
        reason: gone.get(entry.playerId) ?? null,
      }))
    })
  })
}

/** The share of rows whose Player left. */
export function leavingRate(rows: readonly LeavingRow[]): number {
  return rows.filter((row) => row.reason !== null).length / rows.length
}

export interface TableDynamics {
  /** Mean correlation of Club points from one Season to the next. */
  correlation: number
  /** Mean share of the top `size` still there the next Season. */
  topStays: number
  bottomStays: number
  /** The most Seasons in a row any Club spent in the top `size`. */
  longestTopRun: number
  /** How many Clubs finished first. */
  firstPlaceClubs: number
}

/** How the table moves across a run (`size` is 8 in the NHL's measurement). */
export function tableDynamics(records: readonly SeasonRecord[], size = 8): TableDynamics {
  const order = records.map((record) => sortStandings(record.standings).map((row) => row.clubId))
  const points = records.map((record) => new Map(record.standings.map((row) => [row.clubId, row.points])))
  const clubs = order[0]!
  const pairs = records.slice(1).map((_, i) => i)
  const stays = (pick: (ranked: readonly ClubId[]) => readonly ClubId[]) =>
    mean(pairs.map((i) => pick(order[i]!).filter((club) => pick(order[i + 1]!).includes(club)).length / size))

  let longestTopRun = 0
  for (const club of clubs) {
    let run = 0
    for (const ranked of order) {
      run = ranked.slice(0, size).includes(club) ? run + 1 : 0
      longestTopRun = Math.max(longestTopRun, run)
    }
  }
  return {
    correlation: mean(
      pairs.map((i) =>
        correlation(
          clubs.map((club) => points[i]!.get(club)!),
          clubs.map((club) => points[i + 1]!.get(club)!),
        ),
      ),
    ),
    topStays: stays((ranked) => ranked.slice(0, size)),
    bottomStays: stays((ranked) => ranked.slice(-size)),
    longestTopRun,
    firstPlaceClubs: new Set(order.map((ranked) => ranked[0])).size,
  }
}

/** The standard deviation of Club points in a Season. */
export function pointsSpread(record: SeasonRecord): number {
  const points = record.standings.map((row) => row.points)
  const centre = mean(points)
  return Math.sqrt(points.reduce((sum, p) => sum + (p - centre) ** 2, 0) / (points.length - 1))
}

/** The age bands of the career-shape assertion (`04-validation-targets.md`). */
export const LEVEL_AGE_BANDS = [
  { label: '21 or younger', from: 0, to: 21 },
  { label: '22-24', from: 22, to: 24 },
  { label: '25-27', from: 25, to: 27 },
  { label: '28-30', from: 28, to: 30 },
  { label: '31-33', from: 31, to: 33 },
  { label: '34 or older', from: 34, to: 99 },
] as const

/** The mean level of the Skaters on the Rosters as a Season ended, by age band. */
export function levelByAge(records: readonly SeasonRecord[]): { label: string; level: number; players: number }[] {
  const skaters = records.flatMap((record) => record.roster.filter((entry) => entry.position !== 'G'))
  return LEVEL_AGE_BANDS.map(({ label, from, to }) => {
    const members = skaters.filter((entry) => entry.age >= from && entry.age <= to)
    return { label, level: mean(members.map((entry) => entry.level)), players: members.length }
  })
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function correlation(a: readonly number[], b: readonly number[]): number {
  const ma = mean(a)
  const mb = mean(b)
  let covariance = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < a.length; i++) {
    covariance += (a[i]! - ma) * (b[i]! - mb)
    va += (a[i]! - ma) ** 2
    vb += (b[i]! - mb) ** 2
  }
  return covariance / Math.sqrt(va * vb)
}
