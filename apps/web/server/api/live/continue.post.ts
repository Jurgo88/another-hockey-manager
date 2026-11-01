import { continueFixture, InvalidLineupError, type Lineup } from '@ahm/sim'

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await requireSeason(manager.id)
  const { clubId, state } = season
  const fixture = liveFixture(state, clubId)
  if (!fixture) throw createError({ statusCode: 409, message: 'errors.notFollowing' })

  const { lineup } = await readBody<{ lineup?: Lineup }>(event)
  const chosen = lineup ? [{ clubId, lineup: { ...lineup, clubId } }] : []
  try {
    await saveState(season, continueFixture(state, fixture.id, chosen))
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
