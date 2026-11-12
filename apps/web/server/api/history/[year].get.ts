import { divisionTables } from '@ahm/sim'

/** A finished Season of the career: its final table, its leaders and its draft (ADR-025). */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { careerId, clubId, state } = await requireCareer(manager.id)
  const year = Number(getRouterParam(event, 'year'))
  const record = Number.isInteger(year) ? await loadRecord(careerId, year) : null
  if (!record) throw createError({ statusCode: 404, message: 'errors.noHistory' })

  const { regular, playoffs } = record.totals
  const names = await loadNames(careerId, [
    ...Object.keys(regular.skaters),
    ...Object.keys(regular.goalies),
    ...Object.keys(playoffs.skaters),
    ...Object.keys(playoffs.goalies),
    ...record.draft.map((pick) => pick.playerId),
  ])
  const code = (id: string) => state.clubs.find((club) => club.id === id)?.code ?? id
  const tables = divisionTables(record.standings)

  return {
    year: record.year,
    champion: clubName(state, record.champion),
    divisions: state.structure.divisions.map((division) => ({
      id: division.id,
      name: division.name,
      rows: (tables.get(division.id) ?? []).map((row) => ({
        clubId: row.clubId,
        name: clubName(state, row.clubId),
        mine: row.clubId === clubId,
        gamesPlayed: row.gamesPlayed,
        wins: row.wins,
        losses: row.losses,
        otLosses: row.otLosses,
        points: row.points,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
      })),
    })),
    leaders: {
      regular: leaderBoards(regular, names, code),
      playoffs: leaderBoards(playoffs, names, code),
    },
    draft: record.draft.map((pick) => ({
      ...pick,
      club: code(pick.clubId),
      mine: pick.clubId === clubId,
      name: names.get(pick.playerId) ?? pick.playerId,
    })),
  }
})
