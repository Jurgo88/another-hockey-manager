import { describe, expect, it } from 'vitest'
import { simulateSeason } from '../../src/cli/season.js'

/**
 * The cost of a congested schedule (FR-14, ADR-010, 04-validation-targets.md),
 * measured against NHL 2025-26 rest gaps and pooled over eight Seasons.
 *
 * Each figure compares a back-to-back with a normal two-day gap, and already
 * includes the Goalie rotation a back-to-back brings on (ADR-011).
 */

const SEASON_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]
const CLUBS = 32
const FATIGUE_CEILING = 100

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

describe('rest between Fixtures', async () => {
  const rest = new Map<number, Rest>()
  let gaps = 0
  let highestFatigue = 0

  for (const seed of SEASON_SEEDS) {
    const { fixtures, matches } = await simulateSeason(seed)
    const lastDay = new Map<string, number>()

    fixtures.forEach((fixture, i) => {
      const { result, fatigue } = matches[i]!
      highestFatigue = Math.max(highestFatigue, ...fatigue.values())

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
    within(backToBack.games / SEASON_SEEDS.length / CLUBS, 13.7, 1.5)
  })

  it('never plays three days running', () => {
    expect([...rest.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it('a back-to-back costs 0.20 ±0.15 goals for', () => {
    within(normal.goalsFor / normal.games - backToBack.goalsFor / backToBack.games, 0.2, 0.15)
  })

  it('a back-to-back adds 0.05 ±0.15 goals against', () => {
    within(
      backToBack.goalsAgainst / backToBack.games - normal.goalsAgainst / normal.games,
      0.05,
      0.15,
    )
  })

  it('a back-to-back costs 4.7 pp ±3 pp of win rate', () => {
    within((100 * normal.wins) / normal.games - (100 * backToBack.wins) / backToBack.games, 4.7, 3)
  })

  it('does not saturate over a Season', () => {
    expect(highestFatigue).toBeLessThan(FATIGUE_CEILING)
  })
})
