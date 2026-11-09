import type { GoalieAttributes, SkaterAttributes } from './attributes.js'

/**
 * Where an attribute value came from, and how much it should be trusted.
 *
 * A Player's identity and a Player's ability are separate concerns (ADR-008).
 * Real NHL Players can carry genuinely measured values for some attributes -
 * NHL EDGE publishes per-Player top skating speed and shot velocity - while
 * others can only be inferred from performance, and a few have no public
 * source at all. Generated and community-rated Players sit on the same scale.
 *
 * Provenance is kept in a record PARALLEL to the attributes rather than
 * wrapping each value, so that `attributes.speed` stays a plain number. The
 * engine reads attributes millions of times per realism run and must not pay
 * for metadata it never looks at; scouting and the interface consult
 * provenance instead.
 */

export type AttributeSource =
  /** Taken from tracking data. NHL EDGE speed and shot velocity, faceoff rate. */
  | 'measured'
  /** Inferred from performance statistics by the attribute estimator. */
  | 'derived'
  /** Set by hand - a community database, or the author. Overrides derived. */
  | 'rated'
  /** Produced procedurally, anchored to the Player's level. */
  | 'generated'

export interface AttributeProvenance {
  source: AttributeSource
  /** 0-1. How closely the stored value is believed to track true ability. */
  confidence: number
  /** Optional human-readable origin, e.g. 'NHL EDGE max speed 24.6 mph'. */
  note?: string
  /**
   * Seasons of modelled development since the value was set (ADR-022). Absent
   * means none: the value is as its source gave it. A speed measured at 24 is
   * not a measurement at 30, so confidence falls with every Season.
   */
  seasonsAged?: number
}

export type SkaterProvenance = Readonly<Record<keyof SkaterAttributes, AttributeProvenance>>
export type GoalieProvenance = Readonly<Record<keyof GoalieAttributes, AttributeProvenance>>

/**
 * Starting confidence per source. An estimator may lower its own figure for a
 * specific attribute - `checking` derived from hit counts deserves far less
 * trust than `speed` read off a radar gun, because hit counts measure
 * deployment as much as ability.
 */
export const DEFAULT_CONFIDENCE: Readonly<Record<AttributeSource, number>> = {
  measured: 0.95,
  rated: 0.8,
  derived: 0.5,
  generated: 0.25,
}

export const CONFIDENCE_MIN = 0
export const CONFIDENCE_MAX = 1

export function clampConfidence(value: number): number {
  return Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, value))
}

/**
 * The range a Manager is shown instead of an exact value.
 *
 * This is the whole point of tracking confidence: scouting is not a separate
 * mechanic bolted on beside the attributes, it is the act of narrowing this
 * range. A fully measured attribute shows as a point; an unscouted junior
 * shows as a wide band.
 *
 * `spread` is the half-width in attribute points. At confidence 1 it is 0; at
 * confidence 0 it is `maxSpread`. The range is clamped to the attribute scale,
 * so a 19 with low confidence reports 16-20 rather than 16-22.
 */
export function observedRange(
  value: number,
  confidence: number,
  options: { maxSpread?: number; min?: number; max?: number } = {},
): { low: number; high: number; spread: number } {
  const { maxSpread = 5, min = 1, max = 20 } = options
  const spread = Math.round(maxSpread * (1 - clampConfidence(confidence)))

  return {
    low: Math.max(min, value - spread),
    high: Math.min(max, value + spread),
    spread,
  }
}

/** True when every attribute in a provenance record came from the same source. */
export function isUniformSource(
  provenance: Readonly<Record<string, AttributeProvenance>>,
  source: AttributeSource,
): boolean {
  return Object.values(provenance).every((entry) => entry.source === source)
}

/** Mean confidence across a provenance record. Used to rank scouting priority. */
export function meanConfidence(
  provenance: Readonly<Record<string, AttributeProvenance>>,
): number {
  const entries = Object.values(provenance)
  if (entries.length === 0) return 0
  return entries.reduce((sum, entry) => sum + entry.confidence, 0) / entries.length
}

/** Builds a uniform provenance record, the common case for generated Players. */
export function uniformProvenance<K extends string>(
  keys: readonly K[],
  source: AttributeSource,
  confidence = DEFAULT_CONFIDENCE[source],
): Readonly<Record<K, AttributeProvenance>> {
  return Object.fromEntries(
    keys.map((key) => [key, { source, confidence: clampConfidence(confidence) }]),
  ) as Record<K, AttributeProvenance>
}
