import { describe, expect, it } from 'vitest'
import { NHL_CAP_RULES } from '../../src/data/nhl-2026-27.js'
import { payrolls } from '../../src/stats/league.js'
import { longRuns } from '../support/simulations.js'

/**
 * Contracts over ten Seasons (#125): every Player on a Roster holds one in every
 * Season of the eight generated runs. Payrolls are reported by `pnpm sim:season
 * --seasons 10` and asserted at the Phase 3 gate, once the cap is enforced
 * (item 4) and budgets are set (item 7).
 */

const rules = NHL_CAP_RULES

describe('contracts over ten Seasons', () => {
  it('holds every rostered Player under a contract the rules allow, in every Season', async () => {
    for (const run of await longRuns()) {
      expect(run.contracts).toHaveLength(10)
      for (const [i, season] of run.contracts.entries()) {
        expect(season).toHaveLength(run.seasons[i]!.roster.length)
        for (const entry of season) {
          const contract = entry.contract
          expect(contract, `${entry.playerId} in Season ${i + 1}`).toBeDefined()
          expect(contract!.years).toBeGreaterThanOrEqual(1)
          expect(contract!.years).toBeLessThanOrEqual(rules.maxTerm.ownClub)
          expect(contract!.capHit).toBeGreaterThanOrEqual(rules.minimum - 1e-12)
          expect(contract!.capHit).toBeLessThanOrEqual(rules.maximum)
        }
      }
    }
  })

  it('opens every league at or under the cap', async () => {
    for (const run of await longRuns()) {
      expect(payrolls(run.contracts[0]!).highest).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('starts every Club at or above the floor, in every Season (ADR-031)', async () => {
    for (const run of await longRuns()) {
      for (const [i, contracts] of run.contracts.entries()) {
        const { lowest } = payrolls(contracts, run.deadMoney[i])
        expect(lowest, `Season ${i + 1}`).toBeGreaterThanOrEqual(rules.lowerLimit - 1e-9)
      }
    }
  })
})
