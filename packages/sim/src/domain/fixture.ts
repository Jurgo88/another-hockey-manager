import type { Club, Lineup } from './club.js'
import type { CompetitionId, SeasonId } from './competition.js'
import type { MatchEvent } from './event.js'
import type { ClubId } from './player.js'
import type { OvertimeRegime } from './playoff.js'

export type FixtureId = string

/** A scheduled game. `Game` is banned vocabulary - it collides with the product. */
export interface Fixture {
  id: FixtureId
  competitionId: CompetitionId
  seasonId: SeasonId
  /** Matchday index within the Season, 0-based. */
  round: number
  /** Calendar day within the Season, 0-based. Rest between Fixtures is the gap in days. */
  day: number
  homeClubId: ClubId
  awayClubId: ClubId
  /**
   * How a level score after regulation is broken (FR-09b), or null when it
   * stands. Regular-season Fixtures take it from the CompetitionStructure,
   * playoff Fixtures from the PlayoffFormat.
   */
  overtime: OvertimeRegime | null
}

/** A Lineup and Tactics a Club takes up at an intermission, for the rest of the Fixture. */
export interface IntermissionChange {
  /** The Period just ended. After the third it counts only if overtime follows. */
  afterPeriod: 1 | 2 | 3
  clubId: ClubId
  lineup: Lineup
}

/** Everything the engine needs to simulate one Fixture. Fully self-contained. */
export interface FixtureInput {
  fixture: Fixture
  homeClub: Club
  awayClub: Club
  homeLineup: Lineup
  awayLineup: Lineup
  /** Part of the input, so that a Fixture replays from it like any other (ADR-016). */
  intermissions?: readonly IntermissionChange[]
}

/**
 * A played Fixture. Note that the result carries the event stream and nothing
 * else - the score is derived, never stored alongside (D-03).
 */
export interface Match {
  fixtureId: FixtureId
  seed: number
  events: readonly MatchEvent[]
}
