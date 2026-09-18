import type { ConferenceId, DivisionId } from './competition.js'
import type { ClubId } from './player.js'

/**
 * Playoff formats are declarative data, not code branches.
 *
 * The Manager picks a format when a game starts, and other leagues will want
 * different ones - a Slovak Extraliga play-in, a straight conference seeding,
 * a single-elimination cup. So a format is described by qualification rules
 * plus a bracket shape, and the engine interprets the description. Adding a
 * league means adding a `PlayoffFormat` value; adding a genuinely new bracket
 * shape means adding one builder.
 *
 * Phase 0 implements only `nhl-divisional`.
 */

/** How Clubs earn a playoff place. Rules apply in order. */
export type QualificationRule =
  /** The top `count` Clubs of every division. */
  | { kind: 'division-top'; count: number }
  /** The best `count` Clubs of each conference not already qualified. */
  | { kind: 'conference-wildcard'; count: number }
  /** The top `count` Clubs of every conference, ignoring divisions. */
  | { kind: 'conference-top'; count: number }
  /** The top `count` Clubs in the league, ignoring any grouping. */
  | { kind: 'league-top'; count: number }

export type BracketShape =
  /**
   * The NHL bracket. Per conference: each division's second and third seeds
   * meet, and each division winner meets a wild card - the better division
   * winner drawing the weaker wild card. Winners meet in a division final,
   * then a conference final. Brackets are fixed, not reseeded.
   */
  | 'nhl-divisional'
  /** Per conference, seed 1 v 8, 2 v 7, and so on. */
  | 'conference-seeded'
  /** One league-wide bracket, top seed against bottom seed. */
  | 'league-seeded'

export type OvertimeRegime =
  /** One five-minute sudden-death Period at 3-on-3, then a shootout. */
  | 'regular-3on3-then-shootout'
  /** Repeated full twenty-minute sudden-death Periods at 5-on-5. No shootout. */
  | 'sudden-death-5on5'

export type VenuePattern =
  /** Higher seed at home for games 1, 2, 5 and 7. The NHL pattern (FR-21). */
  | '2-2-1-1-1'
  /** Higher seed at home for games 1, 2, 5 and 6. */
  | '2-3-2'

export interface PlayoffFormat {
  id: string
  name: string
  /** Applied in order; later rules only consider Clubs still unqualified. */
  qualification: readonly QualificationRule[]
  bracket: BracketShape
  /**
   * Games needed to win each round, first round first. An entry of 4 means a
   * best-of-seven. The length of this array is the number of rounds.
   */
  winsPerRound: readonly number[]
  /** Whether surviving Clubs are reseeded by record between rounds. */
  reseedEachRound: boolean
  /**
   * Which overtime rules apply (FR-09b). A format implies its regime -
   * `allowsTie` on a Fixture is not enough information, and the two regimes
   * must not share a code path that assumes five minutes.
   */
  overtime: OvertimeRegime
  venuePattern: VenuePattern
}

/** A Club that qualified, with the seeding information the bracket needs. */
export interface PlayoffSeed {
  clubId: ClubId
  conferenceId: ConferenceId
  divisionId: DivisionId
  /** 1-3 for a division place, or 1-2 for a wild card. */
  rankInGroup: number
  /** Which rule admitted this Club. */
  via: 'division' | 'wildcard' | 'conference' | 'league'
  /** Rank within the conference by record, 1-based. Used for display. */
  conferenceRank: number
  points: number
}

export interface PlayoffSeries {
  id: string
  round: number
  /** Home-ice advantage belongs to the higher seed. */
  higherSeed: PlayoffSeed
  lowerSeed: PlayoffSeed
  winsRequired: number
}

export interface PlayoffRound {
  round: number
  name: string
  series: readonly PlayoffSeries[]
}

export interface PlayoffBracket {
  formatId: string
  seeds: readonly PlayoffSeed[]
  /** Only the first round is known up front unless the format reseeds. */
  rounds: readonly PlayoffRound[]
}
