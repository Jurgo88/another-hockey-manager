import {
  careerTotals,
  goalieCareer,
  skaterCareer,
  type CareerSeason,
  type PlayerId,
  type SeasonRecord,
} from '@ahm/sim'
import { joinRecord, type PlayerSeasonRow, type StoredRecord } from './records'

const ROWS_PER_READ = 500
const IDS_PER_READ = 200

/** A finished Season's own part of its record, as `seasons.record` keeps it (ADR-029). */
export interface StoredSeasonRecord {
  year: number
  record: StoredRecord
}

/** A `player_seasons` row with the year it belongs to. */
export type YearRow = PlayerSeasonRow & { year: number }

/** A career line, with the Player's age and position in that Season. */
export type CareerLine<S> = CareerSeason<S> & { age: number | null; position: string | null }

/**
 * A Player's career, read through the folds of `stats/history.ts` (ADR-025):
 * each finished Season's record is put back together with his rows alone, so
 * the lines and their totals are what the full records would give.
 */
export function careerOf(
  records: readonly StoredSeasonRecord[],
  rows: readonly YearRow[],
  playerId: PlayerId,
  goalie: boolean,
) {
  const seasons: SeasonRecord[] = records.map(({ year, record }) =>
    joinRecord(
      record,
      rows.filter((row) => row.year === year),
    ),
  )
  const withAge = <S>(line: CareerSeason<S>): CareerLine<S> => {
    const row = rows.find((candidate) => candidate.year === line.year)
    return { ...line, age: row?.age ?? null, position: row?.position ?? null }
  }
  if (goalie) {
    const lines = goalieCareer(seasons, playerId)
    return { goalie: true as const, lines: lines.map(withAge), totals: careerTotals(lines) }
  }
  const lines = skaterCareer(seasons, playerId)
  return { goalie: false as const, lines: lines.map(withAge), totals: careerTotals(lines) }
}

/** Every finished Season's own part of its record, oldest first. A few kB each. */
export async function loadOwnRecords(careerId: string): Promise<StoredSeasonRecord[]> {
  const { data, error } = await dataClient()
    .from('seasons')
    .select('year, record')
    .eq('career_id', careerId)
    .not('record', 'is', null)
    .order('year')
    .returns<StoredSeasonRecord[]>()
  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
}

/** A Player's rows of `player_seasons`, oldest first. */
export async function loadPlayerRows(careerId: string, playerId: PlayerId): Promise<YearRow[]> {
  const { data, error } = await dataClient()
    .from('player_seasons')
    .select(
      'year, player_id, goalie, roster_order, club_id, age, position, level, regular, playoffs',
    )
    .eq('career_id', careerId)
    .eq('player_id', playerId)
    .order('year')
    .limit(ROWS_PER_READ)
    .returns<YearRow[]>()
  if (error) throw createError({ statusCode: 500, message: error.message })
  return data
}

/** Who a Player of the career is (D-11), or null when the career never knew him. */
export async function loadIdentity(
  careerId: string,
  playerId: PlayerId,
): Promise<{ name: string; goalie: boolean } | null> {
  const { data, error } = await dataClient()
    .from('players')
    .select('first_name, last_name, goalie')
    .eq('career_id', careerId)
    .eq('player_id', playerId)
    .maybeSingle<{ first_name: string; last_name: string; goalie: boolean }>()
  if (error) throw createError({ statusCode: 500, message: error.message })
  return data && { name: `${data.first_name} ${data.last_name}`, goalie: data.goalie }
}

/** Names of the career's Players, read a few hundred at a time to keep each request short. */
export async function loadNames(
  careerId: string,
  ids: Iterable<PlayerId>,
): Promise<Map<PlayerId, string>> {
  const wanted = [...new Set(ids)]
  const names = new Map<PlayerId, string>()
  for (let i = 0; i < wanted.length; i += IDS_PER_READ) {
    const { data, error } = await dataClient()
      .from('players')
      .select('player_id, first_name, last_name')
      .eq('career_id', careerId)
      .in('player_id', wanted.slice(i, i + IDS_PER_READ))
      .returns<{ player_id: string; first_name: string; last_name: string }[]>()
    if (error) throw createError({ statusCode: 500, message: error.message })
    for (const row of data) names.set(row.player_id, `${row.first_name} ${row.last_name}`)
  }
  return names
}

/** A career's own Season and the Season to read now, for the history routes. */
export async function requireCareer(managerId: string) {
  const season = await loadSeason(managerId)
  if (!season) throw createError({ statusCode: 404, message: 'errors.noSeason' })
  return {
    careerId: season.careerId,
    clubId: season.clubId,
    current: season,
    state: season.phase === 'season' ? season.state : season.state.ended,
  }
}
