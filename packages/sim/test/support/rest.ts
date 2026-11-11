import { describe, expect, it } from 'vitest'
import { targetIt, type Reported } from './reported.js'
import type { SeasonSample } from './simulations.js'

/**
 * The cost of a congested schedule (FR-14, ADR-010, 04-validation-targets.md),
 * measured against NHL 2025-26 rest gaps and pooled over eight Seasons.
 *
 * Each figure compares a back-to-back with a normal two-day gap, and already
 * includes the Goalie rotation a back-to-back brings on (ADR-011).
 */

const CLUBS = 32
/** No more than this share of Skaters may end a Match worn out. */
const WORN_OUT_SHARE = 0.001
const WORN_OUT = 90

const within = (value: number, target: number, band: number) => {
  expect(value).toBeGreaterThanOrEqual(target - band)
  expect(value).toBeLessThanOrEqual(target + band)
}

interface Rest {
  games: number
  wins: number
  goalsFor: number
  goalsAgainst: number
}

/** The suite on the Seasons given: the first of eight leagues, or their tenth (#90). */
export function restSuite(
  when: string,
  samples: () => Promise<readonly SeasonSample[]>,
  reported: Reported = {},
): void {
  const target = targetIt(reported)
  describe(`rest between Fixtures, ${when}`, async () => {
    const all = await samples()
    const rest = new Map<number, Rest>()
    let gaps = 0
    let injuries = 0
    let clubFixtures = 0
    let wornOut = 0
    let skaterMatches = 0

    // Asked for together, so Seasons not yet cached are simulated side by side.
    for (const { fixtures, matches } of all) {
      const lastDay = new Map<string, number>()

      fixtures.forEach((fixture, i) => {
        const { result, fatigue, injuries: hurt } = matches[i]!
        injuries += hurt.length
        clubFixtures += 2
        for (const value of fatigue.values()) {
          skaterMatches++
          if (value >= WORN_OUT) wornOut++
        }

        const sides = [
          { clubId: fixture.homeClubId, goalsFor: result.homeGoals, against: result.awayGoals },
          { clubId: fixture.awayClubId, goalsFor: result.awayGoals, against: result.homeGoals },
        ]
        for (const { clubId, goalsFor, against } of sides) {
          const last = lastDay.get(clubId)
          lastDay.set(clubId, fixture.day)
          if (last === undefined) continue

          gaps++
          const gap = rest.get(fixture.day - last) ?? {
            games: 0,
            wins: 0,
            goalsFor: 0,
            goalsAgainst: 0,
          }
          gap.games++
          if (result.winner === clubId) gap.wins++
          gap.goalsFor += goalsFor
          gap.goalsAgainst += against
          rest.set(fixture.day - last, gap)
        }
      })
    }

    const backToBack = rest.get(1)!
    const normal = rest.get(2)!

    it('schedules 16.6% ±2.0 pp of gaps as back-to-backs', () => {
      within((100 * backToBack.games) / gaps, 16.6, 2)
    })

    it('gives a Club 13.7 ±1.5 back-to-backs a Season', () => {
      within(backToBack.games / all.length / CLUBS, 13.7, 1.5)
    })

    it('never plays three days running', () => {
      expect([...rest.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3])
    })

    target('a back-to-back costs 0.20 ±0.15 goals for', () => {
      within(normal.goalsFor / normal.games - backToBack.goalsFor / backToBack.games, 0.2, 0.15)
    })

    it('a back-to-back adds 0.05 ±0.15 goals against', () => {
      within(
        backToBack.goalsAgainst / backToBack.games - normal.goalsAgainst / normal.games,
        0.05,
        0.15,
      )
    })

    it('loses 0.46 ±0.08 Players per Club per Fixture', () => {
      within(injuries / clubFixtures, 0.46, 0.08)
    })

    it('a back-to-back costs 4.7 pp ±3 pp of win rate', () => {
      within(
        (100 * normal.wins) / normal.games - (100 * backToBack.wins) / backToBack.games,
        4.7,
        3,
      )
    })

    it('does not saturate over a Season', () => {
      expect(wornOut / skaterMatches).toBeLessThan(WORN_OUT_SHARE)
    })
  })
}
