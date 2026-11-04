import type { ClubId, PlayerId } from '../domain/player.js'
import type { PlayoffState } from '../domain/playoff.js'
import type { StandingsRow } from '../domain/standings.js'
import type { GoalieStats, SkaterStats } from './match.js'
import { addCounts, type SeasonTotals } from './season.js'
import { divisionTables } from './standings.js'
import { sortStandings } from '../domain/standings.js'

/**
 * Season history and Player careers (#86). A finished Season is kept as what
 * was folded from its event streams while it was played (D-03): the table, the
 * playoffs and the Players' counts. A Club's history and a Player's career are
 * read from those records and never stored a second time.
 *
 * The records live outside the Season state, which holds one Season only, so it
 * does not grow with a run. The caller keeps them.
 */
export interface SeasonRecord {
  seasonId: string
  year: number
  champion: ClubId
  /** The final regular-Season table. */
  standings: readonly StandingsRow[]
  playoffs: PlayoffState
  /** Player counts, the playoffs kept apart. */
  totals: Readonly<{ regular: SeasonTotals; playoffs: SeasonTotals }>
}

/** How far a Club went in the playoffs: the last round it played, from 1. */
export type PlayoffResult =
  { kind: 'missed' } | { kind: 'lost'; round: number; roundName: string } | { kind: 'champion' }

/** One Season of a Club's history. */
export interface ClubSeason {
  seasonId: string
  year: number
  row: StandingsRow
  /** Places by the tiebreaking order, from 1. */
  divisionRank: number
  leagueRank: number
  playoffs: PlayoffResult
}

/** A Club's Seasons, oldest first, from every record it appears in. */
export function clubHistory(records: readonly SeasonRecord[], clubId: ClubId): ClubSeason[] {
  return records.flatMap((record) => {
    const row = record.standings.find((candidate) => candidate.clubId === clubId)
    if (!row) return []
    const division = divisionTables(record.standings).get(row.divisionId)!
    return [
      {
        seasonId: record.seasonId,
        year: record.year,
        row,
        divisionRank: division.indexOf(row) + 1,
        leagueRank: sortStandings(record.standings).indexOf(row) + 1,
        playoffs: playoffResult(record, clubId),
      },
    ]
  })
}

function playoffResult(record: SeasonRecord, clubId: ClubId): PlayoffResult {
  if (record.champion === clubId) return { kind: 'champion' }
  const last = record.playoffs.bracket.rounds.findLast((round) =>
    round.series.some(
      (series) => series.higherSeed.clubId === clubId || series.lowerSeed.clubId === clubId,
    ),
  )
  return last ? { kind: 'lost', round: last.round, roundName: last.name } : { kind: 'missed' }
}

/** One Season of a Player's career, at one Club. Null where the Player did not play. */
export interface CareerSeason<S> {
  seasonId: string
  year: number
  clubId: ClubId
  regular: S | null
  playoffs: S | null
}

/** A Skater's Seasons, oldest first. A Season in which they played no Fixture has no line. */
export function skaterCareer(
  records: readonly SeasonRecord[],
  playerId: PlayerId,
): CareerSeason<SkaterStats>[] {
  return careerOf(records, (totals) => totals.skaters[playerId])
}

/** A Goalie's Seasons, oldest first. A Season in which they played no Fixture has no line. */
export function goalieCareer(
  records: readonly SeasonRecord[],
  playerId: PlayerId,
): CareerSeason<GoalieStats>[] {
  return careerOf(records, (totals) => totals.goalies[playerId])
}

/** A career's counts summed, regular Seasons and playoffs apart. */
export function careerTotals<S extends { clubId: ClubId }>(
  career: readonly CareerSeason<S>[],
): { regular: S | null; playoffs: S | null } {
  const total = (pick: (line: CareerSeason<S>) => S | null) =>
    career
      .map(pick)
      .reduce<S | null>((sum, stats) => (stats ? (sum ? addCounts(sum, stats) : stats) : sum), null)
  return { regular: total((line) => line.regular), playoffs: total((line) => line.playoffs) }
}

function careerOf<S extends { clubId: ClubId }>(
  records: readonly SeasonRecord[],
  read: (totals: SeasonTotals) => S | undefined,
): CareerSeason<S>[] {
  return records.flatMap((record) => {
    const regular = read(record.totals.regular) ?? null
    const playoffs = read(record.totals.playoffs) ?? null
    const clubId = (regular ?? playoffs)?.clubId
    if (clubId === undefined) return []
    return [{ seasonId: record.seasonId, year: record.year, clubId, regular, playoffs }]
  })
}
