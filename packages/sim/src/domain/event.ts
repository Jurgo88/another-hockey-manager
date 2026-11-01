import type { ClubId, PlayerId } from './player.js'

/**
 * The event stream is the engine's ONLY output (D-03).
 *
 * Box scores, player statistics, standings and commentary are all derived
 * from this array by src/stats. The engine never computes a summary figure
 * alongside the stream, because two sources of truth drift: what the Manager
 * reads in the play-by-play must be exactly what the statistics say.
 */

/**
 * Shootout attempts are `shot` events in Period 'SO'. They decide the result
 * and count for nothing else: no Player or Club statistic includes them, as
 * in the NHL, and the winner's final score gains exactly one goal.
 */
export type Period = 1 | 2 | 3 | 'OT' | 'SO'

export type Strength =
  | 'even'
  /** Acting Club has the man advantage. */
  | 'powerplay'
  /** Acting Club is short-handed. */
  | 'penaltykill'

export type ShotResult = 'goal' | 'save' | 'miss' | 'block'

export type PenaltyKind =
  | 'tripping'
  | 'hooking'
  | 'holding'
  | 'slashing'
  | 'interference'
  | 'boarding'
  | 'roughing'
  | 'highsticking'
  | 'crosschecking'
  | 'delayofgame'

export type TurnoverKind = 'giveaway' | 'takeaway' | 'icing' | 'offside'

interface EventBase {
  /** Elapsed match time in whole seconds from the opening faceoff. */
  clock: number
  period: Period
  /**
   * From the perspective of the event's `clubId`; for a faceoff, the Club
   * that won it; for Period boundaries, the home Club. 4-on-4 is 'even'.
   */
  strength: Strength
}

export interface PeriodStartEvent extends EventBase {
  type: 'period_start'
}

export interface PeriodEndEvent extends EventBase {
  type: 'period_end'
  /** Running score at the end of the period, for convenience in rendering. */
  homeGoals: number
  awayGoals: number
}

export interface FaceoffEvent extends EventBase {
  type: 'faceoff'
  wonBy: ClubId
  winner: PlayerId
  loser: PlayerId
}

export interface ShiftChangeEvent extends EventBase {
  type: 'shift_change'
  clubId: ClubId
  /** Player ids taking the ice, forwards then defence. */
  onIce: readonly PlayerId[]
  /** The Goalie in net, or null while it is empty for an extra attacker. */
  goalie: PlayerId | null
}

export interface ShotEvent extends EventBase {
  type: 'shot'
  clubId: ClubId
  shooter: PlayerId
  result: ShotResult
  /** Present when result is 'save'. */
  goalie?: PlayerId
  /** Present when result is 'block'. */
  blocker?: PlayerId
  /** 0-1, how dangerous the attempt was before the result was resolved. */
  danger: number
}

export interface GoalEvent extends EventBase {
  type: 'goal'
  clubId: ClubId
  scorer: PlayerId
  /** Up to two, in credit order. */
  assists: readonly PlayerId[]
  goalieBeaten?: PlayerId
  /** True when scored with the net empty. */
  emptyNet: boolean
}

export interface SaveEvent extends EventBase {
  type: 'save'
  /** The Club making the save - the goalie's Club, not the shooter's. */
  clubId: ClubId
  goalie: PlayerId
  shooter: PlayerId
  /** True when the puck stayed live and a rebound chance follows. */
  rebound: boolean
}

export interface TurnoverEvent extends EventBase {
  type: 'turnover'
  /** The Club of `player`. */
  clubId: ClubId
  kind: TurnoverKind
  /**
   * For `giveaway`, `icing` and `offside`, the Player who lost the puck.
   * For `takeaway`, the Player who won it.
   */
  player: PlayerId
}

export interface PenaltyEvent extends EventBase {
  type: 'penalty'
  clubId: ClubId
  player: PlayerId
  kind: PenaltyKind
  minutes: 2 | 4 | 5
}

export interface PowerPlayStartEvent extends EventBase {
  type: 'powerplay_start'
  /**
   * The Club gaining one Skater of advantage (ADR-009). A 5-on-3 is two
   * nested starts.
   */
  clubId: ClubId
  /** Skaters on each side once this advantage is gained: 5 and 3 for a 5-on-3. */
  skatersFor: number
  skatersAgainst: number
}

export interface PowerPlayEndEvent extends EventBase {
  type: 'powerplay_end'
  clubId: ClubId
  /**
   * Why one Skater of advantage was lost (ADR-009). 'penalty' means the
   * advantaged Club was penalised in turn; 'period_end' that the Fixture ended.
   */
  reason: 'expired' | 'goal' | 'penalty' | 'period_end'
}

/**
 * A Player is hurt (ADR-012). Off the ice it comes before the opening faceoff
 * and the Player misses this Fixture too; `fixtures` counts only the ones after.
 */
export interface InjuryEvent extends EventBase {
  type: 'injury'
  clubId: ClubId
  player: PlayerId
  /** Club Fixtures missed after this one. */
  fixtures: number
  offIce: boolean
}

/** A Club took up another Lineup or Tactics at this intermission (ADR-016). */
export interface LineupChangeEvent extends EventBase {
  type: 'lineup_change'
  clubId: ClubId
}

/**
 * The last event of every stream: where the Match left each Skater on both
 * Rosters, 0-100. What the next Fixture starts from comes from here (ADR-010).
 */
export interface MatchEndEvent extends EventBase {
  type: 'match_end'
  fatigue: Readonly<Record<PlayerId, number>>
}

export type MatchEvent =
  | PeriodStartEvent
  | PeriodEndEvent
  | LineupChangeEvent
  | FaceoffEvent
  | ShiftChangeEvent
  | ShotEvent
  | GoalEvent
  | SaveEvent
  | TurnoverEvent
  | PenaltyEvent
  | PowerPlayStartEvent
  | PowerPlayEndEvent
  | InjuryEvent
  | MatchEndEvent

export type MatchEventType = MatchEvent['type']
