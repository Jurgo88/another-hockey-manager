export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await loadSeason(manager.id)
  return season && seasonSummary(season)
})
