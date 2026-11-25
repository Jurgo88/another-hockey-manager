import { describe, expect, it } from 'vitest'
import { points } from '../../src/stats/match.js'
import { foldSeason } from '../../src/stats/season.js'
import { cachedSeason, PLAY_FARM } from '../support/simulations.js'

/**
 * The farm's own Season (ADR-036, #135), in the `farm` tier beside the realism
 * suites on the same Seasons. The affiliates' league has no measured target:
 * the engine is fitted to the NHL and the AHL is not measured, so what it
 * produces is printed, not asserted, but that every Fixture is played and
 * folded.
 */

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

describe.runIf(PLAY_FARM)("the affiliates' Season, eight first Seasons", async () => {
  const seasons = await Promise.all(SEEDS.map(cachedSeason))

  it('plays every affiliate 72 Fixtures', () => {
    for (const { farm } of seasons) {
      expect(farm).toBeDefined()
      expect(farm!.matches).toHaveLength((32 * 72) / 2)
    }
  })

  it('reports what the affiliates produce', () => {
    const matches = seasons.flatMap((s) => s.farm!.matches)
    const goals = matches.reduce((sum, m) => sum + m.result.homeGoals + m.result.awayGoals, 0)
    const contracted = new Set(
      seasons
        .flatMap((s) =>
          s.farm!.clubs.flatMap((c) => [...c.skaters, ...c.goalies].filter((p) => p.contract)),
        )
        .map((p) => p.id),
    )
    let contractedSeconds = 0
    let allSeconds = 0
    const leaders: number[] = []
    for (const { farm } of seasons) {
      const season = foldSeason(farm!.matches)
      const lines = [...season.skaters.entries()]
      for (const [id, line] of lines) {
        allSeconds += line.iceTimeSeconds
        if (contracted.has(id)) contractedSeconds += line.iceTimeSeconds
      }
      leaders.push(Math.max(...lines.map(([, line]) => points(line))))
    }
    const report = {
      goalsPerClubFixture: +(goals / matches.length / 2).toFixed(2),
      leadingScorerPoints: +(leaders.reduce((a, b) => a + b, 0) / leaders.length).toFixed(1),
      iceTimeShareUnderNhlContract: +(contractedSeconds / allSeconds).toFixed(3),
    }
    console.log(`farm, reported: ${JSON.stringify(report)}`)
    expect(goals).toBeGreaterThan(0)
  })
})
