/**
 * The rules a Club's active Roster and farm are kept to, as data (D-10, ADR-036).
 * A league without a farm is a value of these, not a branch. What is read today:
 * the waivers and the deadline join it where they are read (#133). What a
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
}
