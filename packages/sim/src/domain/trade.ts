import type { ClubId, PlayerId } from './player.js'

/**
 * Trades (ADR-033). A trade is two sides, each what one Club gives: Players
 * under contract, prospects whose rights it holds, and draft picks it owns.
 * Every Club proposes and answers through the same calls, its Manager's or its
 * assistant's (D-04).
 */

/**
 * A pick of a future draft, named by the draft (the one before Season `year`),
 * its round, and the Club whose place in the order it keeps (ADR-028): only who
 * uses it changes when it is traded.
 */
export interface PickRef {
  year: number
  round: number
  clubId: ClubId
}

/** What one Club gives in a trade. */
export interface TradeSide {
  clubId: ClubId
  players: readonly PlayerId[]
  prospects: readonly PlayerId[]
  picks: readonly PickRef[]
  /** The share of a Player's cap hit this Club keeps, by Player it gives (ADR-033). */
  retained?: Readonly<Record<PlayerId, number>>
}

/** A trade: what each of two Clubs gives the other. */
export interface Trade {
  sides: readonly [TradeSide, TradeSide]
}

/** A rule a trade breaks: data, so a Manager reads it in his own language. */
export type TradeViolation =
  | { kind: 'closed' }
  | { kind: 'sameClub' }
  | { kind: 'notHeld'; clubId: ClubId; id: PlayerId }
  | { kind: 'pickNotOwned'; clubId: ClubId; pick: PickRef }
  | { kind: 'pickOutOfRange'; pick: PickRef }
  | { kind: 'retainedTwice'; playerId: PlayerId }
  | { kind: 'retainedTooMuch'; playerId: PlayerId; share: number; max: number }
  | { kind: 'tooManyRetained'; clubId: ClubId; max: number }
  | { kind: 'overCap'; clubId: ClubId }
  | { kind: 'tooManyContracts'; clubId: ClubId; contracts: number; max: number }
  | { kind: 'empty' }
  /** After it the Club could not dress a Lineup from the Players it holds. */
  | { kind: 'cannotDress'; clubId: ClubId }

/** A Player moving from one Club to another during a Season. */
export interface Transfer {
  playerId: PlayerId
  fromClubId: ClubId
  toClubId: ClubId
  day: number
  kind: 'trade' | 'claim'
  /** His NHL games that Season before the move: with more after it, he played for both Clubs. */
  gamesBefore: number
}

/** A key for a pick in the record of who owns it. */
export function pickKey(pick: PickRef): string {
  return `${pick.year}:${pick.round}:${pick.clubId}`
}

/** Everything a trade moves, both ways. */
export function tradedIds(trade: Trade): PlayerId[] {
  return trade.sides.flatMap((side) => [...side.players, ...side.prospects])
}
