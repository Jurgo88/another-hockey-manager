import type {
  GoalieStats,
  NaturalPosition,
  PlayerId,
  RosterEntry,
  SeasonRecord,
  SeasonTotals,
  SkaterStats,
} from '@ahm/sim'

/**
 * A Season's record stored split, not copied (ADR-029): its own parts in
 * `seasons.record`, and the Players' part, their counts and the Roster as it
 * ended, as one `player_seasons` row each. Pure, so the round trip is tested
 * without a database.
 */
export type StoredRecord = Omit<SeasonRecord, 'totals' | 'roster'> & {
  /** How many Matches each part of the Season had, the one count that is not a Player's. */
  matches: { regular: number; playoffs: number }
}

/** One `player_seasons` row, without the career and year it belongs to. */
export interface PlayerSeasonRow {
  player_id: PlayerId
  goalie: boolean
  roster_order: number | null
  club_id: string | null
  age: number | null
  position: string | null
  level: number | null
  regular: SkaterStats | GoalieStats | null
  playoffs: SkaterStats | GoalieStats | null
}

export function splitRecord(record: SeasonRecord): {
  record: StoredRecord
  players: PlayerSeasonRow[]
} {
  const { totals, roster, ...own } = record
  const rows = new Map<PlayerId, PlayerSeasonRow>()
  const row = (playerId: PlayerId, goalie: boolean): PlayerSeasonRow => {
    let found = rows.get(playerId)
    if (!found) {
      found = {
        player_id: playerId,
        goalie,
        roster_order: null,
        club_id: null,
        age: null,
        position: null,
        level: null,
        regular: null,
        playoffs: null,
      }
      rows.set(playerId, found)
    }
    return found
  }

  roster.forEach((entry, i) => {
    Object.assign(row(entry.playerId, entry.position === 'G'), {
      roster_order: i,
      club_id: entry.clubId,
      age: entry.age,
      position: entry.position,
      level: entry.level,
    })
  })
  for (const part of ['regular', 'playoffs'] as const) {
    for (const [id, stats] of Object.entries(totals[part].skaters)) row(id, false)[part] = stats
    for (const [id, stats] of Object.entries(totals[part].goalies)) row(id, true)[part] = stats
  }

  return {
    record: {
      ...own,
      matches: { regular: totals.regular.matches, playoffs: totals.playoffs.matches },
    },
    players: [...rows.values()],
  }
}

export function joinRecord(stored: StoredRecord, rows: readonly PlayerSeasonRow[]): SeasonRecord {
  const { matches, ...own } = stored
  const part = (name: 'regular' | 'playoffs'): SeasonTotals => {
    const skaters: Record<PlayerId, SkaterStats> = {}
    const goalies: Record<PlayerId, GoalieStats> = {}
    for (const row of rows) {
      const stats = row[name]
      if (!stats) continue
      if (row.goalie) goalies[row.player_id] = stats as GoalieStats
      else skaters[row.player_id] = stats as SkaterStats
    }
    return { matches: matches[name], skaters, goalies }
  }

  const roster: RosterEntry[] = rows
    .filter((row) => row.roster_order !== null)
    .sort((a, b) => a.roster_order! - b.roster_order!)
    .map((row) => ({
      playerId: row.player_id,
      clubId: row.club_id!,
      age: row.age!,
      position: row.position as NaturalPosition,
      level: row.level!,
    }))

  return { ...own, totals: { regular: part('regular'), playoffs: part('playoffs') }, roster }
}
