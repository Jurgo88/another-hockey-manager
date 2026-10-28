import type { ClubId, PlayerId } from '../domain/player.js'
import type { ClubStats, GoalieStats, MatchStats, SkaterStats } from './match.js'

/**
 * Season statistics are the sum of Match statistics, nothing more. Every
 * figure is a count, so there is no rate here to average wrongly - rates such
 * as save percentage are derived from the summed counts at read time.
 */
export interface SeasonStats {
  matches: number
  clubs: ReadonlyMap<ClubId, ClubStats>
  skaters: ReadonlyMap<PlayerId, SkaterStats>
  goalies: ReadonlyMap<PlayerId, GoalieStats>
}

/** Adds every numeric field. `clubId` follows the later entry, so a traded Player shows their current Club. */
function sum<T extends { clubId: ClubId }>(earlier: T, later: T): T {
  const total: Record<string, unknown> = { ...earlier, clubId: later.clubId }
  for (const [key, value] of Object.entries(later) as [string, unknown][]) {
    const prior = total[key]
    if (typeof value === 'number' && typeof prior === 'number') total[key] = prior + value
  }
  return total as T
}

function accumulate<K, T extends { clubId: ClubId }>(
  into: Map<K, T>,
  from: ReadonlyMap<K, T>,
): void {
  for (const [key, stats] of from) {
    const existing = into.get(key)
    into.set(key, existing ? sum(existing, stats) : { ...stats })
  }
}

/** Accepts any iterable, so a long run can stream Matches through without holding them all. */
export function foldSeason(matches: Iterable<MatchStats>): SeasonStats {
  const clubs = new Map<ClubId, ClubStats>()
  const skaters = new Map<PlayerId, SkaterStats>()
  const goalies = new Map<PlayerId, GoalieStats>()
  let count = 0

  for (const match of matches) {
    count++
    accumulate(clubs, match.clubs)
    accumulate(skaters, match.skaters)
    accumulate(goalies, match.goalies)
  }

  return { matches: count, clubs, skaters, goalies }
}
