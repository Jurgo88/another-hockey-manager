import { observedRange, type AttributeProvenance } from '@ahm/sim'

/** An attribute as a Manager may see it: a point when it is known, a range when it is not. */
export interface ShownAttribute {
  low: number
  high: number
}

/**
 * Attributes as a Manager may see them (D-11, FR-18). On a roster file each is
 * a range by its confidence, so an estimate of a real Player is not shown as a
 * fact. The range is symmetric and says how far to trust the estimate; hiding
 * the value is scouting (Phase 3). A generated league shows its values as
 * they are until then: they have no real-world counterpart to misstate, and
 * nothing could narrow a range yet (ADR-003 amendment).
 */
export function shownAttributes<K extends string>(
  attributes: Readonly<Record<K, number>>,
  provenance: Readonly<Partial<Record<K, AttributeProvenance>>> | undefined,
  byConfidence: boolean,
): Record<K, ShownAttribute> {
  const shown = {} as Record<K, ShownAttribute>
  for (const key of Object.keys(attributes) as K[]) {
    const value = attributes[key]
    const known = byConfidence ? provenance?.[key] : undefined
    if (known) {
      const { low, high } = observedRange(value, known.confidence)
      shown[key] = { low, high }
    } else {
      shown[key] = { low: value, high: value }
    }
  }
  return shown
}
