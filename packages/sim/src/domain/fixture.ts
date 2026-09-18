import type { Club, Lineup } from './club.js'
import type { MatchEvent } from './event.js'
import type { ClubId } from './player.js'

export type FixtureId = string
export type SeasonId = string
export type CompetitionId = string

/** A scheduled game. `Game` is banned vocabulary - it collides with the product. */
export interface Fixture {
  id: FixtureId
  competitionId: CompetitionId
  seasonId: SeasonId
  /** Matchday index within the Season, 0-based. */
  round: number
  homeClubId: ClubId
  awayClubId: ClubId
  /** Whether a tie must be broken by overtime and shootout. */
  allowsTie: boolean
}

/** Everything the engine needs to simulate one Fixture. Fully self-contained. */
export interface FixtureInput {
  fixture: Fixture
  homeClub: Club
  awayClub: Club
  homeLineup: Lineup
  awayLineup: Lineup
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
