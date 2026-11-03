/**
 * One NHL regular season as the estimator reads it: plain records with the
 * fields it uses, joined by Player id from the raw API responses. Everything
 * after this point is a pure function of these records (ADR-021).
 */

export type ListedPosition = 'C' | 'L' | 'R' | 'D'

export interface SkaterRecord {
  playerId: number
  position: ListedPosition
  shoots: 'L' | 'R'
  /** YYYY-MM-DD. */
  birthDate: string
  matchesPlayed: number
  /** Seconds per Fixture, all situations. */
  toiPerMatch: number
  /** Seconds per Fixture at 5v5. */
  toi5v5PerMatch: number
  goals: number
  /** All situations. */
  assists: number
  shots: number
  primaryAssists5v5: number
  /** Goals and assists at 5v5. */
  points5v5: number
  /** Individual shots on goal per 60 minutes at 5v5. */
  shotsPer60At5v5?: number
  /** Share of 5v5 zone starts in the offensive zone, 0-1. */
  offensiveZoneStarts5v5?: number
  /** Share of the 5v5 goals scored while he is on the ice that are his Club's, 0-1. */
  onIceGoalShare5v5?: number
  /** On-ice shot attempt share at 5v5 minus the Club's without him. */
  satRelative5v5?: number
  takeaways: number
  giveaways: number
  minorPenalties: number
  faceoffsWon: number
  faceoffsTaken: number
  edge?: EdgeRecord
}

/** NHL EDGE tracking, imperial units. */
export interface EdgeRecord {
  /** Miles per hour. */
  topSpeed?: number
  /** Miles per hour. */
  topShotSpeed?: number
  /** Miles over the season. */
  distance?: number
  shots?: number
  highDangerShots?: number
}

export interface GoalieRecord {
  playerId: number
  catches: 'L' | 'R'
  birthDate: string
  matchesPlayed: number
  /** Seconds over the season. */
  timeOnIce: number
  evShotsAgainst: number
  evSaves: number
}

/** A Player's season at one Club. A traded Player has one per Club. */
export interface ClubStint {
  clubCode: string
  playerId: number
  firstName: string
  lastName: string
  goalie: boolean
  matchesPlayed: number
  /** Seconds over the season at this Club. */
  timeOnIce: number
}

export interface SeasonRecords {
  /** NHL season id, such as 20252026. */
  season: string
  skaters: readonly SkaterRecord[]
  goalies: readonly GoalieRecord[]
  stints: readonly ClubStint[]
}

/** The raw responses the records are joined from, as cached. */
export interface RawSeason {
  season: string
  skater: Readonly<Record<SkaterReport, unknown>>
  goalie: Readonly<Record<GoalieReport, unknown>>
  /** Club statistics by Club code. */
  clubs: Readonly<Record<string, unknown>>
  /** NHL EDGE skater detail by Player id; absent where none was fetched. */
  edge: Readonly<Record<string, unknown>>
}

export const SKATER_REPORTS = [
  'summary',
  'bios',
  'timeonice',
  'scoringRates',
  'puckPossessions',
  'realtime',
  'penalties',
  'faceoffwins',
] as const
export type SkaterReport = (typeof SKATER_REPORTS)[number]

export const GOALIE_REPORTS = ['summary', 'bios', 'savesByStrength'] as const
export type GoalieReport = (typeof GOALIE_REPORTS)[number]

type Row = Readonly<Record<string, unknown>>

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rowsOf(response: unknown, what: string): Row[] {
  const data = isRow(response) ? response.data : undefined
  if (!Array.isArray(data)) throw new Error(`${what}: the response has no data rows`)
  return data.filter(isRow)
}

