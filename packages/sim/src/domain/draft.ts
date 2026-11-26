import type { ClubId, Player, PlayerId } from './player.js'

/**
 * The entry draft as data (D-10, ADR-024, ADR-028). A league with another
 * draft adds a value beside its playoff format, not a branch.
 */
export interface DraftFormat {
  id: string
  name: string
  /** Rounds, each in the order of the first. */
  rounds: number
  /** Prospects in a class, as a multiple of the picks, so the last pick still has a choice. */
  classSize: number
  /** Seasons a Club holds the rights to a prospect it has not called up. */
  rightsSeasons: number
  lottery: DraftLottery
  /**
   * The playoff rounds, counted back from the final, whose Clubs pick after all
   * others, by how far they went: 2 in the NHL, the conference finals and the
   * final. The other playoff Clubs pick by points, after those who missed.
   */
  deepRunsLast: number
}

/**
 * Who of the Clubs that missed the playoffs picks first. The Clubs are in
 * order, worst first, and the odds belong to their places.
 */
export interface DraftLottery {
  /** Per cent per place, worst first. Clubs beyond the list have no chance. */
  odds: readonly number[]
  /** Picks drawn, from the first. A winner cannot win again. */
  draws: number
  /** Places a winner may move up at most; a pick he cannot reach goes to the worst Club not yet placed. */
  maxJump: number
}

/** One pick of a draft. */
export interface DraftPick {
  /** The draft before Season `year` (ADR-028). */
  year: number
  /** From 1. */
  round: number
  /** Overall, from 1. */
  pick: number
  clubId: ClubId
  playerId: PlayerId
  /** The Club whose place in the order the pick kept, when another Club used it after a trade (ADR-033). */
  fromClubId?: ClubId
}

/**
 * A drafted Player whose Club holds his rights and has not called him up. He
 * develops off the Roster (ADR-024), and `player.clubId` is the Club that holds
 * them. The engine and Lineups never see him.
 */
export interface Prospect {
  player: Player
  /** The year of the draft he was picked in. */
  year: number
  round: number
  pick: number
}

/**
 * What a Club does between Seasons with its prospects and its Roster
 * (ADR-028): prospects it calls up, Players it releases, and prospects it signs
 * to an entry-level contract who stay on loan, under the farm's age, until they
 * reach it (ADR-036). A prospect signed at that age or older joins the Club as
 * one called up does.
 */
export interface RosterMoves {
  callUps: readonly PlayerId[]
  releases: readonly PlayerId[]
  signings?: readonly PlayerId[]
}

/**
 * A rule a Club's moves break (ADR-028 amendment, #92). Data, as a Lineup's
 * violations are, so that a Manager reads it in his own language.
 */
export type MovesViolation =
  | { kind: 'calledUpTwice'; playerId: PlayerId }
  | { kind: 'releasedTwice'; playerId: PlayerId }
  | { kind: 'notProspect'; playerId: PlayerId }
  | { kind: 'notOnRoster'; playerId: PlayerId }
  | { kind: 'signedTwice'; playerId: PlayerId }
  | { kind: 'alreadySigned'; playerId: PlayerId }
  /** The Club would hold more contracts than the rules allow (ADR-036), a loan not counted. */
  | { kind: 'tooManyContracts'; count: number; max: number }
  | { kind: 'cannotDress' }
  /** The moves add cap hit and leave the Club over the cap, at this payroll for the Season ahead (ADR-031). */
  | { kind: 'overCap'; payroll: number }
