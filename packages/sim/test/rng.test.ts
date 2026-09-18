import { describe, expect, it } from 'vitest'
import { createRng } from '../src/rng/index.js'

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = Array.from({ length: 50 }, () => createRng(1234).next())
    const b = Array.from({ length: 50 }, () => createRng(1234).next())
    expect(a).toEqual(b)
  })

  it('produces a reproducible sequence from one instance', () => {
    const first = createRng(99)
    const second = createRng(99)
    const seqA = Array.from({ length: 20 }, () => first.next())
    const seqB = Array.from({ length: 20 }, () => second.next())
    expect(seqA).toEqual(seqB)
  })

  it('yields different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next())
  })

  it('stays within [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 10_000; i++) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('is roughly uniform', () => {
    const rng = createRng(2026)
    const buckets = new Array<number>(10).fill(0)
    const draws = 100_000
    for (let i = 0; i < draws; i++) {
      buckets[Math.floor(rng.next() * 10)]! += 1
    }
    for (const count of buckets) {
      // Each bucket should hold ~10% of draws; allow a generous 1.5pp band.
      expect(count / draws).toBeGreaterThan(0.085)
      expect(count / draws).toBeLessThan(0.115)
    }
  })

  describe('int', () => {
    it('respects inclusive bounds', () => {
      const rng = createRng(5)
      const seen = new Set<number>()
      for (let i = 0; i < 1000; i++) seen.add(rng.int(1, 6))
      expect([...seen].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('rejects an inverted range', () => {
      expect(() => createRng(5).int(6, 1)).toThrow(RangeError)
    })
  })

  describe('chance', () => {
    it('treats out-of-range probabilities as certainties', () => {
      const rng = createRng(11)
      expect(rng.chance(0)).toBe(false)
      expect(rng.chance(-1)).toBe(false)
      expect(rng.chance(1)).toBe(true)
      expect(rng.chance(2)).toBe(true)
    })

    it('approximates the requested probability', () => {
      const rng = createRng(31)
      let hits = 0
      const draws = 50_000
      for (let i = 0; i < draws; i++) if (rng.chance(0.25)) hits++
      expect(hits / draws).toBeCloseTo(0.25, 2)
    })
  })

  describe('pick', () => {
    it('throws on an empty array', () => {
      expect(() => createRng(1).pick([])).toThrow(RangeError)
    })

    it('only returns members of the input', () => {
      const rng = createRng(3)
      const items = ['a', 'b', 'c'] as const
      for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items))
    })
  })

  describe('shuffle', () => {
    it('does not mutate the input and preserves members', () => {
      const input = [1, 2, 3, 4, 5]
      const copy = [...input]
      const shuffled = createRng(42).shuffle(input)
      expect(input).toEqual(copy)
      expect([...shuffled].sort((a, b) => a - b)).toEqual(copy)
    })
  })

  describe('fork', () => {
    it('derives independent streams per label', () => {
      const parent = createRng(1000)
      const left = parent.fork('fixture-1').next()
      const right = parent.fork('fixture-2').next()
      expect(left).not.toBe(right)
    })

    it('is stable: the same label always derives the same stream', () => {
      expect(createRng(1000).fork('fixture-1').next()).toBe(
        createRng(1000).fork('fixture-1').next(),
      )
    })
  })
})
