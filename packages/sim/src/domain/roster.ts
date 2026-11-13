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
 * The active Roster the assistant keeps (ADR-036, #133): a Lineup dresses 18
 * Skaters and 2 Goalies (FR-20), and two spare forwards and a spare defenceman
 * fill the NHL's 23. Injuries beyond that are answered by call-ups from the
 * farm, which replace the depth ADR-012 gave the Roster itself.
 */
export const ACTIVE_SHAPE = {
  forwards: 14,
  defence: 7,
  goalies: 2,
} as const

/**
 * The farm the assistant keeps at least (ADR-036, #133): enough at each group
 * to answer the injuries the active Roster's spares do not.
 */
export const FARM_SHAPE = {
  forwards: 6,
  defence: 3,
  goalies: 2,
} as const

/**
 * A Club's NHL Roster without its farm (ADR-020): what the estimator picks from
 * the real league by ice time, and what a roster file of versions 1 and 2 holds.
 * A Season completes it with a farm (ADR-036, #133).
 */
export const NHL_ROSTER_SHAPE = {
  forwards: 16,
  defence: 10,
  goalies: 3,
} as const

/**
 * Every Player a Club holds under contract, active Roster and farm together:
 * the shape its gaps are filled to between Seasons, when the two are held as
 * one (ADR-036).
 */
export const ROSTER_SHAPE = {
  forwards: ACTIVE_SHAPE.forwards + FARM_SHAPE.forwards,
  defence: ACTIVE_SHAPE.defence + FARM_SHAPE.defence,
  goalies: ACTIVE_SHAPE.goalies + FARM_SHAPE.goalies,
} as const

export const ROSTER_SIZE = ROSTER_SHAPE.forwards + ROSTER_SHAPE.defence + ROSTER_SHAPE.goalies

export const ACTIVE_SIZE = ACTIVE_SHAPE.forwards + ACTIVE_SHAPE.defence + ACTIVE_SHAPE.goalies
