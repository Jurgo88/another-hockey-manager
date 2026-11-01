const NOTICES_SHOWN = 100

interface NoticeRow {
  id: string
  day: number
  kind: string
  data: { playerId?: string; fixtures?: number }
  read: boolean
}

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await loadSeason(manager.id)
  if (!season) return []

  const { data, error } = await dataClient()
    .from('notices')
    .select('id, day, kind, data, read')
    .eq('season_id', season.id)
    .order('created_at', { ascending: false })
    .limit(NOTICES_SHOWN)
    .returns<NoticeRow[]>()
  if (error) throw createError({ statusCode: 500, message: error.message })

  const names = playerNames(season.state.clubs)
  return data.map(({ id, day, kind, data: details, read }) => ({
    id,
    day,
    kind,
    read,
    player: details.playerId ? (names.get(details.playerId) ?? details.playerId) : null,
    playerId: details.playerId ?? null,
    fixtures: details.fixtures ?? null,
  }))
})
