/**
 * Where NHL Players played, season by season, as the Phase 3 measurements read
 * it (#122): each Player's stints with each Club, the dates on which those who
 * played for more than one Club moved, and each season's calendar. Joined from
 * raw API responses; everything after this is a pure function of it.
 */

export interface SeasonPlayer {
  /** The calendar year the season starts in: 2015 for 2015-16. */
  season: number
  playerId: number
  /** 'C', 'L', 'R', 'D' or 'G'. */
  position: string
  lastName: string
  birthDate: string
  matchesPlayed: number
  /** Seconds per Fixture, all situations; 0 for a Goalie. */
  toiPerMatch: number
}

export interface Stint {
  season: number
  playerId: number
  club: string
  matchesPlayed: number
  /** Seconds in all, 0 for a Goalie. */
  timeOnIce: number
  goalie: boolean
}

/** A Player leaving one Club for another during a season. */
export interface Move {
  season: number
  playerId: number
  from: string
  to: string
  /** The last Fixture for the old Club. */
  lastFor: string
  /** The first Fixture for the new one. */
  firstFor: string
}

export interface SeasonCalendar {
  season: number
  /** First and last day of the regular season, ISO dates. */
  start: string
  end: string
  deadline: string
}

export interface MovementHistory {
  players: readonly SeasonPlayer[]
  stints: readonly Stint[]
  moves: readonly Move[]
  calendars: readonly SeasonCalendar[]
}

/** Raw responses per season id, as cached. */
export interface RawMovement {
  seasons: Readonly<
    Record<
      string,
      {
        skaterSummary: unknown
        skaterBios: unknown
        goalieSummary: unknown
        goalieBios: unknown
        /** `club-stats` by Club code. */
        clubs: Readonly<Record<string, unknown>>
        /** One Club's schedule, for the season's first and last day. */
        schedule: unknown
        /** Game logs of the Players who played for more than one Club, by Player id. */
        gameLogs: Readonly<Record<string, unknown>>
      }
    >
  >
}

/**
 * The trade deadline of each season, by its starting year: public facts, not
 * measurements. 2019-20 and 2020-21 were shortened seasons.
 */
export const TRADE_DEADLINES: Readonly<Record<number, string>> = {
  2015: '2016-02-29',
  2016: '2017-03-01',
  2017: '2018-02-26',
  2018: '2019-02-25',
  2019: '2020-02-24',
  2020: '2021-04-12',
  2021: '2022-03-21',
  2022: '2023-03-03',
  2023: '2024-03-08',
  2024: '2025-03-07',
  2025: '2026-03-06',
}

/** Arizona's Players and place went to Utah in 2024; one Club, as the table treats it. */
export const CLUB_CONTINUITY: Readonly<Record<string, string>> = { ARI: 'UTA' }
const clubOf = (code: string) => CLUB_CONTINUITY[code] ?? code

type Row = Readonly<Record<string, unknown>>

