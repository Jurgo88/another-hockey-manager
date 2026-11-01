import {
  continueFixture,
  fixtureSoFar,
  InvalidLineupError,
  type Lineup,
  type SeasonState,
} from '@ahm/sim'

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await requireSeason(manager.id)
  const { clubId, state } = season
  const fixture = liveFixture(state, clubId)
  if (!fixture) throw createError({ statusCode: 409, message: 'errors.notFollowing' })
  if (fixtureSoFar(state, fixture.id).phase === 'ended') {
    throw createError({ statusCode: 409, message: 'errors.fixtureOver' })
  }

  const { lineup, toBreak } = await readBody<{ lineup?: Lineup; toBreak?: boolean }>(event)
  const chosen = lineup ? [{ clubId, lineup: { ...lineup, clubId } }] : []

  let next: SeasonState
  try {
    next = continueFixture(state, fixture.id, chosen)
    while (toBreak && fixtureSoFar(next, fixture.id).phase === 'running') {
      next = continueFixture(next, fixture.id)
    }
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

  await saveLive(season, next.live)
  return liveView(next, clubId, fixture)
})
