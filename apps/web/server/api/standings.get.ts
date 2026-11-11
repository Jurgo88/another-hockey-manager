import { divisionTables } from '@ahm/sim'

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId, state } = await readSeason(manager.id)

  const tables = divisionTables(state.standings)
  return state.structure.divisions.map((division) => ({
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
  }))
})
