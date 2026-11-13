import { describe, expect, it } from 'vitest'
import { targetIt, type Reported } from './reported.js'
import type { SeasonSample } from './simulations.js'

/**
 * Tier 1 aggregate rates (04-validation-targets.md): scoring from possession
 * resolution (#4) and special teams (#5). Measured NHL 2025-26 means.
 *
 * Pooled over eight Seasons of different generated leagues - 10,752
 * Fixtures, the spec's "10,000 Fixtures from fixed seeds". One league is not
 * enough: how good its goalies happen to be moves league scoring by more
 * than the band, and that is the talent model's variance, not the engine's.
 *
 * The three special-teams figures are linked - penalties times conversion is
 * power-play goals, and goals cutting power plays short is what brings 2.88
 * minors down to 285 seconds - so they are asserted together.
 */

const within = (value: number, target: number, band: number) => {
  expect(value).toBeGreaterThanOrEqual(target - band)
  expect(value).toBeLessThanOrEqual(target + band)
}

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

function standardDeviation(values: readonly number[]): number {
  const centre = mean(values)
  return Math.sqrt(values.reduce((sum, v) => sum + (v - centre) ** 2, 0) / (values.length - 1))
}

/**
 * The suite on the Seasons given: the first of eight leagues, or their tenth
 * (#90), where some targets are reported, not asserted.
 */
export function aggregateSuite(
  when: string,
  samples: () => Promise<readonly SeasonSample[]>,
  reported: Reported = {},
): void {
  const target = targetIt(reported)
  describe(`Tier 1 aggregate rates, ${when}`, async () => {
    const all = await samples()
    let fixtures = 0
    let goals = 0
    let shotsOnGoal = 0
    let shotsAgainst = 0
    let saves = 0
    let penalties = 0
    let powerPlayGoals = 0
    let powerPlaySeconds = 0
    let opportunities = 0
    let goalsAgainstShorthanded = 0
    let timesShorthanded = 0
    let faceoffWins = 0
    let faceoffsTaken = 0
    let homeWins = 0
    const penaltySpread: number[] = []
    const lowestPenalties: number[] = []
    const highestPenalties: number[] = []
    const homeWinSpread: number[] = []

    // Asked for together, so Seasons not yet cached are simulated side by side.
    for (const { matches, season } of all) {
      fixtures += matches.length
      for (const club of season.clubs.values()) {
        goals += club.goalsFor
        shotsOnGoal += club.shotsFor
        penalties += club.penalties
        powerPlayGoals += club.powerPlayGoals
        powerPlaySeconds += club.powerPlaySeconds
        opportunities += club.powerPlayOpportunities
        goalsAgainstShorthanded += club.powerPlayGoalsAgainst
        timesShorthanded += club.timesShorthanded
        faceoffWins += club.faceoffWins
        faceoffsTaken += club.faceoffsTaken
      }
      for (const goalie of season.goalies.values()) {
        shotsAgainst += goalie.shotsAgainst
        saves += goalie.saves
      }
      const penaltyRates = [...season.clubs.values()].map((c) => c.penalties / c.gamesPlayed)
      penaltySpread.push(standardDeviation(penaltyRates))
      lowestPenalties.push(Math.min(...penaltyRates))
      highestPenalties.push(Math.max(...penaltyRates))

      const atHome = new Map<string, { played: number; won: number }>()
      for (const { homeClubId, result } of matches) {
        const record = atHome.get(homeClubId) ?? { played: 0, won: 0 }
        record.played++
        if (result.winner === homeClubId) record.won++
        atHome.set(homeClubId, record)
      }
      homeWins += [...atHome.values()].reduce((sum, record) => sum + record.won, 0)
      homeWinSpread.push(
        standardDeviation([...atHome.values()].map((record) => (100 * record.won) / record.played)),
      )
    }
    const perClub = (total: number) => total / fixtures / 2

    it('goals per Fixture, both Clubs: 6.16 ±0.30', () => {
      within(goals / fixtures, 6.16, 0.3)
    })

    it('shots on goal per Club per Fixture: 27.8 ±2.0', () => {
      within(perClub(shotsOnGoal), 27.8, 2.0)
    })

    it('shooting percentage: 11.1% ±1.0 pp', () => {
      within((100 * goals) / shotsOnGoal, 11.1, 1.0)
    })

    it('league save percentage: 0.889 ±0.008', () => {
      within(saves / shotsAgainst, 0.889, 0.008)
    })

    target('penalties committed per Club per Fixture: 2.88 ±0.15', () => {
      within(perClub(penalties), 2.88, 0.15)
    })

    it('power-play goals per Club per Fixture: 0.61 ±0.06', () => {
      within(perClub(powerPlayGoals), 0.61, 0.06)
    })

    it('power-play time per Club per Fixture: 285 s ±20 s', () => {
      within(perClub(powerPlaySeconds), 285, 20)
    })

    it('power-play success: 21.1% ±2.5 pp', () => {
      within((100 * powerPlayGoals) / opportunities, 21.1, 2.5)
    })

    it('penalty-kill success: 78.9% ±2.5 pp', () => {
      within(100 * (1 - goalsAgainstShorthanded / timesShorthanded), 78.9, 2.5)
    })

    it('mean duration of one power play: 99 s ±8 s', () => {
      within(powerPlaySeconds / opportunities, 99, 8)
    })

    it('faceoff win rate, league-wide: 50.0% ±0.5 pp', () => {
      within((100 * faceoffWins) / faceoffsTaken, 50, 0.5)
    })

    it('home win rate: 50.5% ±1.5 pp', () => {
      within((100 * homeWins) / fixtures, 50.5, 1.5)
    })

    // The spreads are averaged over the Seasons: one Season's SD carries its own sampling noise.
    it('SD across Clubs of penalties per Fixture: 0.22 ±0.10', () => {
      within(mean(penaltySpread), 0.22, 0.1)
    })

    target('lowest Club penalties per Fixture: 2.40 ±0.15', () => {
      within(mean(lowestPenalties), 2.4, 0.15)
    })

    target('highest Club penalties per Fixture: 3.24 ±0.15', () => {
      within(mean(highestPenalties), 3.24, 0.15)
    })

    it('SD across Clubs of home win rate: 10.6 pp ±4 pp', () => {
      within(mean(homeWinSpread), 10.6, 4)
    })
  })
}
