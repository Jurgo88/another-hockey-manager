import { endSeason, isSeasonOver, recordOf } from '@ahm/sim'

/** Closes a Season with its champion: keeps its record and opens the phase between Seasons (ADR-029). */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await requireSeason(manager.id)
  if (!isSeasonOver(season.state)) {
    throw createError({ statusCode: 409, message: 'errors.seasonNotOver' })
  }

  const offseason = endSeason(season.state)
  await saveEnded(season, recordOf(season.state), offseason)
  return { ok: true }
})
