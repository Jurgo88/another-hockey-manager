import { draftClock, draftNoticesOf, draftUntil, makePick, runDraft } from '@ahm/sim'

/**
 * A pick in the draft room (ADR-028 amendment, FR-36). With a prospect, the
 * Manager's pick is made; then the draft runs on to his next pick. Once he has
 * no pick left, the rest is made and the Roster window opens.
 */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const season = await requireOffseason(manager.id)
  const { playerId } = await readBody<Record<string, unknown>>(event)
  let off = season.state
  if (off.phase !== 'draft') throw createError({ statusCode: 409, message: 'errors.draftMade' })

  if (playerId !== undefined) {
    if (typeof playerId !== 'string') {
      throw createError({ statusCode: 400, message: 'errors.notInClass' })
    }
    try {
      off = makePick(off, season.clubId, playerId)
    } catch {
      throw createError({ statusCode: 409, message: 'errors.notYourPick' })
    }
  }
  off = draftUntil(off, season.clubId)
  const done = draftClock(off) === null
  if (done) off = runDraft(off)
  await saveOffseason(season, off, done ? draftNoticesOf(off, season.clubId) : [])
  return { ok: true }
})
