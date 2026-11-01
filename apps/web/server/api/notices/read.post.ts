export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await loadSeason(manager.id)
  if (!season) return { ok: true }

  const { error } = await dataClient()
    .from('notices')
    .update({ read: true })
    .eq('season_id', season.id)
    .eq('read', false)
  if (error) throw createError({ statusCode: 500, message: error.message })
  return { ok: true }
})
