import { advanceDay, advanceToFixtureOf, isSeasonOver } from '@ahm/sim'

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { mode } = await readBody<Record<string, unknown>>(event)
  if (mode !== 'day' && mode !== 'fixture') {
    throw createError({ statusCode: 400, message: 'errors.unknownAdvance' })
  }

  const season = await requireSeason(manager.id)
  if (isSeasonOver(season.state)) return seasonSummary(season)

  const days =
    mode === 'day' ? [advanceDay(season.state)] : advanceToFixtureOf(season.state, season.clubId)
  const state = await saveDays(season, days)
  return seasonSummary({ ...season, state })
})
