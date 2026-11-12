import { isReady, proposedMoves, rosterGaps } from '@ahm/sim'

/**
 * The Roster window (ADR-028, FR-37): the Club as it stands after the Season,
 * its prospects, the positions it must fill, the assistant's moves and the
 * Manager's own, if he declared any.
 */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId, rosterSource, state: off } = await requireOffseason(manager.id)
  if (off.phase !== 'roster') throw createError({ statusCode: 409, message: 'errors.draftFirst' })
  const club = off.clubs.find((candidate) => candidate.id === clubId)!
  const byConfidence = rosterSource === 'file'

  return {
    year: off.year,
    roster: [...club.skaters, ...club.goalies].map((player) => rosterView(player, byConfidence)),
    // Grouped, since levels compare only within a position group (ADR-028).
    prospects: Object.values(
      byGroup(
        off.prospects
          .filter((prospect) => prospect.player.clubId === clubId)
          .map((prospect) => ({
            ...prospectView(prospect.player),
            draftYear: prospect.year,
            round: prospect.round,
            ready: isReady(club, prospect.player),
          })),
      ),
    ).flat(),
    gaps: rosterGaps(off, clubId),
    proposal: proposedMoves(off, clubId),
    declared: off.moves[clubId] ?? null,
  }
})
