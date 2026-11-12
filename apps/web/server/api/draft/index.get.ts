import { draftClock, type Offseason } from '@ahm/sim'

/** The draft room (ADR-028 amendment, FR-36): who is on the clock, the picks so far, and the class left. */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId, state: off } = await requireOffseason(manager.id)
  const clock = draftClock(off)
  const clubs = off.ended.clubs
  const code = (id: string) => clubs.find((club) => club.id === id)?.code ?? id
  const drafted = new Map(off.prospects.map((prospect) => [prospect.player.id, prospect.player]))

  return {
    year: off.year,
    made: off.phase === 'roster',
    clock: clock && { ...clock, club: code(clock.clubId), mine: clock.clubId === clubId },
    myPicks: myPicks(off, clubId),
    picks: off.picks.map((pick) => ({
      ...pick,
      club: code(pick.clubId),
      mine: pick.clubId === clubId,
      ...(drafted.has(pick.playerId) ? prospectView(drafted.get(pick.playerId)!) : {}),
    })),
    // By position group, since levels compare only within one, each in the
    // order of what is shown of them, never of what is hidden.
    available: byGroup(off.draftClass.map(prospectView)),
  }
})

/** The overall numbers of a Club's picks, round by round in the order of the first. */
function myPicks(off: Offseason, clubId: string): number[] {
  const at = off.order.indexOf(clubId)
  if (at < 0) return []
  return Array.from(
    { length: off.ended.draftFormat.rounds },
    (_, round) => round * off.order.length + at + 1,
  )
}
