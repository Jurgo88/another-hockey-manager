import type { PlayerId, PositionGroup } from '../domain/player.js'
import type { MatchStats } from './match.js'
import type { SeasonTotals } from './season.js'

/**
 * Form (ADR-036, #135): how a Player has played in his last Fixtures, folded
 * from their events (D-03), as levels above or below what Players of his level
 * produce in the same league this Season. Not an attribute: the engine never
 * reads it (D-06). Only a run that plays the farm's games keeps it, since
 * calling up for form needs the farm's Fixtures to read.
 */

/**
 * How many recent Fixtures form reads, how many it needs before it says
 * anything, and how far from his level it may put a Player, in levels.
 * Estimates: no measured target reads form.
 */
export const FORM = { window: 10, minFixtures: 5, limit: 3 } as const

/** Which league a Fixture was played in: the Competition's, or its farm's. */
export type League = 'nhl' | 'farm'

/**
 * One Fixture as form reads it: for a Skater his ice time in seconds and his
 * points, for a Goalie the shots against him and his saves.
 */
export interface RecentFixture {
  league: League
  exposure: number
  output: number
}

/** Each Player's last Fixtures, oldest first, at most `FORM.window`. */
export type Recent = Readonly<Record<PlayerId, readonly RecentFixture[]>>

/** `recent` carried on by one Match of `league`. */
export function foldRecent(recent: Recent, match: MatchStats, league: League): Recent {
  const next: Record<PlayerId, readonly RecentFixture[]> = { ...recent }
  const push = (id: PlayerId, entry: RecentFixture) => {
    next[id] = [...(next[id] ?? []), entry].slice(-FORM.window)
  }
  for (const [id, line] of match.skaters) {
    push(id, { league, exposure: line.iceTimeSeconds, output: line.goals + line.assists })
  }
  for (const [id, line] of match.goalies) {
    if (line.shotsAgainst > 0) push(id, { league, exposure: line.shotsAgainst, output: line.saves })
  }
  return next
}

/** What a group produces per unit of exposure in a league, as a line in level. */
export interface Rate {
  intercept: number
  slope: number
}

export type LeagueRates = Readonly<Record<PositionGroup, Rate | null>>

/** The fewest Players with enough Fixtures a group's rate is fitted on. */
const FIT_MINIMUM = 10

/**
 * Points per hour of ice time for Skaters, saves per shot for Goalies, against
 * level, fitted over the Season's totals of a league so far (weighted least
 * squares, by ice time or shots). A group with too few Players, or no rise with
 * level, has no rate.
 */
export function leagueRates(
  totals: SeasonTotals,
  of: (playerId: PlayerId) => { level: number; group: PositionGroup } | undefined,
): LeagueRates {
  const points: Record<PositionGroup, { x: number; y: number; w: number }[]> = {
    forward: [],
    defence: [],
    goalie: [],
  }
  for (const [id, line] of Object.entries(totals.skaters)) {
    const player = of(id)
    if (!player || player.group === 'goalie') continue
    if (line.gamesPlayed < FORM.minFixtures || line.iceTimeSeconds <= 0) continue
    const hours = line.iceTimeSeconds / 3600
    points[player.group].push({ x: player.level, y: (line.goals + line.assists) / hours, w: hours })
  }
  for (const [id, line] of Object.entries(totals.goalies)) {
    const player = of(id)
    if (!player || player.group !== 'goalie') continue
    if (line.gamesPlayed < FORM.minFixtures || line.shotsAgainst <= 0) continue
    points.goalie.push({ x: player.level, y: line.saves / line.shotsAgainst, w: line.shotsAgainst })
  }
  return {
    forward: fitted(points.forward),
    defence: fitted(points.defence),
    goalie: fitted(points.goalie),
  }
}

function fitted(points: readonly { x: number; y: number; w: number }[]): Rate | null {
  if (points.length < FIT_MINIMUM) return null
  const weight = points.reduce((sum, p) => sum + p.w, 0)
  const mx = points.reduce((sum, p) => sum + p.w * p.x, 0) / weight
  const my = points.reduce((sum, p) => sum + p.w * p.y, 0) / weight
  const sxx = points.reduce((sum, p) => sum + p.w * (p.x - mx) ** 2, 0)
  const sxy = points.reduce((sum, p) => sum + p.w * (p.x - mx) * (p.y - my), 0)
  if (sxx <= 0) return null
  const slope = sxy / sxx
  if (!(slope > 0)) return null
  return { intercept: my - slope * mx, slope }
}

/**
 * A Player's form in levels: what his recent output stands above or below the
 * output his league's rate expects of his level, divided by how much more one
 * level would have produced over the same exposure. Null with fewer than
 * `FORM.minFixtures` recent Fixtures or no rate to read them by.
 */
export function formOf(
  recent: readonly RecentFixture[] | undefined,
  level: number,
  group: PositionGroup,
  rates: Readonly<Record<League, LeagueRates>>,
): number | null {
  if (!recent || recent.length < FORM.minFixtures) return null
  const per = group === 'goalie' ? 1 : 3600
  let surplus = 0
  let perLevel = 0
  for (const { league, exposure, output } of recent) {
    const rate = rates[league][group]
    if (!rate) return null
    const units = exposure / per
    surplus += output - (rate.intercept + rate.slope * level) * units
    perLevel += rate.slope * units
  }
  if (perLevel <= 0) return null
  return Math.max(-FORM.limit, Math.min(FORM.limit, surplus / perLevel))
}