function num(row: Row | undefined, key: string): number | undefined {
  const value = row?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function str(row: Row | undefined, key: string): string | undefined {
  const value = row?.[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** `{ default: 'Name', sk: '...' }`, as the web API spells names. */
function localized(row: Row | undefined, key: string): string | undefined {
  const value = row?.[key]
  return isRow(value) ? str(value, 'default') : undefined
}

function byPlayer(response: unknown, what: string): Map<number, Row> {
  const map = new Map<number, Row>()
  for (const row of rowsOf(response, what)) {
    const id = num(row, 'playerId')
    if (id !== undefined) map.set(id, row)
  }
  return map
}

function hand(value: string | undefined): 'L' | 'R' {
  return value === 'R' ? 'R' : 'L'
}

function edgeOf(response: unknown): EdgeRecord | undefined {
  if (!isRow(response)) return undefined
  const imperial = (path: readonly string[]): number | undefined => {
    let at: unknown = response
    for (const key of path) at = isRow(at) ? at[key] : undefined
    return isRow(at) ? num(at, 'imperial') : undefined
  }
  const areas = Array.isArray(response.sogSummary) ? response.sogSummary.filter(isRow) : []
  const area = (code: string) => areas.find((row) => row.locationCode === code)

  const edge: EdgeRecord = {}
  const set = <K extends keyof EdgeRecord>(key: K, value: number | undefined) => {
    if (value !== undefined) edge[key] = value
  }
  set('topSpeed', imperial(['skatingSpeed', 'speedMax']))
  set('topShotSpeed', imperial(['topShotSpeed']))
  set('distance', imperial(['totalDistanceSkated']))
  set('shots', num(area('all'), 'shots'))
  set('highDangerShots', num(area('high'), 'shots'))
  return Object.keys(edge).length === 0 ? undefined : edge
}

/** Joins the raw responses into records. A Player missing a field the estimator cannot do without is left out. */
export function recordsOf(raw: RawSeason): SeasonRecords {
  const report = (name: SkaterReport) => byPlayer(raw.skater[name], `skater/${name}`)
  const summary = report('summary')
  const bios = report('bios')
  const timeOnIce = report('timeonice')
  const rates = report('scoringRates')
  const possession = report('puckPossessions')
  const realtime = report('realtime')
  const penalties = report('penalties')
  const faceoffs = report('faceoffwins')

  const skaters: SkaterRecord[] = []
  for (const [playerId, row] of summary) {
    const position = str(row, 'positionCode')
    const birthDate = str(bios.get(playerId), 'birthDate')
    const matchesPlayed = num(row, 'gamesPlayed')
    if (!position || !'CLRD'.includes(position) || !birthDate || !matchesPlayed) continue

    const rate = rates.get(playerId)
    const record: SkaterRecord = {
      playerId,
      position: position as ListedPosition,
      shoots: hand(str(row, 'shootsCatches')),
      birthDate,
      matchesPlayed,
      toiPerMatch: num(timeOnIce.get(playerId), 'timeOnIcePerGame') ?? num(row, 'timeOnIcePerGame') ?? 0,
      toi5v5PerMatch: num(rate, 'timeOnIcePerGame5v5') ?? 0,
      goals: num(row, 'goals') ?? 0,
      assists: num(row, 'assists') ?? 0,
      shots: num(row, 'shots') ?? 0,
      primaryAssists5v5: num(rate, 'primaryAssists5v5') ?? 0,
      points5v5: num(rate, 'points5v5') ?? 0,
      takeaways: num(realtime.get(playerId), 'takeaways') ?? 0,
      giveaways: num(realtime.get(playerId), 'giveaways') ?? 0,
      minorPenalties: num(penalties.get(playerId), 'minorPenalties') ?? 0,
      faceoffsWon: num(faceoffs.get(playerId), 'totalFaceoffWins') ?? 0,
      faceoffsTaken: num(faceoffs.get(playerId), 'totalFaceoffs') ?? 0,
    }
    const optional = {
      shotsPer60At5v5: num(possession.get(playerId), 'individualShotsForPer60'),
      offensiveZoneStarts5v5: num(rate, 'offensiveZoneStartPct5v5'),
      satRelative5v5: num(rate, 'satRelative5v5'),
      onIceGoalShare5v5: num(possession.get(playerId), 'goalsPct'),
      edge: edgeOf(raw.edge[String(playerId)]),
    }
    for (const [key, value] of Object.entries(optional)) {
      if (value !== undefined) Object.assign(record, { [key]: value })
    }
    skaters.push(record)
  }

  const goalieReport = (name: GoalieReport) => byPlayer(raw.goalie[name], `goalie/${name}`)
  const goalieSummary = goalieReport('summary')
  const goalieBios = goalieReport('bios')
  const saves = goalieReport('savesByStrength')

  const goalies: GoalieRecord[] = []
  for (const [playerId, row] of goalieSummary) {
    const birthDate = str(goalieBios.get(playerId), 'birthDate')
    const matchesPlayed = num(row, 'gamesPlayed')
    if (!birthDate || !matchesPlayed) continue
    goalies.push({
      playerId,
      catches: hand(str(row, 'shootsCatches')),
      birthDate,
      matchesPlayed,
      timeOnIce: num(row, 'timeOnIce') ?? 0,
      evShotsAgainst: num(saves.get(playerId), 'evShotsAgainst') ?? 0,
      evSaves: num(saves.get(playerId), 'evSaves') ?? 0,
    })
  }

  const stints: ClubStint[] = []
  for (const [clubCode, response] of Object.entries(raw.clubs)) {
    if (!isRow(response)) throw new Error(`club-stats/${clubCode}: not an object`)
    for (const [list, goalie] of [
      ['skaters', false],
      ['goalies', true],
    ] as const) {
      const rows = Array.isArray(response[list]) ? (response[list] as unknown[]).filter(isRow) : []
      for (const row of rows) {
        const playerId = num(row, 'playerId')
        const firstName = localized(row, 'firstName')
        const lastName = localized(row, 'lastName')
        const matchesPlayed = num(row, 'gamesPlayed')
        if (playerId === undefined || !firstName || !lastName || !matchesPlayed) continue
        const timeOnIce = goalie
          ? (num(row, 'timeOnIce') ?? 0)
          : (num(row, 'avgTimeOnIcePerGame') ?? 0) * matchesPlayed
        stints.push({ clubCode, playerId, firstName, lastName, goalie, matchesPlayed, timeOnIce })
      }
    }
  }

  return { season: raw.season, skaters, goalies, stints }
}
