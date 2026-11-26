import { describe, expect } from 'vitest'
import { movement, type Movement } from '../../src/stats/league.js'
import { targetIt } from '../support/reported.js'
import { longRuns } from '../support/simulations.js'

/**
 * Players move as in the real league (Phase 3 gate, 04-validation-targets.md):
 * trades (ADR-033) and claims off waivers over the eight generated runs, ten
 * Seasons each, pooled. The author chose on 2026-11-26 to report them from
 * trades (#138) and assert them at the Phase 3 gate, once scouting and budgets
 * move them too.
 */

const GATE = 'reported until the Phase 3 gate, with scouting and budgets (#138)'

const REPORTED = {
  'Players with 20 or more Fixtures who play for another Club the next Season: 19.9% ±5 pp': GATE,
  'Players with 20 or more Fixtures who play for more than one Club in a Season: 9.6% ±3 pp': GATE,
  'moves during a Season in the 14 days before the deadline: 48.5% ±15 pp': GATE,
  "a Club's Skater ice time played by Skaters who played for it the Season before: 77.1% ±8 pp":
    GATE,
}

describe('movement over ten Seasons, eight generated runs', async () => {
  const runs = await longRuns()
  const each = runs.map((run) => movement(run.seasons))
  const pooled = (key: keyof Movement) => each.reduce((sum, m) => sum + m[key], 0) / each.length
  const target = targetIt(REPORTED)
  console.log(
    `movement: ${JSON.stringify(
      Object.fromEntries(
        (Object.keys(each[0]!) as (keyof Movement)[]).map((k) => [k, +pooled(k).toFixed(3)]),
      ),
    )}`,
  )

  target(
    'Players with 20 or more Fixtures who play for another Club the next Season: 19.9% ±5 pp',
    () => {
      expect(pooled('anotherClubNextSeason')).toBeGreaterThanOrEqual(0.149)
      expect(pooled('anotherClubNextSeason')).toBeLessThanOrEqual(0.249)
    },
  )
  target(
    'Players with 20 or more Fixtures who play for more than one Club in a Season: 9.6% ±3 pp',
    () => {
      expect(pooled('moreThanOneClub')).toBeGreaterThanOrEqual(0.066)
      expect(pooled('moreThanOneClub')).toBeLessThanOrEqual(0.126)
    },
  )
  target('moves during a Season in the 14 days before the deadline: 48.5% ±15 pp', () => {
    expect(pooled('nearDeadline')).toBeGreaterThanOrEqual(0.335)
    expect(pooled('nearDeadline')).toBeLessThanOrEqual(0.635)
  })
  target(
    "a Club's Skater ice time played by Skaters who played for it the Season before: 77.1% ±8 pp",
    () => {
      expect(pooled('continuity')).toBeGreaterThanOrEqual(0.691)
      expect(pooled('continuity')).toBeLessThanOrEqual(0.851)
    },
  )
})
