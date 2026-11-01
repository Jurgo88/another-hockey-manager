import type { Fixture, MatchEvent, SeasonState } from '@ahm/sim'
import { displayName, fixtureSoFar } from '@ahm/sim'

/** The followed Fixture of this Club, if there is one. */
export function liveFixture(state: SeasonState, clubId: string): Fixture | null {
  const id = Object.keys(state.live).find((fixtureId) => {
    const fixture = state.fixtures.find((candidate) => candidate.id === fixtureId)
    return fixture?.homeClubId === clubId || fixture?.awayClubId === clubId
  })
  return state.fixtures.find((fixture) => fixture.id === id) ?? null
}

/**
 * What the broadcast screen receives. It is built only from what
 * `fixtureSoFar` returned, so nothing past the point reached can leave (ADR-018).
 */
export function liveView(state: SeasonState, clubId: string, fixture: Fixture) {
  const { events, lineups, phase } = fixtureSoFar(state, fixture.id)
  const names = playerNames(state.clubs)
  const name = (id: string) => names.get(id) ?? id
  const isHome = (id: string) => id === fixture.homeClubId

  const lineup = lineups[clubId]!
  const club = state.clubs.find((candidate) => candidate.id === clubId)!
  const hurt = new Set(
    events.flatMap((item) => (item.type === 'injury' && item.clubId === clubId ? [item.player] : [])),
  )
  const dressed = new Set([
    lineup.starter,
    lineup.backup,
    ...lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
    ...lineup.pairings.flatMap((pairing) => [pairing.leftDefence, pairing.rightDefence]),
  ])
  const shiftsOf = (list: readonly MatchEvent[]) =>
    list.flatMap((item) =>
      item.type === 'shift_change'
        ? [{ clock: item.clock, home: isHome(item.clubId), players: item.onIce.map(name) }]
        : [],
    )
  const attempts = events.flatMap((item) =>
    item.type === 'shot' && item.period !== 'SO'
      ? [
          {
            clock: item.clock,
            home: isHome(item.clubId),
            onGoal: item.result === 'goal' || item.result === 'save',
            goal: item.result === 'goal',
          },
        ]
      : [],
  )

  return {
    fixtureId: fixture.id,
    home: clubName(state, fixture.homeClubId),
    away: clubName(state, fixture.awayClubId),
    phase,
    clock: events.at(-1)?.clock ?? 0,
    overtimeSeconds: fixture.overtime === 'regular-3on3-then-shootout' ? 300 : 1200,
    period: events.at(-1)?.period ?? 1,
    plays: playByPlay(events, state.clubs),
    attempts,
    shifts: shiftsOf(events),
    lineup,
    players: [
      ...club.skaters.map((skater) => ({
        id: skater.id,
        name: displayName(skater),
        positions: skater.preferredPositions,
        out: hurt.has(skater.id) ? 1 : 0,
      })),
      ...club.goalies.map((goalie) => ({
        id: goalie.id,
        name: displayName(goalie),
        positions: ['G'] as readonly string[],
        out: hurt.has(goalie.id) ? 1 : 0,
      })),
    ].filter((player) => dressed.has(player.id)),
  }
}
