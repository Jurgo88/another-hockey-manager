import type { Rng } from '../rng/index.js'

/** Weighted-random index draw. Throws on an empty or all-zero weight array. */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) throw new Error('weightedIndex: total weight must be positive')

  let draw = rng.next() * total
  for (let i = 0; i < weights.length; i++) {
    draw -= weights[i]!
    if (draw < 0) return i
  }
  return weights.length - 1
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

export function logit(p: number): number {
  return Math.log(p / (1 - p))
}

/**
 * A draw from the standard logistic distribution - the natural noise for a
 * quantity modelled in log-odds, and one `next()` call instead of two.
 */
export function logisticNoise(rng: Rng): number {
  const u = Math.min(Math.max(rng.next(), 1e-9), 1 - 1e-9)
  return Math.log(u / (1 - u))
}
