export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await loadSeason(manager.id)
  if (!season) return { count: 0 }

  const { count, error } = await dataClient()
    .from('notices')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', season.id)
    .eq('read', false)
  if (error) throw createError({ statusCode: 500, message: error.message })
  return { count: count ?? 0 }
})
