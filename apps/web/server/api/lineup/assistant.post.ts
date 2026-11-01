import { assistantLineup, type Tactics } from '@ahm/sim'

/** A proposal for the screen: nothing is saved until the Manager saves it. */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId, state } = await requireSeason(manager.id)
  const { tactics } = await readBody<{ tactics?: Tactics }>(event)
  if (!tactics) throw createError({ statusCode: 400, message: 'errors.invalidLineup' })

  return { lineup: assistantLineup(state, clubId, tactics) }
})
