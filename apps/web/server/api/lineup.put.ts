import { InvalidLineupError, isFollowed, setLineup, type Lineup } from '@ahm/sim'

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await requireSeason(manager.id)
  const { clubId, state } = season
  if (isFollowed(state, clubId)) {
    throw createError({ statusCode: 409, message: 'errors.fixtureFollowed' })
  }

  const lineup = await readBody<Lineup>(event)
  try {
    await saveState(season, setLineup(state, clubId, { ...lineup, clubId }))
  } catch (error) {
    if (error instanceof InvalidLineupError) {
      throw createError({
        statusCode: 422,
        message: 'errors.invalidLineup',
        data: error.violations,
      })
    }
    // A body shaped like no Lineup fails inside validation.
    if (error instanceof TypeError) {
      throw createError({ statusCode: 400, message: 'errors.invalidLineup' })
    }
    throw error
  }
  return { ok: true }
})
