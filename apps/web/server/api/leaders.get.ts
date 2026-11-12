export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { state } = await readSeason(manager.id)
  const names = playerNames(state.clubs)
  const code = (clubId: string) => state.clubs.find((club) => club.id === clubId)?.code ?? clubId

  return {
    regular: leaderBoards(state.totals.regular, names, code),
    playoffs: leaderBoards(state.totals.playoffs, names, code),
  }
})
