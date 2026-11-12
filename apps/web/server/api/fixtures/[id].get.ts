import {
  points,
  savePercentage,
  type MatchEvent,
  type PlainMatchStats,
  type SkaterStats,
} from '@ahm/sim'

interface BoxRow {
  stats: PlainMatchStats
  events: readonly MatchEvent[] | null
}

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { id, state } = await readSeason(manager.id)

  const { data, error } = await dataClient()
    .from('fixture_results')
    .select('stats, events')
    .eq('season_id', id)
    .eq('fixture_id', getRouterParam(event, 'id') ?? '')
    .maybeSingle<BoxRow>()
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!data) throw createError({ statusCode: 404, message: 'errors.noFixture' })

  const { stats, events } = data
  const names = playerNames(state.clubs)
  const name = (playerId: string) => names.get(playerId) ?? playerId
  const side = (clubId: string) => {
    const club = stats.clubs[clubId]!
    return {
      name: clubName(state, clubId),
      shots: club.shotsFor,
      skaters: Object.entries(stats.skaters)
        .filter(([, skater]) => skater.clubId === clubId)
        .map(([playerId, skater]: [string, SkaterStats]) => ({
          id: playerId,
          name: name(playerId),
          goals: skater.goals,
          assists: skater.assists,
          points: points(skater),
          plusMinus: skater.plusMinus,
          shots: skater.shotsOnGoal,
          seconds: skater.iceTimeSeconds,
        }))
        .sort((a, b) => b.points - a.points || b.seconds - a.seconds),
      goalies: Object.entries(stats.goalies)
        .filter(([, goalie]) => goalie.clubId === clubId)
        .map(([playerId, goalie]) => ({
          id: playerId,
          name: name(playerId),
          saves: goalie.saves,
          shotsAgainst: goalie.shotsAgainst,
          savePercentage: savePercentage(goalie),
        })),
    }
  }

  return {
    result: stats.result,
    periods: stats.periods,
    home: side(stats.homeClubId),
    away: side(stats.awayClubId),
    scoring: stats.scoring.map((play) => ({
      period: play.period,
      clock: play.clock,
      club: clubName(state, play.clubId),
      scorer: name(play.scorer),
      assists: play.assists.map(name),
      strength: play.strength,
      emptyNet: play.emptyNet,
      homeGoals: play.homeGoals,
      awayGoals: play.awayGoals,
    })),
    injuries: stats.injuries.map((injury) => ({
      player: name(injury.playerId),
      ...injuryLength(injury),
    })),
    plays: events ? playByPlay(events, state.clubs) : null,
  }
})
