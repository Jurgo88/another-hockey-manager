import type { Club, Lineup } from '../domain/club.js'
import type { MatchEvent } from '../domain/event.js'
import type { Fixture, FixtureId } from '../domain/fixture.js'
import type { ClubId } from '../domain/player.js'
import type { RosterProvider } from '../domain/roster.js'
import { simulateFixture } from '../engine/simulate.js'
import {
  advanceDay,
  isRegularSeasonOver,
  isSeasonOver,
  nextSeason,
  startSeason,
  summaryOf,
  type PlayedFixture,
  type SeasonSummary,
} from '../season/index.js'
import type { MatchStats } from '../stats/match.js'
import { foldSeason, type SeasonStats } from '../stats/season.js'

export interface SimulatedSeason {
  seed: number
  clubs: readonly Club[]
  lineups: ReadonlyMap<ClubId, Lineup>
  /** In the order played, parallel to `matches`. */
  fixtures: readonly Fixture[]
  matches: readonly MatchStats[]
  season: SeasonStats
  /** Re-simulates one Fixture from its input and seed, so a Season need not hold every stream (FR-02). */
  replay(fixtureId: FixtureId): readonly MatchEvent[]
}

/**
 * One regular Season played straight through on the AI Managers' opening
 * Lineups, on generated Rosters unless a provider gives others.
 */
export async function simulateSeason(
  seed: number,
  provider?: RosterProvider,
): Promise<SimulatedSeason> {
  let state = await startSeason(seed, provider)

  const played = new Map<FixtureId, Omit<PlayedFixture, 'events'>>()
  const fixtures: Fixture[] = []
  const matches: MatchStats[] = []
  while (!isRegularSeasonOver(state)) {
    const day = advanceDay(state)
    state = day.state
    for (const { fixture, input, seed: fixtureSeed, match } of day.played) {
      played.set(fixture.id, { fixture, input, seed: fixtureSeed, match })
      fixtures.push(fixture)
      matches.push(match)
    }
  }

  const replay = (fixtureId: FixtureId): readonly MatchEvent[] => {
    const fixture = played.get(fixtureId)
    if (!fixture) throw new Error(`No Fixture ${fixtureId} in Season s${seed}`)
    return simulateFixture(fixture.input, fixture.seed)
  }

  return {
    seed,
    clubs: state.clubs,
    lineups: new Map(Object.entries(state.lineups)),
    fixtures,
    matches,
    season: foldSeason(matches),
    replay,
  }
}

export interface SimulatedRun {
  clubs: readonly Club[]
  /** Every Season of the run, oldest first. */
  seasons: readonly SeasonSummary[]
}

/** Several Seasons in a row from one seed, each played to its champion (#85). */
export async function simulateSeasons(
  seed: number,
  count: number,
  provider?: RosterProvider,
): Promise<SimulatedRun> {
  let state = await startSeason(seed, provider)
  for (;;) {
    while (!isSeasonOver(state)) state = advanceDay(state).state
    if (state.year === count)
      return { clubs: state.clubs, seasons: [...state.past, summaryOf(state)] }
    state = nextSeason(state)
  }
}
