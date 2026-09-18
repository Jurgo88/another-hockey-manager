import type { ClubId, PlayerId } from './player.js'

/**
 * The event stream is the engine's ONLY output (D-03).
 *
 * Box scores, player statistics, standings and commentary are all derived
 * from this array by src/stats. The engine never computes a summary figure
 * alongside the stream, because two sources of truth drift: what the Manager
 * reads in the play-by-play must be exactly what the statistics say.
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
  clubId: ClubId
  goalie: PlayerId
  shooter: PlayerId
  /** True when the puck stayed live and a rebound chance follows. */
  rebound: boolean
}

export interface TurnoverEvent extends EventBase {
  type: 'turnover'
  clubId: ClubId
  kind: TurnoverKind
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
  /** The Club with the advantage. */
  clubId: ClubId
  /** 5 means 5-on-4, 4 means 5-on-3 handled as skaters on each side. */
  skatersFor: number
  skatersAgainst: number
}

export interface PowerPlayEndEvent extends EventBase {
  type: 'powerplay_end'
  clubId: ClubId
  /** Why the advantage ended. */
  reason: 'expired' | 'goal' | 'period_end'
}

export type MatchEvent =
  | PeriodStartEvent
  | PeriodEndEvent
  | FaceoffEvent
  | ShiftChangeEvent
  | ShotEvent
  | GoalEvent
  | SaveEvent
  | TurnoverEvent
  | PenaltyEvent
  | PowerPlayStartEvent
  | PowerPlayEndEvent

export type MatchEventType = MatchEvent['type']
