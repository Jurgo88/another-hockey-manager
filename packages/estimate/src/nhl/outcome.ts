/**
 * What really happened in a season: the reference a simulated Season on the
 * estimated Rosters is compared with (#18). Small, and committed beside the
 * roster file, so the comparison runs without the network.
 */

export interface SeasonOutcome {
  season: string
  clubs: readonly { code: string; matchesPlayed: number; points: number }[]
  skaters: readonly {
    id: string
    name: string
    matchesPlayed: number
    goals: number
    assists: number
    points: number
  }[]
  goalies: readonly { id: string; name: string; matchesPlayed: number; shotsAgainst: number; saves: number }[]
}

/** The raw responses an outcome is read from. */
export interface RawOutcome {
  season: string
  teamSummary: unknown
  teamList: unknown
  skaterSummary: unknown
  goalieSummary: unknown
}

type Row = Readonly<Record<string, unknown>>

function rows(response: unknown, what: string): Row[] {
  const data =
    typeof response === 'object' && response !== null ? (response as Row).data : undefined
  if (!Array.isArray(data)) throw new Error(`${what}: the response has no data rows`)
  return data.filter((row): row is Row => typeof row === 'object' && row !== null)
}

const num = (row: Row, key: string) => (typeof row[key] === 'number' ? row[key] : 0)
const str = (row: Row, key: string) => (typeof row[key] === 'string' ? row[key] : '')

export function outcomeOf(raw: RawOutcome): SeasonOutcome {
  const codes = new Map(rows(raw.teamList, 'team').map((row) => [num(row, 'id'), str(row, 'triCode')]))

  return {
    season: raw.season,
    clubs: rows(raw.teamSummary, 'team/summary')
      .map((row) => ({
        code: codes.get(num(row, 'teamId')) ?? '',
        matchesPlayed: num(row, 'gamesPlayed'),
        points: num(row, 'points'),
      }))
      .sort((a, b) => b.points - a.points || a.code.localeCompare(b.code)),
    skaters: rows(raw.skaterSummary, 'skater/summary')
      .map((row) => ({
        id: `nhl-${num(row, 'playerId')}`,
        name: str(row, 'skaterFullName'),
        matchesPlayed: num(row, 'gamesPlayed'),
        goals: num(row, 'goals'),
        assists: num(row, 'assists'),
        points: num(row, 'points'),
      }))
      .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id)),
    goalies: rows(raw.goalieSummary, 'goalie/summary')
      .map((row) => ({
        id: `nhl-${num(row, 'playerId')}`,
        name: str(row, 'goalieFullName'),
        matchesPlayed: num(row, 'gamesPlayed'),
        shotsAgainst: num(row, 'shotsAgainst'),
        saves: num(row, 'saves'),
      }))
      .sort((a, b) => b.matchesPlayed - a.matchesPlayed || a.id.localeCompare(b.id)),
  }
}
