/**
 * Ranking and shrinkage, the arithmetic of ADR-021. Percentiles throughout:
 * ranks are robust to the outliers counting statistics are full of, and the
 * scale is decided afterwards by the generator's distribution.
 */

export interface Sample {
  id: number
  value: number
  /** How much data stands behind the value, in the metric's own unit (minutes, shots, draws). */
  weight: number
}

/** Percentile of each sample in its pool, 0-1 exclusive. Ties go by id, so the result never depends on order. */
export function percentiles(samples: readonly Sample[]): Map<number, number> {
  const ranked = [...samples].sort((a, b) => a.value - b.value || a.id - b.id)
  return new Map(ranked.map((sample, rank) => [sample.id, (rank + 0.5) / ranked.length]))
}

/**
 * A percentile among real Players moved above the generated fill, which takes
 * the bottom of the distribution: a real Player is never ranked below a Player
 * invented to stand in for one who does not exist.
 */
export function aboveFill(p: number, real: number, fill: number): number {
  return (p * real + fill) / (real + fill)
}

/**
 * Removes the part of a 5v5 rate that comes from where a Player starts his
 * shifts (R-07): a slope fitted across the pool, weighted by ice time, and each
 * value moved to what it would be at the pool's mean zone start share.
 */
export function adjustedForZoneStarts(
  samples: readonly Sample[],
  zoneStarts: ReadonlyMap<number, number>,
): Sample[] {
  const known = samples.filter((sample) => zoneStarts.has(sample.id))
  const total = known.reduce((sum, s) => sum + s.weight, 0)
  if (known.length < 3 || total === 0) return [...samples]

  const meanX = known.reduce((sum, s) => sum + s.weight * zoneStarts.get(s.id)!, 0) / total
  const meanY = known.reduce((sum, s) => sum + s.weight * s.value, 0) / total
  let covariance = 0
  let variance = 0
  for (const s of known) {
    const dx = zoneStarts.get(s.id)! - meanX
    covariance += s.weight * dx * (s.value - meanY)
    variance += s.weight * dx * dx
  }
  const slope = variance === 0 ? 0 : covariance / variance

  return samples.map((s) => {
    const x = zoneStarts.get(s.id)
    return x === undefined ? s : { ...s, value: s.value - slope * (x - meanX) }
  })
}

/** The share of the evidence that is the Player's own; the rest is his ice-time level. */
export function evidence(weight: number, halfWeight: number): number {
  return weight <= 0 ? 0 : weight / (weight + halfWeight)
}

/** Starts at the source's figure and falls with the sample, to the generated floor of 0.25 (ADR-021). */
export function confidenceOf(start: number, share: number): number {
  const floor = 0.25
  return Math.round((floor + (start - floor) * share) * 100) / 100
}
