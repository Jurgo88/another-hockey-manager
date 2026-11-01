interface ResultRow {
  fixture_id: string
  home_goals: number
  away_goals: number
  decided_in: string
}

/** The Manager's Club through the Season: played, then still to come. */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { id, clubId, state } = await requireSeason(manager.id)

  const { data, error } = await dataClient()
    .from('fixture_results')
    .select('fixture_id, home_goals, away_goals, decided_in')
    .eq('season_id', id)
    .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
    .returns<ResultRow[]>()
  if (error) throw createError({ statusCode: 500, message: error.message })
  const results = new Map(data.map((row) => [row.fixture_id, row]))

  return state.fixtures
    .filter((fixture) => fixture.homeClubId === clubId || fixture.awayClubId === clubId)
    .map((fixture) => {
      const atHome = fixture.homeClubId === clubId
      const result = results.get(fixture.id)
      return {
        id: fixture.id,
        day: fixture.day,
        atHome,
        opponent: clubName(state, atHome ? fixture.awayClubId : fixture.homeClubId),
        result: result
          ? {
              goalsFor: atHome ? result.home_goals : result.away_goals,
              goalsAgainst: atHome ? result.away_goals : result.home_goals,
              decidedIn: result.decided_in,
            }
          : null,
      }
    })
})