const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const num = (row: Row | undefined, key: string): number | undefined => {
  const value = row?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
const str = (row: Row | undefined, key: string): string | undefined => {
  const value = row?.[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}
const localized = (row: Row, key: string): string | undefined => {
  const value = row[key]
  return isRow(value) ? str(value, 'default') : str(row, key)
}

function rows(response: unknown, what: string): Row[] {
  const data = isRow(response) ? response.data : undefined
  if (!Array.isArray(data)) throw new Error(`${what}: the response has no data rows`)
  return data.filter(isRow)
}

function byPlayer(response: unknown, what: string): Map<number, Row> {
  const map = new Map<number, Row>()
  for (const row of rows(response, what)) {
    const id = num(row, 'playerId')
    if (id !== undefined) map.set(id, row)
  }
  return map
}

/** The stints of one season's `club-stats` responses. */
export function stintsOf(season: number, clubs: Readonly<Record<string, unknown>>): Stint[] {
  const stints: Stint[] = []
  for (const [code, response] of Object.entries(clubs)) {
    if (!isRow(response)) throw new Error(`club-stats/${code}/${season}: not an object`)
    for (const [list, goalie] of [
      ['skaters', false],
      ['goalies', true],
    ] as const) {
      const entries = Array.isArray(response[list])
        ? (response[list] as unknown[]).filter(isRow)
        : []
      for (const row of entries) {
        const playerId = num(row, 'playerId')
        const matchesPlayed = num(row, 'gamesPlayed')
        if (playerId === undefined || !matchesPlayed) continue
        const timeOnIce = goalie ? 0 : (num(row, 'avgTimeOnIcePerGame') ?? 0) * matchesPlayed
        stints.push({ season, playerId, club: clubOf(code), matchesPlayed, timeOnIce, goalie })
      }
    }
  }
  return stints
}

/** Moves read from one Player's game log, in the order he played. */
export function movesOf(season: number, playerId: number, gameLog: unknown): Move[] {
  const games =
    isRow(gameLog) && Array.isArray(gameLog.gameLog) ? gameLog.gameLog.filter(isRow) : []
  const played = games
    .map((g) => ({ date: str(g, 'gameDate'), club: str(g, 'teamAbbrev') }))
    .filter(
      (g): g is { date: string; club: string } => g.date !== undefined && g.club !== undefined,
    )
    .sort((a, b) => a.date.localeCompare(b.date))
  const moves: Move[] = []
  for (let i = 1; i < played.length; i++) {
    const [before, after] = [played[i - 1]!, played[i]!]
    if (clubOf(before.club) === clubOf(after.club)) continue
    moves.push({
      season,
      playerId,
      from: clubOf(before.club),
      to: clubOf(after.club),
      lastFor: before.date,
      firstFor: after.date,
    })
  }
  return moves
}

/** The first and last day of the regular season, from one Club's schedule. */
export function calendarOf(season: number, schedule: unknown): SeasonCalendar {
  const games = isRow(schedule) && Array.isArray(schedule.games) ? schedule.games.filter(isRow) : []
  const dates = games
    .filter((g) => num(g, 'gameType') === 2)
    .map((g) => str(g, 'gameDate'))
    .filter((d): d is string => d !== undefined)
    .sort()
  const deadline = TRADE_DEADLINES[season]
  if (dates.length === 0 || !deadline)
    throw new Error(`season ${season}: no regular-season schedule or deadline`)
  return { season, start: dates[0]!, end: dates.at(-1)!, deadline }
}

/** Players who played for more than one Club in a season, from its stints. */
export function playersWithSeveralClubs(stints: readonly Stint[]): number[] {
  const clubs = new Map<number, Set<string>>()
  for (const s of stints) clubs.set(s.playerId, (clubs.get(s.playerId) ?? new Set()).add(s.club))
  return [...clubs].filter(([, set]) => set.size > 1).map(([id]) => id)
}

export function movementOf(raw: RawMovement): MovementHistory {
  const players: SeasonPlayer[] = []
  const stints: Stint[] = []
  const moves: Move[] = []
  const calendars: SeasonCalendar[] = []

  for (const [seasonId, responses] of Object.entries(raw.seasons)) {
    const season = Number(seasonId.slice(0, 4))
    for (const [summary, bios, goalie] of [
      [responses.skaterSummary, responses.skaterBios, false],
      [responses.goalieSummary, responses.goalieBios, true],
    ] as const) {
      const kind = goalie ? 'goalie' : 'skater'
      const bio = byPlayer(bios, `${seasonId} ${kind}/bios`)
      for (const [playerId, row] of byPlayer(summary, `${seasonId} ${kind}/summary`)) {
        const birthDate = str(bio.get(playerId), 'birthDate')
        const lastName =
          localized(row, 'lastName') ?? localized(bio.get(playerId) ?? {}, 'lastName')
        const position = goalie ? 'G' : str(row, 'positionCode')
        const matchesPlayed = num(row, 'gamesPlayed')
        if (!birthDate || !lastName || !position || !matchesPlayed) continue
        players.push({
          season,
          playerId,
          position,
          lastName,
          birthDate,
          matchesPlayed,
          toiPerMatch: goalie ? 0 : (num(row, 'timeOnIcePerGame') ?? 0),
        })
      }
    }

    stints.push(...stintsOf(season, responses.clubs))
    for (const [id, log] of Object.entries(responses.gameLogs))
      moves.push(...movesOf(season, Number(id), log))
    calendars.push(calendarOf(season, responses.schedule))
  }

  return { players, stints, moves, calendars }
}
