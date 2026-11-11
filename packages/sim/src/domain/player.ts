import {
  GOALIE_ATTRIBUTE_KEYS,
  SKATER_ATTRIBUTE_KEYS,
  type GoalieAttributes,
  type SkaterAttributes,
} from './attributes.js'
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
   * The level the Player can still reach, on the 1-20 attribute scale (ADR-020).
   * Single attributes may sit above it. Never exposed raw to a Manager -
   * scouting reports derive from it.
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

/** `faceoffs` belongs to a role and `discipline` to temperament, so neither counts towards a level. */
export const SKATER_LEVEL_KEYS = SKATER_ATTRIBUTE_KEYS.filter(
  (key) => key !== 'faceoffs' && key !== 'discipline',
)

const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

/** A Skater's level, the scale `potential` is a ceiling on (ADR-020). */
export function skaterLevel(attributes: SkaterAttributes): number {
  return mean(SKATER_LEVEL_KEYS.map((key) => attributes[key]))
}

/** A Goalie's level: the mean of all five attributes. */
export function goalieLevel(attributes: GoalieAttributes): number {
  return mean(GOALIE_ATTRIBUTE_KEYS.map((key) => attributes[key]))
}

export function playerLevel(player: Player): number {
  return isSkater(player) ? skaterLevel(player.attributes) : goalieLevel(player.attributes)
}

/** Forwards, defencemen and Goalies: ranked apart, and a Roster's shape is kept per group. */
export type PositionGroup = 'forward' | 'defence' | 'goalie'

export function positionGroup(player: Player): PositionGroup {
  if (isGoalie(player)) return 'goalie'
  const natural = player.preferredPositions[0]
  return natural === 'LD' || natural === 'RD' ? 'defence' : 'forward'
}

/** Who left the league between one Season and the next, and why. */
export interface Departure {
  playerId: PlayerId
  clubId: ClubId
  /** His age in the Season he last played. */
  age: number
  /**
   * Retired and unsigned after a Season (ADR-027); released by his Club, or a
   * prospect whose rights expired and whom no Club took (ADR-028).
   */
  reason: 'retired' | 'unsigned' | 'released' | 'rights-expired'
}

/** A Player's natural position: the first he prefers, or a Goalie's net. */
export type NaturalPosition = SkaterPosition | 'G'

export function naturalPosition(player: Player): NaturalPosition {
  return isGoalie(player) ? 'G' : player.preferredPositions[0]!
}
