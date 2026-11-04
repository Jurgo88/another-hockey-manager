import { beforeAll, describe, expect, it } from 'vitest'
import { renderCareer, renderClubHistory } from '../src/cli/format.js'
import { leadingScorer, simulateSeasons, type SimulatedRun } from '../src/cli/season.js'
import {
  careerTotals,
  clubHistory,
  goalieCareer,
  skaterCareer,
  type PlayoffResult,
} from '../src/stats/history.js'
import { points } from '../src/stats/match.js'

/** Season history and Player careers, read from the records of a run (#86). */

describe('Season history and careers', () => {
  let run: SimulatedRun

  beforeAll(async () => {
    run = await simulateSeasons(4, 2)
  })

  it('keeps one record for each Season, in order', () => {
    expect(run.seasons.map((season) => [season.year, season.seasonId])).toEqual([
      [1, 's4'],
      [2, 's4-y2'],
    ])
  })

  it('gives each Club one line a Season, with its places and how far it went', () => {
    const lines = run.clubs.map((club) => clubHistory(run.seasons, club.id))
    for (const history of lines) expect(history.map((line) => line.year)).toEqual([1, 2])

    for (const [i, season] of run.seasons.entries()) {
      const ofSeason = lines.map((history) => history[i]!)
      expect(ofSeason.map((line) => line.leagueRank).sort((a, b) => a - b)).toEqual(
        run.clubs.map((_, rank) => rank + 1),
      )
      expect(ofSeason.every((line) => line.divisionRank >= 1 && line.divisionRank <= 8)).toBe(true)

      const results = ofSeason.map((line) => line.playoffs)
      const count = (test: (result: PlayoffResult) => boolean) => results.filter(test).length
      expect(count((r) => r.kind === 'missed')).toBe(16)
      expect(count((r) => r.kind === 'champion')).toBe(1)
      // 16 Clubs in, halved each round: 8 lose in the first, 4, 2, and one in the final.
      for (const [round, losers] of [
        [1, 8],
        [2, 4],
        [3, 2],
        [4, 1],
      ] as const) {
        expect(count((r) => r.kind === 'lost' && r.round === round)).toBe(losers)
      }
      const champion = ofSeason.find((line) => line.playoffs.kind === 'champion')!
      expect(champion.row.clubId).toBe(season.champion)
    }
  })

  it('gives a Player one line for each Season they played, summing to their career', () => {
    const id = leadingScorer(run)
    const career = skaterCareer(run.seasons, id)
    expect(career.map((line) => line.regular)).toEqual(
      run.seasons.map((season) => season.totals.regular.skaters[id]),
    )
    const total = careerTotals(career).regular!
    expect(points(total)).toBe(career.reduce((sum, line) => sum + points(line.regular!), 0))
    expect(total.gamesPlayed).toBe(career.reduce((sum, line) => sum + line.regular!.gamesPlayed, 0))
  })

  it('has no line for a Season in which a Player did not play', () => {
    const played = new Set(
      run.seasons.flatMap((season) => Object.keys(season.totals.regular.goalies)),
    )
    const idle = run.clubs.flatMap((club) => club.goalies).find((goalie) => !played.has(goalie.id))
    if (idle) expect(goalieCareer(run.seasons, idle.id)).toEqual([])
    expect(skaterCareer(run.seasons, 'nobody')).toEqual([])
    expect(careerTotals([])).toEqual({ regular: null, playoffs: null })
  })

  it('prints a Club history and a career', () => {
    const club = run.clubs[0]!
    const history = renderClubHistory(run, club.id)
    expect(history).toContain(club.name)
    expect(history.split('\n').length).toBeGreaterThanOrEqual(4)

    const id = leadingScorer(run)
    const player = run.players.get(id)!
    const career = renderCareer(run, id)
    expect(career).toContain(player.lastName)
    expect(career).toContain('Total')

    const goalie = run.clubs[0]!.goalies[0]!
    expect(renderCareer(run, goalie.id)).toContain('SV%')
  })
})
