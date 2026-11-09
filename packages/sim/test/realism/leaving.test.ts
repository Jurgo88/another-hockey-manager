import { describe, expect, it } from 'vitest'
import { simulateSeason } from '../../src/cli/season.js'
import { isGoalie, type Player } from '../../src/domain/player.js'
import { leavingChance, positionGroup, roles } from '../../src/leave/index.js'

/**
 * Leaving the league (ADR-023, ADR-027, #88), against the Phase 2 targets in
 * `04-validation-targets.md`: of the Players with 20 or more Fixtures in a
 * Season, the share who are gone the next, by age and by ice-time third in
 * their position group, as `07-league-over-time.md` measured them.
 *
 * The share is the mean chance of leaving, not a count of draws, so the test
 * measures the rule without the noise of one Season's luck. The three leagues
 * are pooled, as the measurement pools ten seasons.
 */

const SEASON_SEEDS = [1, 2, 3]

const AGE_BANDS = [
  { from: 0, to: 23, rate: 0.044, band: 0.03 },
  { from: 24, to: 27, rate: 0.073, band: 0.03 },
  { from: 28, to: 30, rate: 0.074, band: 0.03 },
  { from: 31, to: 33, rate: 0.13, band: 0.04 },
  { from: 34, to: 36, rate: 0.23, band: 0.06 },
  { from: 37, to: 99, rate: 0.43, band: 0.12 },
]

const THIRDS = [
  { rate: 0.013, band: 0.02 },
  { rate: 0.053, band: 0.03 },
  { rate: 0.201, band: 0.06 },
]

interface Row {
  age: number
  third: number
  chance: number
}

describe('leaving the league', async () => {
  const rows: Row[] = (
    await Promise.all(
      SEASON_SEEDS.map(async (seed) => {
        const { clubs, season } = await simulateSeason(seed)
        const usage = (player: Player) => {
          const skater = season.skaters.get(player.id)
          const fixtures = (skater ?? season.goalies.get(player.id))?.gamesPlayed ?? 0
          const secondsPerFixture = skater && fixtures > 0 ? skater.iceTimeSeconds / fixtures : 0
          return { fixtures, secondsPerFixture, injured: false }
        }
        const roleOf = roles(clubs, usage)
        const played = clubs
          .flatMap((club) => [...club.skaters, ...club.goalies])
          .filter((player) => usage(player).fixtures >= 20)

        return (['forward', 'defence', 'goalie'] as const).flatMap((group) => {
          const ranked = played
            .filter((player) => positionGroup(player) === group)
            .map((player) => {
              const { fixtures, secondsPerFixture } = usage(player)
              return { player, score: isGoalie(player) ? fixtures : secondsPerFixture }
            })
            .sort((a, b) => b.score - a.score)
          return ranked.map(({ player }, rank) => {
            return {
              age: player.age,
              third: Math.min(2, Math.floor((rank / ranked.length) * 3)),
              chance: leavingChance(player.age, roleOf.get(player.id)!),
            }
          })
        })
      }),
    )
  ).flat()

  const meanChance = (members: readonly Row[]) =>
    members.reduce((sum, row) => sum + row.chance, 0) / members.length

  it.each(AGE_BANDS)('matches the measured rate for ages $from-$to', ({ from, to, rate, band }) => {
    const members = rows.filter((row) => row.age >= from && row.age <= to)
    expect(members.length).toBeGreaterThan(10)
    expect(Math.abs(meanChance(members) - rate)).toBeLessThanOrEqual(band)
  })

  it.each(THIRDS.map((target, third) => ({ ...target, third })))(
    'matches the measured rate for ice-time third $third',
    ({ third, rate, band }) => {
      const members = rows.filter((row) => row.third === third)
      expect(Math.abs(meanChance(members) - rate)).toBeLessThanOrEqual(band)
    },
  )
})
