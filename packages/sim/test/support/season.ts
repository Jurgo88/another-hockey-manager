import type { Club, Lineup } from '../../src/domain/club.js'
import type { ClubId } from '../../src/domain/player.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../../src/data/nhl-2026-27.js'
import { buildNaiveLineup } from '../../src/engine/lineup.js'
import { generateSchedule } from '../../src/engine/schedule.js'
import { fixtureSeed, simulateFixture } from '../../src/engine/simulate.js'
import { createGeneratedRosterProvider } from '../../src/generate/roster.js'
import { createRng } from '../../src/rng/index.js'
import { foldMatch, type MatchStats } from '../../src/stats/match.js'
import { foldSeason, type SeasonStats } from '../../src/stats/season.js'

export interface SimulatedSeason {
  clubs: readonly Club[]
  lineups: ReadonlyMap<ClubId, Lineup>
  matches: readonly MatchStats[]
  season: SeasonStats
}

/**
 * One full NHL 2026-27 regular Season - 32 generated Clubs, 1,344 Fixtures,
 * naive Lineups - simulated and folded the way the product will do it.
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

  const matches = fixtures.map((fixture) => {
    const events = simulateFixture(
      {
        fixture,
        homeClub: clubById.get(fixture.homeClubId)!,
        awayClub: clubById.get(fixture.awayClubId)!,
        homeLineup: lineups.get(fixture.homeClubId)!,
        awayLineup: lineups.get(fixture.awayClubId)!,
      },
      fixtureSeed(seasonRng, fixture),
    )
    return foldMatch(fixture, events)
  })

  return { clubs, lineups, matches, season: foldSeason(matches) }
}
