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
  deadline: DeadlineRules
}

/**
 * The trade deadline and what it closes (CBA 13.12(j)-(n), 16.4(a)): from it to
 * the end of a Club's Season, the active Roster has no limit, nobody goes down
 * but a Player called up since, and a Club has a number of regular call-ups,
 * with a cap on how many of them are up at once. Emergency call-ups, below the
 * line of `FarmRules.emergency`, are not counted.
 */
export interface DeadlineRules {
  /** The deadline is this many days before the last day of the regular Season. */
  daysBeforeEnd: number
  /** Regular call-ups a Club has from the deadline on. */
  recalls: number
  /** How many of them may be on its active Roster at once. */
  onRoster: number
}

/** Who goes down to the farm without waivers, and how a claim is made (CBA Article 13). */
export interface WaiverRules {
  exemption: WaiverExemption
  /** Days a Player stays on waivers before he is claimed or clears them (13.18). */
  claimDays: number
  /**
   * Days from the first of the regular Season during which claims go by the last
   * Season's final table rather than this one's (13.19).
   */
  priorTableDays: number
  /**
   * Once cleared, a Player goes down again without waivers until he has spent
   * `days` on an active Roster or played `games` NHL games since (13.2, 13.5).
   */
  reWaiver: { days: number; games: number }
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
