import { points, savePercentage, type SeasonTotals, type SkaterStats } from '@ahm/sim'

const LEADERS = 20
/** Share of its Club's Fixtures a Goalie must have played to appear. */
const GOALIE_MIN_SHARE = 0.25

/** The scoring and goaltending leaders of a Season's counts, the current one or a past one. */
export function leaderBoards(
  totals: SeasonTotals,
  names: ReadonlyMap<string, string>,
  code: (clubId: string) => string,
) {
  const skaterRow = ([id, skater]: [string, SkaterStats]) => ({
    id,
    name: names.get(id) ?? id,
    club: code(skater.clubId),
    gamesPlayed: skater.gamesPlayed,
    goals: skater.goals,
    assists: skater.assists,
    points: points(skater),
    plusMinus: skater.plusMinus,
  })

  const skaters = Object.entries(totals.skaters).map(skaterRow)
  const mostPlayed = Math.max(0, ...Object.values(totals.goalies).map((g) => g.gamesPlayed))
  return {
    points: [...skaters].sort((a, b) => b.points - a.points).slice(0, LEADERS),
    goals: [...skaters].sort((a, b) => b.goals - a.goals).slice(0, LEADERS),
    goalies: Object.entries(totals.goalies)
      .filter(([, goalie]) => goalie.gamesPlayed >= mostPlayed * GOALIE_MIN_SHARE)
      .map(([id, goalie]) => ({
        id,
        name: names.get(id) ?? id,
        club: code(goalie.clubId),
        gamesPlayed: goalie.gamesPlayed,
        savePercentage: savePercentage(goalie),
      }))
      .sort((a, b) => b.savePercentage - a.savePercentage)
      .slice(0, LEADERS),
  }
}
