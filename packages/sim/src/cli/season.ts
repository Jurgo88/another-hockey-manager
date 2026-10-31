import type { Club, Lineup } from '../domain/club.js'
import type { MatchEvent } from '../domain/event.js'
import type { Fixture, FixtureId, FixtureInput } from '../domain/fixture.js'
import type { ClubId, PlayerId } from '../domain/player.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../data/nhl-2026-27.js'
import { afterRest } from '../engine/fatigue.js'
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
  /** In the order played, parallel to `matches`. */
  fixtures: readonly Fixture[]
  matches: readonly MatchStats[]
  season: SeasonStats
  /** Re-simulates one Fixture from its input and seed, so a Season need not hold every stream (FR-02). */
  replay(fixtureId: FixtureId): readonly MatchEvent[]
}

/**
 * One full NHL 2026-27 regular Season - 32 generated Clubs, 1,344 Fixtures,
 * naive Lineups - simulated and folded the way the product will do it.
 *
 * Fixtures play in calendar order, because each Skater carries fatigue from
 * one to the next (FR-14, ADR-010): the fold of a Match, less the rest since,
 * is what the following `FixtureInput` starts from.
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
  }).sort((a, b) => a.day - b.day || a.round - b.round)

  const fatigue = new Map<PlayerId, number>()
  const lastPlayed = new Map<ClubId, number>()

  const rested = (clubId: ClubId, day: number): Club => {
    const club = clubById.get(clubId)!
    const last = lastPlayed.get(clubId)
    if (last === undefined) return club
    return {
      ...club,
      skaters: club.skaters.map((skater) => ({
        ...skater,
        fatigue: afterRest(fatigue.get(skater.id)!, day - last, skater.attributes.stamina),
      })),
    }
  }

  const inputs = new Map<FixtureId, FixtureInput>()
  const matches = fixtures.map((fixture) => {
    const input: FixtureInput = {
      fixture,
      homeClub: rested(fixture.homeClubId, fixture.day),
      awayClub: rested(fixture.awayClubId, fixture.day),
      homeLineup: lineups.get(fixture.homeClubId)!,
      awayLineup: lineups.get(fixture.awayClubId)!,
    }
    inputs.set(fixture.id, input)

    const match = foldMatch(fixture, simulateFixture(input, fixtureSeed(seasonRng, fixture)))
    for (const [id, value] of match.fatigue) fatigue.set(id, value)
    lastPlayed.set(fixture.homeClubId, fixture.day)
    lastPlayed.set(fixture.awayClubId, fixture.day)
    return match
  })

  const replay = (fixtureId: FixtureId): readonly MatchEvent[] => {
    const input = inputs.get(fixtureId)
    if (!input) throw new Error(`No Fixture ${fixtureId} in Season s${seed}`)
    return simulateFixture(input, fixtureSeed(seasonRng, input.fixture))
  }

  return { seed, clubs, lineups, fixtures, matches, season: foldSeason(matches), replay }
}
