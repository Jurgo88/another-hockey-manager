import { displayName, fixtureSoFar } from '@ahm/sim'

/** Only what `fixtureSoFar` returned may leave this route (ADR-016). */
export default defineEventHandler(async (event) => {
  const manager = await requireManager(event)
  const { clubId, state } = await requireSeason(manager.id)
  const fixture = liveFixture(state, clubId)
  if (!fixture) return null

  const { events, lineups } = fixtureSoFar(state, fixture.id)
  const { throughPeriod } = state.live[fixture.id]!
  const score = tally(events, fixture)
  const level = score.homeGoals === score.awayGoals
  const ended = throughPeriod === null || (throughPeriod === 3 && !level)

  const lineup = lineups[clubId]!
  const club = state.clubs.find((candidate) => candidate.id === clubId)!
  const hurt = new Set(
    events.flatMap((item) => (item.type === 'injury' && item.clubId === clubId ? [item.player] : [])),
  )
  const dressed = new Set(
    [
      lineup.starter,
      lineup.backup,
      ...lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
      ...lineup.pairings.flatMap((pairing) => [pairing.leftDefence, pairing.rightDefence]),
    ],
  )

  return {
    fixtureId: fixture.id,
    home: clubName(state, fixture.homeClubId),
    away: clubName(state, fixture.awayClubId),
    throughPeriod,
    ended,
    ...score,
    plays: playByPlay(events, state.clubs),
    lineup,
    players: [
      ...club.skaters.map((skater) => ({ player: skater, positions: skater.preferredPositions })),
      ...club.goalies.map((goalie) => ({ player: goalie, positions: ['G'] as readonly string[] })),
    ]
      .filter(({ player }) => dressed.has(player.id))
      .map(({ player, positions }) => ({
        id: player.id,
        name: displayName(player),
        positions,
        out: hurt.has(player.id) ? 1 : 0,
      })),
  }
})
