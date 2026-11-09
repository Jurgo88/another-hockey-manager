/**
 * Deterministic pseudo-random number generation.
 *
 * INVARIANT (D-02): `Math.random()` must never appear anywhere in @ahm/sim.
 * Every stochastic decision draws from an injected `Rng`, so that a fixture
 * simulated twice from the same seed produces a byte-identical event stream.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number
  /** True with the given probability (clamped to [0, 1]). */
  chance(probability: number): boolean
  /** Uniformly selects one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T
  /** Returns a new shuffled array; the input is not mutated. */
  shuffle<T>(items: readonly T[]): T[]
  /**
   * Derives an independent generator from this one, labelled by `label`.
   * Used to give each fixture its own stream so that adding a fixture to a
   * season does not shift the random numbers of the others.
   */
  fork(label: string): Rng
}

/**
 * mulberry32 - a 32-bit generator with a 2^32 period. Fast, tiny, and good
 * enough for simulation: we need reproducibility and uniformity, not
 * cryptographic strength.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a, used to mix a string label into a numeric seed. */
function hashLabel(label: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0
  for (let i = 0; i < label.length; i++) {
    h = (h ^ label.charCodeAt(i)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** A standard normal draw by Box-Muller. Symmetric and unbounded, unlike `next()`. Takes two draws. */
export function gaussian(rng: Rng): number {
  const u = Math.max(rng.next(), Number.EPSILON)
  const v = rng.next()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed)

  const rng: Rng = {
    next,

    int(min, max) {
      if (max < min) throw new RangeError(`int(${min}, ${max}): max is below min`)
      return min + Math.floor(next() * (max - min + 1))
    },

    chance(probability) {
      if (probability <= 0) return false
      if (probability >= 1) return true
      return next() < probability
    },

    pick(items) {
      if (items.length === 0) throw new RangeError('pick(): empty array')
      return items[Math.floor(next() * items.length)]!
    },

    shuffle(items) {
      const copy = [...items]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
      }
      return copy
    },

    fork(label) {
      return createRng(hashLabel(label, seed))
    },
  }

  return rng
}
