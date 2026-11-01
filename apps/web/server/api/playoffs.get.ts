import type { PlayoffSeed } from '@ahm/sim'
import { seriesWinner } from '@ahm/sim'

export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId, state } = await requireSeason(manager.id)
  const { playoffs } = state
  if (!playoffs) return null

  const side = (seed: PlayoffSeed, wins: number, winner: PlayoffSeed | null) => ({
    clubId: seed.clubId,
    name: clubName(state, seed.clubId),
    points: seed.points,
    wins,
    won: winner?.clubId === seed.clubId,
    mine: seed.clubId === clubId,
  })

  return {
    champion: playoffs.champion ? clubName(state, playoffs.champion) : null,
    rounds: playoffs.bracket.rounds.map((round) => ({
      round: round.round,
      series: round.series.map((series) => {
        const wins = playoffs.wins[series.id] ?? { higher: 0, lower: 0 }
        const winner = seriesWinner(playoffs, series)
        return {
          id: series.id,
          higher: side(series.higherSeed, wins.higher, winner),
          lower: side(series.lowerSeed, wins.lower, winner),
        }
      }),
    })),
  }
})
