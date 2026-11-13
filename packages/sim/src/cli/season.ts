import type { Club, Lineup } from '../domain/club.js'
import type { SeasonFormat } from '../domain/competition.js'
import type { MatchEvent } from '../domain/event.js'
import type { Fixture, FixtureId } from '../domain/fixture.js'
import type { ClubId, Player, PlayerId } from '../domain/player.js'
import type { RosterProvider } from '../domain/roster.js'
import { simulateFixture } from '../engine/simulate.js'
import {
  advanceDay,
  isRegularSeasonOver,
  isSeasonOver,
  nextSeason,
  recordOf,
  startSeason,
  type PlayedFixture,
} from '../season/index.js'
import { careerTotals, skaterCareer, type SeasonRecord } from '../stats/history.js'
import { deadCharge } from '../generate/contracts.js'
import type { RosterContract } from '../stats/league.js'
import { points, type MatchStats } from '../stats/match.js'
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
 * Lineups, on generated Rosters unless a provider gives others, of the NHL
 * unless another format is given.
 */
export async function simulateSeason(
  seed: number,
  provider?: RosterProvider,
  format?: SeasonFormat,
): Promise<SimulatedSeason> {
  let state = await startSeason(seed, provider, format)

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
  /** The Clubs as the last Season ended. */
  clubs: readonly Club[]
  /**
   * The regular Season of the last Season, as `simulateSeason` gives the first,
   * so the Tier 1 and Tier 2 targets can be read late in a run (#90).
   */
  last: Omit<SimulatedSeason, 'seed' | 'replay'>
  /** Everyone who was on a Roster in any Season, as last seen. */
  players: ReadonlyMap<PlayerId, Player>
  /** Every Season of the run, oldest first, kept as the caller keeps them (#86). */
  seasons: readonly SeasonRecord[]
  /** Each Season's contracts as it ended, oldest first (#125). */
  contracts: readonly (readonly RosterContract[])[]
  /** Each Season's dead money by Club, oldest first (#129). */
  deadMoney: readonly Readonly<Record<ClubId, number>>[]
}

/** Several Seasons in a row from one seed, each played to its champion (#85). */
export async function simulateSeasons(
  seed: number,
  count: number,
  provider?: RosterProvider,
  format?: SeasonFormat,
): Promise<SimulatedRun> {
  let state = await startSeason(seed, provider, format)
  const players = new Map<PlayerId, Player>()
  const seasons: SeasonRecord[] = []
  const contracts: RosterContract[][] = []
  const deadMoney: Record<ClubId, number>[] = []
  for (;;) {
    const fixtures: Fixture[] = []
    const matches: MatchStats[] = []
    while (!isRegularSeasonOver(state)) {
      const day = advanceDay(state)
      state = day.state
      if (state.year < count) continue
      for (const { fixture, match } of day.played) {
        fixtures.push(fixture)
        matches.push(match)
      }
    }
    const { clubs } = state
    const lineups = new Map(Object.entries(state.lineups))
    while (!isSeasonOver(state)) state = advanceDay(state).state
    for (const club of state.clubs) {
      for (const player of [...club.skaters, ...club.goalies]) players.set(player.id, player)
    }
    seasons.push(recordOf(state))
    deadMoney.push(
      Object.fromEntries(
        Object.entries(state.deadMoney).map(([id, entries]) => [id, deadCharge(entries)]),
      ),
    )
    contracts.push(
      state.clubs.flatMap((club) =>
        [...club.skaters, ...club.goalies].map((player) => ({
          playerId: player.id,
          clubId: club.id,
          ...(player.contract ? { contract: player.contract } : {}),
        })),
      ),
    )
    if (state.year === count) {
      const last = { clubs, lineups, fixtures, matches, season: foldSeason(matches) }
      return { clubs: state.clubs, last, players, seasons, contracts, deadMoney }
    }
    state = nextSeason(state)
  }
}

/** A Club of the run by its code, in any case. */
export function clubByCode(run: SimulatedRun, code: string): ClubId {
  const club = run.clubs.find((candidate) => candidate.code.toLowerCase() === code.toLowerCase())
  if (!club) throw new Error(`No Club with code "${code}"`)
  return club.id
}

/** The one Player of the run whose name contains `name`, in any case. */
export function playerByName(run: SimulatedRun, name: string): PlayerId {
  const wanted = name.toLowerCase()
  const found = [...run.players.values()].filter((player) =>
    `${player.firstName} ${player.lastName}`.toLowerCase().includes(wanted),
  )
  if (found.length === 1) return found[0]!.id
  const names = found.slice(0, 5).map((player) => `${player.firstName} ${player.lastName}`)
  throw new Error(
    found.length === 0
      ? `No Player named "${name}"`
      : `${found.length} Players match "${name}": ${names.join(', ')}${found.length > 5 ? ', ...' : ''}`,
  )
}

/** The Skater with the most regular-Season points over the run. */
export function leadingScorer(run: SimulatedRun): PlayerId {
  const total = (id: PlayerId) => {
    const { regular } = careerTotals(skaterCareer(run.seasons, id))
    return regular ? points(regular) : 0
  }
  const totals = [...run.players.keys()].map((id) => [id, total(id)] as const)
  return totals.reduce((best, next) => (next[1] > best[1] ? next : best))[0]
}
