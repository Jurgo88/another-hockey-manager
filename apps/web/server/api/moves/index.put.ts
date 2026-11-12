import { InvalidMovesError, setRosterMoves } from '@ahm/sim'

/** The Manager's own call-ups and releases, in place of the assistant's (ADR-028, FR-37). */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await requireOffseason(manager.id)
  if (season.state.phase !== 'roster') {
    throw createError({ statusCode: 409, message: 'errors.draftFirst' })
  }
  const { callUps, releases } = await readBody<Record<string, unknown>>(event)
  const ids = (value: unknown) =>
    Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : null
  const moves = { callUps: ids(callUps), releases: ids(releases) }
  if (!moves.callUps || !moves.releases) {
    throw createError({ statusCode: 400, message: 'errors.invalidMoves' })
  }

  try {
    const off = setRosterMoves(season.state, season.clubId, {
      callUps: moves.callUps,
      releases: moves.releases,
    })
    await saveOffseason(season, off)
  } catch (error) {
    if (error instanceof InvalidMovesError) {
      throw createError({
        statusCode: 422,
        message: 'errors.invalidMoves',
        data: error.violations,
      })
    }
    throw error
  }
  return { ok: true }
})
