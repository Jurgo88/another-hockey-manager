import { draftNoticesOf, runDraft } from '@ahm/sim'

/** Leaves the rest of the draft to the assistant, the Manager's picks too (ADR-028). */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await requireOffseason(manager.id)
  if (season.state.phase !== 'draft') {
    throw createError({ statusCode: 409, message: 'errors.draftMade' })
  }
  const off = runDraft(season.state)
  await saveOffseason(season, off, draftNoticesOf(off, season.clubId))
  return { ok: true }
})
