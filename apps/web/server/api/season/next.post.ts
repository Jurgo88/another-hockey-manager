import { startNextSeason } from '@ahm/sim'

/**
 * Starts the next Season of the career (ADR-029). Until the draft and Roster
 * windows reach the application (item 10), every pick and every move is the
 * assistant's, for every Club alike (D-04).
 */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const offseason = await requireOffseason(manager.id)
  await saveNext(offseason, startNextSeason(offseason.state))
  return { ok: true }
})
