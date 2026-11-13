import { describe, expect, it } from 'vitest'
import { targetIt, type Reported } from './reported.js'
import type { SimulatedRun } from '../../src/cli/season.js'
import { draftOutcomes } from '../../src/stats/history.js'
import {
  ageProfile,
  leavingRate,
  leavingRows,
  tableDynamics,
  type LeavingRow,
} from '../../src/stats/league.js'

/**
 * The Phase 2 gate (#90): ten Seasons in a row, against the targets in
 * `04-validation-targets.md` measured in `07-league-over-time.md`. Every table
 * is read on the runs given pooled: eight generated leagues in `@ahm/sim`, the
 * 2025-26 roster file on its own in `@ahm/estimate`. Tier 1 and Tier 2 in the
 * tenth Season are the realism suites run on the runs' last Seasons.
 *
 * The table's longest top-8 run, Clubs finishing first and spread of points
 * are reported (`pnpm sim:season --seasons 10`) and asserted at the Phase 3
 * gate; the shape of careers is asserted on development alone
 * (`test/develop.test.ts`).
 *
 * A red row means calibrating development, departures or the draft, not
 * widening the band.
 */

const within = (value: number, target: number, band: number) => {
  expect(value).toBeGreaterThanOrEqual(target - band)
  expect(value).toBeLessThanOrEqual(target + band)
}

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length
const median = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!

const LEAVING_BY_AGE = [
  { label: '23 or younger', from: 0, to: 23, rate: 0.044, band: 0.03 },
  { label: '24-27', from: 24, to: 27, rate: 0.073, band: 0.03 },
  { label: '28-30', from: 28, to: 30, rate: 0.074, band: 0.03 },
  { label: '31-33', from: 31, to: 33, rate: 0.13, band: 0.04 },
  { label: '34-36', from: 34, to: 36, rate: 0.23, band: 0.06 },
  { label: '37 or older', from: 37, to: 99, rate: 0.43, band: 0.12 },
]

const LEAVING_BY_THIRD = [
  { label: 'top', rate: 0.013, band: 0.02 },
  { label: 'middle', rate: 0.053, band: 0.03 },
  { label: 'bottom', rate: 0.201, band: 0.06 },
]

/** The first four classes, those of Seasons 2 to 5 (ADR-028). */
const CLASSES = [2, 3, 4, 5]

const DRAFT = [
  { round: 1, regulars: 0.749, band: 0.12, debut: 1 },
  { round: 2, regulars: 0.385, band: 0.12, debut: 3 },
  { round: 3, regulars: 0.199, band: 0.1, debut: 3 },
  { round: 4, regulars: 0.165, band: 0.1, debut: 3 },
]

/** The gate tables on the runs given, each of ten Seasons. */
export function gateSuite(
  when: string,
  runs: () => Promise<readonly SimulatedRun[]>,
  reported: Reported = {},
): void {
  const target = targetIt(reported)
  describe(`the Phase 2 gate, ${when}`, async () => {
    const all = await runs()
    const tenth = all.map((run) => run.seasons.at(-1)!)

    it('plays ten Seasons in every run', () => {
      for (const run of all)
        expect(run.seasons.map((season) => season.year)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })

    describe('the age of the league, in the tenth Season', () => {
      const ages = tenth.map(ageProfile)

      target('mean age, weighted by Fixtures: 27.0 ±0.7', () => {
        within(mean(ages.map((age) => age.meanAge)), 27.0, 0.7)
      })

      target('Players aged 31 or more: 18% ±5 pp', () => {
        within(mean(ages.map((age) => age.oldShare)), 0.18, 0.05)
      })

      target('Players aged 23 or younger: 30% ±5 pp', () => {
        within(mean(ages.map((age) => age.youngShare)), 0.3, 0.05)
      })

      it('oldest Player: at least 38, in every run', () => {
        for (const age of ages) expect(age.oldest).toBeGreaterThanOrEqual(38)
      })
    })

    describe('leaving the league, per Season, Players with 20 or more Fixtures', () => {
      const rows: LeavingRow[] = all.flatMap((run) => leavingRows(run.seasons))

      for (const { label, from, to, rate, band } of LEAVING_BY_AGE) {
        target(`aged ${label}: ${rate} ±${band}`, () => {
          within(leavingRate(rows.filter((row) => row.age >= from && row.age <= to)), rate, band)
        })
      }

      LEAVING_BY_THIRD.forEach(({ label, rate, band }, third) => {
        target(`${label} third of ice time in his group: ${rate} ±${band}`, () => {
          within(leavingRate(rows.filter((row) => row.third === third)), rate, band)
        })
      })
    })

    describe('the draft, its first four classes, read in Season 10', () => {
      const tables = all.map((run) => draftOutcomes(run.seasons, CLASSES))

      for (const { round, regulars, band } of DRAFT) {
        target(`round ${round}: ${regulars} play 200 Fixtures or more (±${band})`, () => {
          within(
            mean(tables.map((table) => table.find((row) => row.round === round)!.regulars)),
            regulars,
            band,
          )
        })
      }

      for (const { round, debut } of DRAFT) {
        target(`round ${round}: a median of ${debut} Seasons to debut (±1)`, () => {
          within(
            median(tables.map((table) => table.find((row) => row.round === round)!.seasonsToDebut)),
            debut,
            1,
          )
        })
      }
    })

    describe('the table, across the ten Seasons', () => {
      const tables = all.map((run) => tableDynamics(run.seasons))

      target('correlation of Club points, consecutive Seasons: 0.51 ±0.12', () => {
        within(mean(tables.map((table) => table.correlation)), 0.51, 0.12)
      })

      target('top 8 still top 8 the next Season: 46% ±12 pp', () => {
        within(mean(tables.map((table) => table.topStays)), 0.46, 0.12)
      })

      target('bottom 8 still bottom 8 the next Season: 51% ±12 pp', () => {
        within(mean(tables.map((table) => table.bottomStays)), 0.51, 0.12)
      })
    })
  })
}
