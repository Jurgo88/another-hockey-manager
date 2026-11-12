import { draftNoticesOf, reSigningNoticesOf, runDraft, runReSigning } from '@ahm/sim'

/**
 * Leaves the rest of the draft to the assistant, the Manager's picks too
 * (ADR-028), and then the re-signings, until the web has a window for them (#127).
 */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await requireOffseason(manager.id)
  if (season.state.phase !== 'draft') {
    throw createError({ statusCode: 409, message: 'errors.draftMade' })
  }
  const off = runReSigning(runDraft(season.state))
  await saveOffseason(season, off, [
    ...draftNoticesOf(off, season.clubId),
    ...reSigningNoticesOf(off, season.clubId),
  ])
  return { ok: true }
})
