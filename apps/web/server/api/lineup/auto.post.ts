import { replaceInjured, type Lineup } from '@ahm/sim'

/** A proposal for the screen: nothing is saved until the Manager saves it. */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId, state } = await requireSeason(manager.id)
  const lineup = await readBody<Lineup>(event)

  try {
    return { lineup: replaceInjured(state, clubId, { ...lineup, clubId }) }
  } catch (error) {
    // A body shaped like no Lineup fails on the way through.
    if (error instanceof TypeError) {
      throw createError({ statusCode: 400, message: 'errors.invalidLineup' })
    }
    throw error
  }
})
