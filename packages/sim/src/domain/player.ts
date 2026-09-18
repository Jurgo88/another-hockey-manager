import type { GoalieAttributes, SkaterAttributes } from './attributes.js'
import type { GoalieProvenance, SkaterProvenance } from './provenance.js'

export type PlayerId = string
export type ClubId = string

export type Handedness = 'left' | 'right'

/** On-ice roles. Goalie is deliberately a separate Player subtype, not a position. */
export type SkaterPosition = 'LW' | 'C' | 'RW' | 'LD' | 'RD'

interface PlayerBase {
  id: PlayerId
  clubId: ClubId
  firstName: string
  lastName: string
  /** Age in whole years at the start of the current Season. */
  age: number
  /**
   * Ceiling the player can still develop toward, on the same 1-20 scale as
   * attributes. Never exposed raw to a Manager - scouting reports derive from it.
   */
  potential: number
  handedness: Handedness
  /** 0-100. Short-term deviation from true ability. Reset between Seasons. */
  form: number
  /** 0-100. Accumulated within a Match and across a congested schedule. */
  fatigue: number
}

export interface Skater extends PlayerBase {
  kind: 'skater'
  /** Ordered by preference. The first entry is the natural position. */
  preferredPositions: readonly SkaterPosition[]
  attributes: SkaterAttributes
  /**
   * Where each attribute came from and how much to trust it (ADR-008).
   * Optional: a Roster with no provenance is treated as uniformly generated.
   * Kept parallel to `attributes` so engine reads stay plain numbers.
   */
  provenance?: SkaterProvenance
}

export interface Goalie extends PlayerBase {
  kind: 'goalie'
  attributes: GoalieAttributes
  provenance?: GoalieProvenance
}

export type Player = Skater | Goalie

export function isSkater(player: Player): player is Skater {
  return player.kind === 'skater'
}

export function isGoalie(player: Player): player is Goalie {
  return player.kind === 'goalie'
}

export function displayName(player: Player): string {
  return `${player.firstName} ${player.lastName}`
}
