import { draftNoticesOf, runDraft, startNextSeason, startNoticesOf } from '@ahm/sim'

/**
 * Starts the next Season of the career (ADR-029). Whatever the Manager left
 * undeclared, the draft or his moves, the assistant decides, for every Club
 * alike (ADR-028, D-04).
 */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await requireOffseason(manager.id)
  const off = season.state
  const state = startNextSeason(off)
  const notices = [
    // A draft the Manager never opened is made now, and told now.
    ...(off.phase === 'draft' ? draftNoticesOf(runDraft(off), season.clubId) : []),
    ...startNoticesOf(off, state, season.clubId),
  ]
  await saveNext(season, state, notices)
  return { ok: true }
})
