import { savePercentage, points, type Lineup, type PlayerId } from '@ahm/sim'

/** Where a Player stands in the Lineup, for the Roster table. */
function placements(lineup: Lineup): ReadonlyMap<PlayerId, string> {
  const places = new Map<PlayerId, string>([
    [lineup.starter, 'G1'],
    [lineup.backup, 'G2'],
  ])
  lineup.lines.forEach((line, i) => {
    for (const id of [line.leftWing, line.centre, line.rightWing]) places.set(id, `L${i + 1}`)
  })
  lineup.pairings.forEach((pairing, i) => {
    for (const id of [pairing.leftDefence, pairing.rightDefence]) places.set(id, `P${i + 1}`)
  })
  return places
}

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId, state } = await requireSeason(manager.id)
  const club = state.clubs.find((candidate) => candidate.id === clubId)!
  const places = placements(state.lineups[clubId]!)
  const { skaters, goalies } = state.totals.regular

  return {
    clubName: club.name,
    skaters: club.skaters.map((skater) => {
      const stats = skaters[skater.id]
      return {
        id: skater.id,
        name: `${skater.firstName} ${skater.lastName}`,
        position: skater.preferredPositions[0],
        age: skater.age,
        place: places.get(skater.id) ?? null,
        attributes: skater.attributes,
        gamesPlayed: stats?.gamesPlayed ?? 0,
        goals: stats?.goals ?? 0,
        assists: stats?.assists ?? 0,
        points: stats ? points(stats) : 0,
        plusMinus: stats?.plusMinus ?? 0,
        iceSeconds: stats && stats.gamesPlayed > 0 ? stats.iceTimeSeconds / stats.gamesPlayed : 0,
        fatigue: Math.round(state.fatigue[skater.id] ?? 0),
        out: state.absent[skater.id] ?? 0,
      }
    }),
    goalies: club.goalies.map((goalie) => {
      const stats = goalies[goalie.id]
      return {
        id: goalie.id,
        name: `${goalie.firstName} ${goalie.lastName}`,
        age: goalie.age,
        place: places.get(goalie.id) ?? null,
        attributes: goalie.attributes,
        gamesPlayed: stats?.gamesPlayed ?? 0,
        savePercentage: stats && stats.shotsAgainst > 0 ? savePercentage(stats) : null,
        out: state.absent[goalie.id] ?? 0,
      }
    }),
  }
})
