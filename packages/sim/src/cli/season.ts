import type { Club, Lineup } from '../domain/club.js'
import type { MatchEvent } from '../domain/event.js'
import type { Fixture, FixtureId } from '../domain/fixture.js'
import type { ClubId } from '../domain/player.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../data/nhl-2026-27.js'
import { buildNaiveLineup } from '../engine/lineup.js'
import { generateSchedule } from '../engine/schedule.js'
import { fixtureSeed, simulateFixture } from '../engine/simulate.js'
import { createGeneratedRosterProvider } from '../generate/roster.js'
import { createRng } from '../rng/index.js'
import { foldMatch, type MatchStats } from '../stats/match.js'
import { foldSeason, type SeasonStats } from '../stats/season.js'

export interface SimulatedSeason {
  seed: number
  clubs: readonly Club[]
  lineups: ReadonlyMap<ClubId, Lineup>
  fixtures: readonly Fixture[]
  matches: readonly MatchStats[]
  season: SeasonStats
  /** Re-simulates one Fixture from its seed, so a Season need not hold every stream (FR-02). */
  replay(fixtureId: FixtureId): readonly MatchEvent[]
}

/**
 * One full NHL 2026-27 regular Season - 32 generated Clubs, 1,344 Fixtures,
 * naive Lineups - simulated and folded the way the product will do it.
 *
 * Lives in `cli/` because it is the one place that needs the generator, the
 * engine and the folds together, which no other module may import.
 */
export async function simulateSeason(seed: number): Promise<SimulatedSeason> {
  const provider = createGeneratedRosterProvider({
    structure: NHL_2026_27,
    seed,
    clubIdentities: new Map(
      NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
    ),
  })
  const { clubs } = await provider.loadCompetition(NHL_2026_27.id)
  const clubById = new Map(clubs.map((club) => [club.id, club]))
  const lineups = new Map(clubs.map((club) => [club.id, buildNaiveLineup(club)]))

  const seasonRng = createRng(seed)
  const fixtures = generateSchedule({
    structure: NHL_2026_27,
    seasonId: `s${seed}`,
    rng: seasonRng.fork('schedule'),
  })

  const play = (fixture: Fixture): MatchEvent[] =>
    simulateFixture(
      {
        fixture,
        homeClub: clubById.get(fixture.homeClubId)!,
        awayClub: clubById.get(fixture.awayClubId)!,
        homeLineup: lineups.get(fixture.homeClubId)!,
        awayLineup: lineups.get(fixture.awayClubId)!,
      },
      fixtureSeed(seasonRng, fixture),
    )

  const matches = fixtures.map((fixture) => foldMatch(fixture, play(fixture)))

  const replay = (fixtureId: FixtureId): readonly MatchEvent[] => {
    const fixture = fixtures.find((f) => f.id === fixtureId)
    if (!fixture) throw new Error(`No Fixture ${fixtureId} in Season s${seed}`)
    return play(fixture)
  }

  return { seed, clubs, lineups, fixtures, matches, season: foldSeason(matches), replay }
}
