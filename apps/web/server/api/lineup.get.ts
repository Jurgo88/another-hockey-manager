import { displayName, fatigueBeforeNext, isFollowed } from '@ahm/sim'
import type { LineupPage } from '~~/shared/types/lineup'

export default defineEventHandler(async (event): Promise<LineupPage> => {
  const manager = await requireManager(event)
  const { clubId, state } = await requireSeason(manager.id)
  const club = state.clubs.find((candidate) => candidate.id === clubId)!
  const fatigue = fatigueBeforeNext(state, clubId)

  return {
    lineup: state.lineups[clubId]!,
    locked: isFollowed(state, clubId),
    players: [
      ...club.skaters.map((skater) => ({
        id: skater.id,
        name: displayName(skater),
        positions: skater.preferredPositions,
        out: state.absent[skater.id] ?? 0,
        fatigue: fatigue[skater.id] ?? 0,
      })),
      ...club.goalies.map((goalie) => ({
        id: goalie.id,
        name: displayName(goalie),
        positions: ['G'],
        out: state.absent[goalie.id] ?? 0,
      })),
    ],
  }
})
