/**
 * The rules a Club's active Roster and farm are kept to, as data (D-10, ADR-036).
 * A league without a farm is a value of these, not a branch. What is read today:
 * the claims and the deadline join it where they are read (#133). What a
 * contract on the farm costs is a cap rule (`CapRules.buried`).
 */
export interface FarmRules {
  /** The most Players on a Club's active Roster, Injured Reserve not counted. */
  activeMax: number
  /** The most contracts a Club may hold, active Roster and farm together. */
  contractsMax: number
  /**
   * Days an injury must keep a Player out for him to go on Injured Reserve,
   * where he does not count against `activeMax` (CBA 16.11).
   */
  injuredReserveDays: number
  /**
   * Below this many fit Players in a group a Club may call up from its farm
   * whatever its active Roster holds (CBA 13.12(m), emergency conditions).
   */
  emergency: { forward: number; defence: number; goalie: number }
  waivers: WaiverRules
}

/** Who goes down to the farm without waivers, and how a claim is made (CBA Article 13). */
export interface WaiverRules {
  exemption: WaiverExemption
}

/**
 * The exemption from waivers (CBA 13.4): by the Player's age when he signed his
 * first contract, a number of Seasons, and a number of NHL games, regular Season
 * and playoffs, whichever runs out first.
 */
export interface WaiverExemption {
  skaters: readonly ExemptionRow[]
  goalies: readonly ExemptionRow[]
  /**
   * A Player who signed at this age or younger has his exemption shortened, to
   * `shortened` Seasons from the first in which he plays `shortenAfter` NHL games
   * or more.
   */
  youngUpTo: number
  shortenAfter: number
  shortened: { skaters: number; goalies: number }
}

/** A row of an exemption table: the youngest age at signing first, the last for any older. */
export interface ExemptionRow {
  /** The age at signing this row holds. */
  age: number
  /** Seasons he is exempt, counted from his first Season under contract. */
  seasons: number
  /** NHL games that end the exemption at once, or null for no such limit. */
  games: number | null
}
