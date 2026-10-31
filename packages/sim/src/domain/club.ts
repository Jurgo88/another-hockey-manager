import type { ClubId, Goalie, PlayerId, Skater } from './player.js'

export type ManagerId = string

/**
 * A Manager is whoever makes decisions for a Club. Human and AI Managers are
 * the same entity distinguished by a flag (D-04) - there is no separate AI
 * code path, and no `if (human)` branch anywhere in the engine. This is the
 * single decision that makes multiplayer a configuration change rather than
 * a rewrite.
 */
export interface Manager {
  id: ManagerId
  clubId: ClubId
  name: string
  isAi: boolean
}

export interface Club {
  id: ClubId
  /** Short code used in standings tables, e.g. 'BOS'. */
  code: string
  name: string
  skaters: readonly Skater[]
  goalies: readonly Goalie[]
}

/** A forward unit. */
export interface Line {
  leftWing: PlayerId
  centre: PlayerId
  rightWing: PlayerId
}

/** A defensive unit. */
export interface Pairing {
  leftDefence: PlayerId
  rightDefence: PlayerId
}

/**
 * A special-teams formation (ADR-009): Skaters in priority order. A power-play
 * Unit lists exactly 5, a penalty-kill Unit exactly 4. When fewer are needed,
 * or a listed Skater is in the box, the engine takes the first available in
 * order - so a Manager decides who stays out on a 5-on-3 by listing them last.
 */
export interface Unit {
  skaters: readonly PlayerId[]
}

export const POWER_PLAY_UNIT_SIZE = 5
export const PENALTY_KILL_UNIT_SIZE = 4

export type MatchupPolicy =
  /** Roll units in order, ignoring who the opponent has out. */
  | 'none'
  /** Try to put the top Line out against the opponent's weakest Pairing. */
  | 'exploit'
  /** Try to put the best defensive unit out against the opponent's top Line. */
  | 'shutdown'

export interface Tactics {
  /** 0-100. Higher trades defensive structure for offensive pressure. */
  aggression: number
  /** 0-100. Higher means more shots from distance, fewer forced plays. */
  shotVolume: number
  /** 0-100. Higher means shorter shifts and less fatigue, but worse matchups. */
  shiftLength: number
  matchup: MatchupPolicy
  /**
   * When to pull the Goalie for an extra attacker (FR-22): any matching rule
   * pulls. Third Period only, never in playoff overtime where a goal ends the
   * Fixture. This is the only source of empty-net goals.
   */
  pullGoalie: readonly PullGoalieRule[]
  /** Who starts when the Lineup's `starter` should sit. */
  goalieRotation: GoalieRotation
}

/**
 * When the Lineup's `backup` starts instead of its `starter`. Either Goalie
 * sits under these rules, and the `starter` returns as soon as neither does.
 */
export interface GoalieRotation {
  /** Whoever played yesterday sits today. */
  restOnBackToBack: boolean
  /** Whoever has started this many Fixtures running sits the next, or null for no limit. */
  maxConsecutiveStarts: number | null
}

export interface PullGoalieRule {
  /** Goals behind, exactly. */
  deficit: number
  /** Pull once at most this many seconds remain in the third Period. */
  secondsRemaining: number
  /** Only while the Club has a man advantage - a 6-on-4 to chase a bigger deficit. */
  powerPlayOnly: boolean
}

/** Three Skaters for 3-on-3 regular-season overtime (FR-09). */
export interface OvertimeTrio {
  players: readonly [PlayerId, PlayerId, PlayerId]
}

/**
 * A Club's declared configuration for one Fixture. Validating a Lineup
 * (no player in two units, goalies distinct, positions legal) is the
 * responsibility of the caller, not the engine.
 */
export interface Lineup {
  clubId: ClubId
  /** Exactly 4, ordered first to fourth. */
  lines: readonly [Line, Line, Line, Line]
  /** Exactly 3, ordered first to third. */
  pairings: readonly [Pairing, Pairing, Pairing]
  /** In net for this Fixture. */
  starter: PlayerId
  /** Dressed, and on the bench. */
  backup: PlayerId
  /** 1 or 2 power-play Units of 5, ordered. */
  powerPlayUnits: readonly Unit[]
  /** 1 or 2 penalty-kill Units of 4, ordered. */
  penaltyKillUnits: readonly Unit[]
  /**
   * Ordered trios for 3-on-3 regular-season overtime. Three-on-three is a
   * different game from even strength - far more open ice - so it gets its
   * own rotation rather than reusing Lines and Pairings (FR-09).
   */
  overtimeRotation: readonly OvertimeTrio[]
  tactics: Tactics
}
