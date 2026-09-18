import { describe, expect, it } from 'vitest'
import { SKATER_ATTRIBUTE_KEYS } from '../src/domain/attributes.js'
import {
  DEFAULT_CONFIDENCE,
  clampConfidence,
  isUniformSource,
  meanConfidence,
  observedRange,
  uniformProvenance,
} from '../src/domain/provenance.js'

describe('SKATER_ATTRIBUTE_KEYS', () => {
  it('holds 11 attributes after strength was removed under D-06', () => {
    expect(SKATER_ATTRIBUTE_KEYS).toHaveLength(11)
    expect(SKATER_ATTRIBUTE_KEYS).not.toContain('strength')
  })

  it('has no duplicates', () => {
    expect(new Set(SKATER_ATTRIBUTE_KEYS).size).toBe(SKATER_ATTRIBUTE_KEYS.length)
  })
})

describe('DEFAULT_CONFIDENCE', () => {
  it('trusts measured most and generated least', () => {
    expect(DEFAULT_CONFIDENCE.measured).toBeGreaterThan(DEFAULT_CONFIDENCE.rated)
    expect(DEFAULT_CONFIDENCE.rated).toBeGreaterThan(DEFAULT_CONFIDENCE.derived)
    expect(DEFAULT_CONFIDENCE.derived).toBeGreaterThan(DEFAULT_CONFIDENCE.generated)
  })

  it('stays inside 0-1', () => {
    for (const value of Object.values(DEFAULT_CONFIDENCE)) {
      expect(value).toBeGreaterThan(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe('clampConfidence', () => {
  it('clamps to 0-1', () => {
    expect(clampConfidence(-3)).toBe(0)
    expect(clampConfidence(0.4)).toBe(0.4)
    expect(clampConfidence(9)).toBe(1)
  })
})

describe('observedRange', () => {
  it('reports a point when fully confident', () => {
    expect(observedRange(17, 1)).toEqual({ low: 17, high: 17, spread: 0 })
  })

  it('widens as confidence falls', () => {
    const measured = observedRange(12, 0.95)
    const derived = observedRange(12, 0.5)
    const generated = observedRange(12, 0.25)

    expect(measured.spread).toBeLessThan(derived.spread)
    expect(derived.spread).toBeLessThan(generated.spread)
  })

  it('never reports outside the attribute scale', () => {
    expect(observedRange(19, 0)).toEqual({ low: 14, high: 20, spread: 5 })
    expect(observedRange(2, 0)).toEqual({ low: 1, high: 7, spread: 5 })
  })

  it('honours a custom maximum spread', () => {
    expect(observedRange(10, 0, { maxSpread: 8 })).toEqual({ low: 2, high: 18, spread: 8 })
  })

  it('treats out-of-range confidence as the nearest bound', () => {
    expect(observedRange(10, 5).spread).toBe(0)
    expect(observedRange(10, -5).spread).toBe(5)
  })
})

describe('uniformProvenance', () => {
  const generated = uniformProvenance(SKATER_ATTRIBUTE_KEYS, 'generated')

  it('covers every attribute key', () => {
    expect(Object.keys(generated).sort()).toEqual([...SKATER_ATTRIBUTE_KEYS].sort())
  })

  it('applies the source default confidence', () => {
    for (const entry of Object.values(generated)) {
      expect(entry).toEqual({ source: 'generated', confidence: DEFAULT_CONFIDENCE.generated })
    }
  })

  it('accepts an explicit confidence and clamps it', () => {
    const forced = uniformProvenance(['speed'] as const, 'derived', 4)
    expect(forced.speed.confidence).toBe(1)
  })
})

describe('isUniformSource and meanConfidence', () => {
  it('recognises a uniformly generated Player', () => {
    const generated = uniformProvenance(SKATER_ATTRIBUTE_KEYS, 'generated')
    expect(isUniformSource(generated, 'generated')).toBe(true)
    expect(isUniformSource(generated, 'measured')).toBe(false)
  })

  it('recognises a mixed-source Player - the real NHL import case', () => {
    const mixed = {
      ...uniformProvenance(SKATER_ATTRIBUTE_KEYS, 'derived'),
      speed: { source: 'measured' as const, confidence: 0.95, note: 'NHL EDGE 24.6 mph' },
      shooting: { source: 'measured' as const, confidence: 0.9, note: 'NHL EDGE shot velocity' },
      checking: { source: 'derived' as const, confidence: 0.3, note: 'hits confounded by deployment' },
    }

    expect(isUniformSource(mixed, 'derived')).toBe(false)
    expect(mixed.speed.confidence).toBeGreaterThan(mixed.checking.confidence)
    // A mixed real Player should still be better known than a generated one.
    expect(meanConfidence(mixed)).toBeGreaterThan(
      meanConfidence(uniformProvenance(SKATER_ATTRIBUTE_KEYS, 'generated')),
    )
  })

  it('returns zero mean confidence for an empty record', () => {
    expect(meanConfidence({})).toBe(0)
  })
})
