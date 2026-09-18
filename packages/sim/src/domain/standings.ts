import type { ConferenceId, DivisionId } from './competition.js'
import type { ClubId } from './player.js'

/**
 * One Club's regular-season record. Types only - the computation lives in
 * `src/stats`, folded from the event stream (D-03).
 *
 * Points use the NHL scheme (FR-15): 2 for a win, 1 for an overtime or
 * shootout loss, 0 for a regulation loss.
 */
export interface StandingsRow {
  clubId: ClubId
  divisionId: DivisionId
  conferenceId: ConferenceId
  gamesPlayed: number
  /** Wins in regulation, overtime and shootout combined. */
  wins: number
  /** Losses in regulation only. */
  losses: number
  /** Losses in overtime or the shootout. Worth one point. */
  otLosses: number
  points: number
  /** Wins achieved in regulation. The first NHL tiebreaker after points. */
  regulationWins: number
  goalsFor: number
  goalsAgainst: number
}

export function goalDifferential(row: StandingsRow): number {
  return row.goalsFor - row.goalsAgainst
}

/**
 * NHL tiebreaking order, simplified: points, then regulation wins, then goal
 * differential, then Club id.
 *
 * The real order inserts fewer games played after points, and head-to-head
 * points before goal differential. Games played is irrelevant in a simulated
 * Season where every Club completes its schedule, and head-to-head needs the
 * Fixture list rather than the standings table - so it is left out until
 * something depends on it. The Club id fallback exists so that ordering is
 * total and therefore deterministic (D-01).
 */
export function compareStandings(a: StandingsRow, b: StandingsRow): number {
  if (a.points !== b.points) return b.points - a.points
  if (a.regulationWins !== b.regulationWins) return b.regulationWins - a.regulationWins

  const diff = goalDifferential(b) - goalDifferential(a)
  if (diff !== 0) return diff

  return a.clubId < b.clubId ? -1 : a.clubId > b.clubId ? 1 : 0
}

export function sortStandings(rows: readonly StandingsRow[]): StandingsRow[] {
  return [...rows].sort(compareStandings)
}
