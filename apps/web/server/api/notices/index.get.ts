import { displayName } from '@ahm/sim'

const NOTICES_SHOWN = 100

interface NoticeRow {
  id: string
  day: number
  kind: string
  data: {
    playerId?: string
    days?: number
    fixtures?: number
    round?: number
    pick?: number
    years?: number
  }
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

  const names = new Map(
    playerNames(season.phase === 'season' ? season.state.clubs : season.state.ended.clubs),
  )
  // Between Seasons the drafted are prospects, held by the Offseason alone until the next Season.
  if (season.phase === 'offseason') {
    for (const { player } of season.state.prospects) names.set(player.id, displayName(player))
  }
  // Those who left the league, or are only prospects, are named from the career's Players (ADR-029).
  const unknown = [
    ...new Set(data.flatMap((row) => row.data.playerId ?? []).filter((id) => !names.has(id))),
  ]
  if (unknown.length > 0) {
    const players = await dataClient()
      .from('players')
      .select('player_id, first_name, last_name')
      .eq('career_id', season.careerId)
      .in('player_id', unknown)
      .returns<{ player_id: string; first_name: string; last_name: string }[]>()
    if (players.error) throw createError({ statusCode: 500, message: players.error.message })
    for (const row of players.data) names.set(row.player_id, `${row.first_name} ${row.last_name}`)
  }

  return data.map(({ id, day, kind, data: details, read }) => ({
    id,
    day,
    kind,
    read,
    player: details.playerId ? (names.get(details.playerId) ?? details.playerId) : null,
    playerId: details.playerId ?? null,
    round: details.round ?? null,
    pick: details.pick ?? null,
    years: details.years ?? null,
    ...injuryLength(details),
  }))
})
