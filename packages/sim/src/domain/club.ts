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

/** A special-teams formation: a Line and a Pairing declared together. */
export interface Unit {
  line: Line
  pairing: Pairing
}

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
  starter: PlayerId
  backup: PlayerId
  /** Up to 2 power-play units, ordered. */
  powerPlayUnits: readonly Unit[]
  /** Up to 2 penalty-kill units, ordered. */
  penaltyKillUnits: readonly Unit[]
  tactics: Tactics
}
