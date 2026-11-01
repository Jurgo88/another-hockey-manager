import type { Fixture, MatchEvent, SeasonState } from '@ahm/sim'

/** The followed Fixture of this Club, if there is one. */
export function liveFixture(state: SeasonState, clubId: string): Fixture | null {
  const id = Object.keys(state.live).find((fixtureId) => {
    const fixture = state.fixtures.find((candidate) => candidate.id === fixtureId)
    return fixture?.homeClubId === clubId || fixture?.awayClubId === clubId
  })
  return state.fixtures.find((fixture) => fixture.id === id) ?? null
}

/** Goals and shots on goal so far, counted from what has been shown. */
export function tally(events: readonly MatchEvent[], fixture: Fixture) {
  const count = (clubId: string, result: 'goal' | 'any') =>
    events.filter(
      (event) =>
        event.type === 'shot' &&
        event.clubId === clubId &&
        event.period !== 'SO' &&
        (result === 'any' ? event.result === 'goal' || event.result === 'save' : event.result === 'goal'),
    ).length

  return {
    homeGoals: count(fixture.homeClubId, 'goal'),
    awayGoals: count(fixture.awayClubId, 'goal'),
    homeShots: count(fixture.homeClubId, 'any'),
    awayShots: count(fixture.awayClubId, 'any'),
  }
}
