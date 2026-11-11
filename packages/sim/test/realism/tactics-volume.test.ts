import { describe, expect, it } from 'vitest'
import { FIXTURES_PER_PAIR, PAIRINGS_OF_CLUBS, playAll } from '../support/tactics.js'

/**
 * Tier 3 (04-validation-targets.md): every Tactics dial has a measurable,
 * directionally correct effect. Aggression and shot volume.
 */

describe('Tier 3 - tactics are not placebos: aggression and shot volume', () => {
  const none = playAll({})
  const aggressive = playAll({ aggression: 75 })
  const passive = playAll({ aggression: 25 })
  const shooting = playAll({ shotVolume: 75 })
  const selective = playAll({ shotVolume: 25 })

  it('plays the same number of Fixtures under every dial', () => {
    expect(aggressive.fixtures).toBe(none.fixtures)
    expect(none.fixtures).toBe(PAIRINGS_OF_CLUBS * FIXTURES_PER_PAIR)
  })

  it('aggression raises shots for, shots against and penalties', () => {
    expect(aggressive.shotsFor).toBeGreaterThan(passive.shotsFor)
    expect(aggressive.shotsAgainst).toBeGreaterThan(passive.shotsAgainst)
    expect(aggressive.penalties).toBeGreaterThan(passive.penalties)
  })

  it('shotVolume raises shots and lowers their mean danger', () => {
    expect(shooting.shotsFor).toBeGreaterThan(selective.shotsFor)
    expect(shooting.meanDanger).toBeLessThan(selective.meanDanger)
  })
})
