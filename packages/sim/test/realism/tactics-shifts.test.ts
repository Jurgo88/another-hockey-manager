import { describe, expect, it } from 'vitest'
import { playAll } from '../support/tactics.js'

/**
 * Tier 3 (04-validation-targets.md): every Tactics dial has a measurable,
 * directionally correct effect. Shift length, alone and under a matchup.
 */

describe('Tier 3 - tactics are not placebos: shift length', () => {
  const shortShifts = playAll({ shiftLength: 75 })
  const longShifts = playAll({ shiftLength: 25 })
  const exploitLongShifts = playAll({ matchup: 'exploit', shiftLength: 25 })
  const exploitShortShifts = playAll({ matchup: 'exploit', shiftLength: 75 })

  it('shorter Shifts leave a Roster less tired at the end of a Fixture', () => {
    expect(shortShifts.endFatigue).toBeLessThan(longShifts.endFatigue)
  })

  it('shorter Shifts weaken a matchup', () => {
    expect(exploitShortShifts.firstLineSeconds).toBeLessThan(exploitLongShifts.firstLineSeconds)
  })
})
