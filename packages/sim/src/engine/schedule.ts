import type { CompetitionStructure, SeasonId } from '../domain/competition.js'
import type { Fixture } from '../domain/fixture.js'
import type { ClubId } from '../domain/player.js'
import type { Rng } from '../rng/index.js'

/**
 * Regular-season schedule generation.
 *
 * The NHL 2026-27 key needs each pair of Clubs to meet 4, 3 or 2 times with a
 * specific venue split. Rather than generate fixtures and then try to pack
 * them into rounds - which is an edge-colouring problem that greedy solvers
 * get stuck on - the schedule is built as four layers, each of which is a
 * clean round-robin decomposition. Their rounds concatenate, so every Club
 * plays exactly once per round by construction.
 *
 *   Layer A  single round robin over all 32 Clubs        31 rounds
 *   Layer B  the same, venues reversed                   31 rounds
 *   Layer C  per conference, the 8x8 cross-division set    8 rounds
 *   Layer D  per division, a double round robin           14 rounds
 *                                                        ---------
 *                                                         84 rounds
 *
 * A and B together give every pair 1 home and 1 away. D adds the two extra
 * divisional games (1 home, 1 away), reaching 4 games at 2-2. C adds the one
 * extra intra-conference game, reaching 3 games at either 2-1 or 1-2, split
 * so that each Club is home-heavy against exactly 4 of those 8 opponents.
 * Non-conference pairs receive nothing further and stay at 2 games, 1-1.
 *
 * Per Club: 28 + 24 + 32 = 84 Fixtures, exactly 42 home and 42 away.
 */

interface Meeting {
  home: ClubId
  away: ClubId
}

/**
 * Circle method. Requires an even number of Clubs and produces `n - 1` rounds
 * in which every Club appears exactly once and every pair meets exactly once.
 */
function singleRoundRobin(clubIds: readonly ClubId[]): Meeting[][] {
  const n = clubIds.length
  if (n % 2 !== 0) throw new Error(`singleRoundRobin needs an even Club count, received ${n}`)

  const anchor = n - 1
  const wheel = n - 1
  const rounds: Meeting[][] = []

  for (let r = 0; r < wheel; r++) {
    const round: Meeting[] = [{ home: clubIds[anchor]!, away: clubIds[r % wheel]! }]

    for (let i = 1; i < n / 2; i++) {
      const home = (r + i) % wheel
      const away = (((r - i) % wheel) + wheel) % wheel
      round.push({ home: clubIds[home]!, away: clubIds[away]! })
    }

    rounds.push(round)
  }

  return rounds
}

function reverseVenues(rounds: readonly Meeting[][]): Meeting[][] {
  return rounds.map((round) => round.map(({ home, away }) => ({ home: away, away: home })))
}

/**
 * The cross-division layer for one conference: the complete bipartite graph
 * between two divisions of equal size, decomposed into perfect matchings.
 *
 * Round m pairs `first[i]` with `second[(i + m) % size]`. The first division
 * is home for the first half of the rounds and away for the second, which
 * gives every Club in both divisions exactly `size / 2` home games here - and
 * therefore home-heavy status against exactly half of its cross-division
 * opponents.
 */
function crossDivisionLayer(
  first: readonly ClubId[],
  second: readonly ClubId[],
): Meeting[][] {
  const size = first.length
  if (second.length !== size) {
    throw new Error(`crossDivisionLayer needs equal divisions, received ${size} and ${second.length}`)
  }

  const rounds: Meeting[][] = []

  for (let m = 0; m < size; m++) {
    const firstIsHome = m < size / 2
    const round: Meeting[] = []

    for (let i = 0; i < size; i++) {
      const a = first[i]!
      const b = second[(i + m) % size]!
      round.push(firstIsHome ? { home: a, away: b } : { home: b, away: a })
    }

    rounds.push(round)
  }

  return rounds
}

/** Merges rounds that run in parallel (different divisions, same matchday). */
function mergeParallel(groups: readonly Meeting[][][]): Meeting[][] {
  const roundCount = groups[0]?.length ?? 0

  for (const group of groups) {
    if (group.length !== roundCount) {
      throw new Error('mergeParallel requires every group to have the same round count')
    }
  }

  return Array.from({ length: roundCount }, (_, r) => groups.flatMap((group) => group[r]!))
}

export interface GenerateScheduleOptions {
  structure: CompetitionStructure
  seasonId: SeasonId
  /**
   * Shuffles the order of matchdays so that divisional and cross-division
   * blocks are spread through the season instead of arriving in one lump.
   * Every Club still plays exactly once per round.
   */
  rng: Rng
}

export function generateSchedule(options: GenerateScheduleOptions): Fixture[] {
  const { structure, seasonId, rng } = options

  const allClubIds = structure.divisions.flatMap((division) => division.clubIds)

  // Layers A and B: every pair once, then again with venues reversed.
  const layerA = singleRoundRobin(allClubIds)
  const layerB = reverseVenues(layerA)

  // Layer C: one extra intra-conference, cross-division meeting.
  const layerC = mergeParallel(
    structure.conferences.map((conference) => {
      const [firstId, secondId] = conference.divisionIds
      const first = structure.divisions.find((d) => d.id === firstId)
      const second = structure.divisions.find((d) => d.id === secondId)

      if (!first || !second) {
        throw new Error(`Conference ${conference.id} does not resolve to two divisions`)
      }

      return crossDivisionLayer(first.clubIds, second.clubIds)
    }),
  )

  // Layer D: two extra divisional meetings, one at each venue.
  const layerD = mergeParallel(
    structure.divisions.map((division) => {
      const single = singleRoundRobin(division.clubIds)
      return [...single, ...reverseVenues(single)]
    }),
  )

  const matchdays = rng.shuffle([...layerA, ...layerB, ...layerC, ...layerD])

  // A Club plays once per round. A back-to-back takes the last day of one
  // round and the first of the next, so three in three days cannot happen.
  const { daysPerRound, lastDayShare } = structure.calendar
  const calendarRng = rng.fork('calendar')

  return matchdays.flatMap((round, roundIndex) =>
    round.map(
      (meeting, indexInRound): Fixture => ({
        id: `${seasonId}-r${String(roundIndex).padStart(2, '0')}-${String(indexInRound).padStart(2, '0')}`,
        competitionId: structure.id,
        seasonId,
        round: roundIndex,
        day: roundIndex * daysPerRound + (calendarRng.chance(lastDayShare) ? daysPerRound - 1 : 0),
        homeClubId: meeting.home,
        awayClubId: meeting.away,
        // The regular-season regime is data on the competition (D-10, FR-09b).
        overtime: structure.overtime,
      }),
    ),
  )
}

/** Summary of how often two Clubs meet, for verification and display. */
export interface MeetingCount {
  games: number
  home: number
  away: number
}

export function countMeetings(
  fixtures: readonly Fixture[],
  clubId: ClubId,
): Map<ClubId, MeetingCount> {
  const counts = new Map<ClubId, MeetingCount>()

  const bump = (opponent: ClubId, atHome: boolean) => {
    const current = counts.get(opponent) ?? { games: 0, home: 0, away: 0 }
    current.games += 1
    if (atHome) current.home += 1
    else current.away += 1
    counts.set(opponent, current)
  }

  for (const fixture of fixtures) {
    if (fixture.homeClubId === clubId) bump(fixture.awayClubId, true)
    else if (fixture.awayClubId === clubId) bump(fixture.homeClubId, false)
  }

  return counts
}
