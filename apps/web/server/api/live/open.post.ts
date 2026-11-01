import { openFixture, playsNext } from '@ahm/sim'

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await requireSeason(manager.id)
  const { clubId, state } = season
  if (liveFixture(state, clubId)) return { ok: true }
  if (!playsNext(state, clubId)) throw createError({ statusCode: 409, message: 'errors.noFixture' })

  const day = state.fixtures[state.nextFixture]!.day
  const fixture = state.fixtures
    .slice(state.nextFixture)
    .find(
      (candidate) =>
        candidate.day === day &&
        (candidate.homeClubId === clubId || candidate.awayClubId === clubId),
    )!
  await saveState(season, openFixture(state, fixture.id))
  return { ok: true }
})
