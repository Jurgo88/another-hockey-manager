import type { Club } from './club.js'
import type { CompetitionId, CompetitionStructure } from './competition.js'

/**
 * How Rosters enter the game (D-05, ADR-003).
 *
 * Two implementations are intended: `GeneratedRosterProvider`, which is the
 * default and the only one a public build uses, and an NHL import path for
 * local development. Real Club marks and logos are not used in any build.
 *
 * Nothing downstream of this interface may assume a Player has a real-world
 * counterpart.
 */
export interface RosterProvider {
  readonly id: string
  loadCompetition(competitionId: CompetitionId): Promise<CompetitionRosters>
}

export interface CompetitionRosters {
  structure: CompetitionStructure
  clubs: readonly Club[]
}

/**
 * Roster shape per Club.
 *
 * A Lineup dresses 18 Skaters and 2 Goalies (FR-20). Generating exactly that
 * many would make Lineup selection meaningless, so Rosters carry depth: two
 * spare forwards, two spare defencemen and a third Goalie. Depth is what makes
 * fatigue, and later injuries, into decisions rather than arithmetic.
 */
export const ROSTER_SHAPE = {
  forwards: 14,
  defence: 8,
  goalies: 3,
} as const

export const ROSTER_SIZE = ROSTER_SHAPE.forwards + ROSTER_SHAPE.defence + ROSTER_SHAPE.goalies
