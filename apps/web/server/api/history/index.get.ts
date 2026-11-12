import { clubHistory } from '@ahm/sim'

/**
 * A Club's history over the career (ADR-025): its place and how far it went,
 * Season by Season, read from the records' own parts. The Manager's Club unless
 * another is asked for.
 */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { careerId, clubId, state } = await requireCareer(manager.id)
  const asked = getQuery(event).club
  const club = state.clubs.some((candidate) => candidate.id === asked) ? (asked as string) : clubId

  const stored = await loadOwnRecords(careerId)
  // Standings and playoffs are all a Club's history reads; the Players' part stays unread.
  const records = stored.map(({ record }) => joinRecord(record, []))
  return {
    clubId: club,
    mine: club === clubId,
    clubs: state.clubs
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    seasons: clubHistory(records, club).map((season) => {
      const record = records.find((candidate) => candidate.year === season.year)!
      return {
        year: season.year,
        gamesPlayed: season.row.gamesPlayed,
        wins: season.row.wins,
        losses: season.row.losses,
        otLosses: season.row.otLosses,
        points: season.row.points,
        divisionRank: season.divisionRank,
        leagueRank: season.leagueRank,
        playoffs: season.playoffs,
        champion: clubName(state, record.champion),
      }
    }),
  }
})
