import { fileURLToPath } from 'node:url'
import { startSeason, type AttributeProvenance } from '@ahm/sim'
import { describe, expect, it, vi } from 'vitest'
import { shownAttributes } from '../server/utils/attributes'
import { readRosterProvider } from '../server/utils/rosters'

const ROSTER_FILE = fileURLToPath(
  new URL('../../../packages/estimate/data/nhl-20252026.json', import.meta.url),
)

describe('a career on a roster file (ADR-003 amendment)', () => {
  it('starts a Season on the Players of the file', async () => {
    const provider = readRosterProvider(ROSTER_FILE)
    expect(provider).not.toBeNull()
    const state = await startSeason(5, provider!)
    const boston = state.clubs.find((club) => club.id === 'bos')!
    expect(boston.skaters.every((skater) => skater.id.startsWith('nhl-'))).toBe(true)
  })

  it('offers no file it cannot read, and says why', () => {
    const warn = vi.fn()
    expect(readRosterProvider('no/such/roster-file.json', warn)).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('no/such/roster-file.json')
  })
})

describe('attributes as a Manager sees them (D-11, FR-18)', () => {
  const attributes = { speed: 7, shooting: 15, stamina: 19 }
  const estimate = (confidence: number): AttributeProvenance => ({ source: 'derived', confidence })
  const provenance = { speed: estimate(0.44), shooting: estimate(1) }

  it('shows an estimate as a range around it, and a sure value as a point', () => {
    expect(shownAttributes(attributes, provenance, true)).toEqual({
      speed: { low: 4, high: 10 },
      shooting: { low: 15, high: 15 },
      // No provenance: shown as it is.
      stamina: { low: 19, high: 19 },
    })
  })

  it('sends an estimate as its range alone, not as a figure', () => {
    const shown = shownAttributes(attributes, provenance, true)
    expect(Object.keys(shown.speed)).toEqual(['low', 'high'])
  })

  it('shows a generated league as it always has, whatever its confidence', () => {
    expect(shownAttributes(attributes, provenance, false)).toEqual({
      speed: { low: 7, high: 7 },
      shooting: { low: 15, high: 15 },
      stamina: { low: 19, high: 19 },
    })
  })
})
