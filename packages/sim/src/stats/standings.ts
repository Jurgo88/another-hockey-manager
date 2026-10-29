import type { CompetitionStructure, ConferenceId, DivisionId } from '../domain/competition.js'
import type { ClubId } from '../domain/player.js'
import { sortStandings, type StandingsRow } from '../domain/standings.js'
import type { MatchStats } from './match.js'

/**
 * The standings table, folded from played Matches (D-03, FR-15).
 *
 * Points use the NHL scheme: 2 for a win, 1 for an overtime or shootout
 * loss, 0 for a regulation loss. Goals for and against come from the final
 * score, so a shootout winner is credited one goal, as NHL standings do.
 */

function emptyRow(
  clubId: ClubId,
  divisionId: DivisionId,
  conferenceId: ConferenceId,
): StandingsRow {
  return {
    clubId,
    divisionId,
    conferenceId,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    otLosses: 0,
    points: 0,
    regulationWins: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  }
}

/** Every Club in the structure, including any yet to play, ordered by `compareStandings`. */
export function foldStandings(
  structure: CompetitionStructure,
  matches: Iterable<MatchStats>,
): StandingsRow[] {
  const rows = new Map<ClubId, StandingsRow>()
  for (const division of structure.divisions) {
    for (const clubId of division.clubIds) {
      rows.set(clubId, emptyRow(clubId, division.id, division.conferenceId))
    }
  }

  const row = (clubId: ClubId, fixtureId: string): StandingsRow => {
    const found = rows.get(clubId)
    if (!found)
      throw new Error(`foldStandings: Club ${clubId} in ${fixtureId} is not in ${structure.id}`)
    return found
  }

  for (const match of matches) {
    const { result } = match
    if (result.winner === null) {
      // The NHL scheme has no tie. A competition whose Fixtures can end
      // level needs its own points rule before it can have a table.
      throw new Error(`foldStandings: Fixture ${match.fixtureId} ended level`)
    }

    const home = row(match.homeClubId, match.fixtureId)
    const away = row(match.awayClubId, match.fixtureId)
    const [winner, loser] = result.winner === match.homeClubId ? [home, away] : [away, home]

    home.goalsFor += result.homeGoals
    home.goalsAgainst += result.awayGoals
    away.goalsFor += result.awayGoals
    away.goalsAgainst += result.homeGoals
    home.gamesPlayed++
    away.gamesPlayed++

    winner.wins++
    winner.points += 2
    if (result.decidedIn === 'regulation') {
      winner.regulationWins++
      loser.losses++
    } else {
      loser.otLosses++
      loser.points += 1
    }
  }

  return sortStandings([...rows.values()])
}

function groupBy<K>(
  rows: readonly StandingsRow[],
  key: (row: StandingsRow) => K,
): Map<K, StandingsRow[]> {
  const groups = new Map<K, StandingsRow[]>()
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row])
  for (const [k, group] of groups) groups.set(k, sortStandings(group))
  return groups
}

export function divisionTables(rows: readonly StandingsRow[]): Map<DivisionId, StandingsRow[]> {
  return groupBy(rows, (row) => row.divisionId)
}

export function conferenceTables(rows: readonly StandingsRow[]): Map<ConferenceId, StandingsRow[]> {
  return groupBy(rows, (row) => row.conferenceId)
}
