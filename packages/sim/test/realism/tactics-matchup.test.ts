import { describe, expect, it } from 'vitest'
import { playAll } from '../support/tactics.js'

/**
 * Tier 3 (04-validation-targets.md): every Tactics dial has a measurable,
 * directionally correct effect. The matchup policy.
 */

describe('Tier 3 - tactics are not placebos: matchups', () => {
  const none = playAll({})
  const exploit = playAll({ matchup: 'exploit' })
  const shutdown = playAll({ matchup: 'shutdown' })

  it('exploit raises the first Line point production', () => {
    expect(exploit.firstLinePoints).toBeGreaterThan(none.firstLinePoints)
  })

  it('shutdown lowers the opposing first Line point production', () => {
    expect(shutdown.opposingFirstLinePoints).toBeLessThan(none.opposingFirstLinePoints)
  })

  it('a matchup tires the Skaters it sends out', () => {
    expect(exploit.endFatigue).toBeGreaterThan(none.endFatigue)
    expect(shutdown.endFatigue).toBeGreaterThan(none.endFatigue)
  })
})
