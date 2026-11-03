/**
 * The NHL over several seasons, as the Phase 2 measurements read it (#83):
 * Players season by season, careers, draft classes and Club tables. Joined
 * from raw API responses; everything after this is a pure function of it.
 */

export interface SeasonSkater {
  /** The calendar year the season starts in: 2015 for 2015-16. */
  season: number
  playerId: number
  position: 'C' | 'L' | 'R' | 'D'
  birthDate: string
  matchesPlayed: number
  /** Seconds per Fixture, all situations. */
  toiPerMatch: number
  /** Seconds per Fixture at 5v5. */
  toi5v5PerMatch: number
  points5v5: number
}

export interface SeasonGoalie {
  season: number
  playerId: number
  birthDate: string
  matchesPlayed: number
  evShotsAgainst: number
  evSaves: number
}

export interface ClubSeason {
  season: number
  code: string
  /** Points over points available, so shortened seasons compare. */
  pointShare: number
}

/** A Player's NHL career inside the measured range, with his draft. */
export interface Career {
  playerId: number
  goalie: boolean
  draftYear?: number
  draftRound?: number
  /** Start year of his first NHL season. */
  firstSeason?: number
  matchesPlayed: number
}

/** Top skating speed of the same Player in two consecutive seasons, from NHL EDGE. */
export interface SpeedPair {
  playerId: number
  birthDate: string
  /** Start year of the first of the two seasons. */
  season: number
  before: number
  after: number
}

export interface LeagueHistory {
  skaters: readonly SeasonSkater[]
  goalies: readonly SeasonGoalie[]
  clubs: readonly ClubSeason[]
  careers: readonly Career[]
  /** Picks made per draft year and round. */
  draftPicks: readonly { year: number; round: number; picks: number }[]
  speed: readonly SpeedPair[]
}

/** Raw responses per season id, as cached. */
export interface RawHistory {
  seasons: Readonly<
    Record<
      string,
      {
        skaterSummary: unknown
        skaterBios: unknown
        skaterRates: unknown
        goalieSummary: unknown
        goalieBios: unknown
        goalieSaves: unknown
        teamSummary: unknown
      }
    >
  >
  teamList: unknown
  careerSkaters: unknown
  careerGoalies: unknown
  /** Draft picks by year. */
  drafts: Readonly<Record<string, unknown>>
  /** NHL EDGE skater detail by season id, then Player id. */
  edge: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

type Row = Readonly<Record<string, unknown>>

const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function rows(response: unknown, what: string): Row[] {
  const data = isRow(response) ? response.data : undefined
  if (!Array.isArray(data)) throw new Error(`${what}: the response has no data rows`)
  return data.filter(isRow)
}

const num = (row: Row | undefined, key: string): number | undefined => {
  const value = row?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
const str = (row: Row | undefined, key: string): string | undefined => {
  const value = row?.[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function byPlayer(response: unknown, what: string): Map<number, Row> {
  const map = new Map<number, Row>()
  for (const row of rows(response, what)) {
    const id = num(row, 'playerId')
    if (id !== undefined) map.set(id, row)
  }
  return map
}

/** Arizona's Players and place went to Utah in 2024; the table treats them as one Club. */
const CLUB_CONTINUITY: Readonly<Record<string, string>> = { ARI: 'UTA' }

function topSpeed(response: unknown): number | undefined {
  if (!isRow(response)) return undefined
  const skating = response.skatingSpeed
  const max = isRow(skating) ? skating.speedMax : undefined
  return isRow(max) ? num(max, 'imperial') : undefined
}

export function historyOf(raw: RawHistory): LeagueHistory {
  const skaters: SeasonSkater[] = []
  const goalies: SeasonGoalie[] = []
  const clubs: ClubSeason[] = []
  const codes = new Map(rows(raw.teamList, 'team').map((row) => [num(row, 'id'), str(row, 'triCode')]))

  for (const [seasonId, responses] of Object.entries(raw.seasons)) {
    const season = Number(seasonId.slice(0, 4))
    const bios = byPlayer(responses.skaterBios, `${seasonId} skater/bios`)
    const rates = byPlayer(responses.skaterRates, `${seasonId} skater/scoringRates`)
    for (const [playerId, row] of byPlayer(responses.skaterSummary, `${seasonId} skater/summary`)) {
      const position = str(row, 'positionCode')
      const birthDate = str(bios.get(playerId), 'birthDate')
      const matchesPlayed = num(row, 'gamesPlayed')
      if (!position || !'CLRD'.includes(position) || !birthDate || !matchesPlayed) continue
      skaters.push({
        season,
        playerId,
        position: position as SeasonSkater['position'],
        birthDate,
        matchesPlayed,
        toiPerMatch: num(row, 'timeOnIcePerGame') ?? 0,
        toi5v5PerMatch: num(rates.get(playerId), 'timeOnIcePerGame5v5') ?? 0,
        points5v5: num(rates.get(playerId), 'points5v5') ?? 0,
      })
    }

    const goalieBios = byPlayer(responses.goalieBios, `${seasonId} goalie/bios`)
    const saves = byPlayer(responses.goalieSaves, `${seasonId} goalie/savesByStrength`)
    for (const [playerId, row] of byPlayer(responses.goalieSummary, `${seasonId} goalie/summary`)) {
      const birthDate = str(goalieBios.get(playerId), 'birthDate')
      const matchesPlayed = num(row, 'gamesPlayed')
      if (!birthDate || !matchesPlayed) continue
      goalies.push({
        season,
        playerId,
        birthDate,
        matchesPlayed,
        evShotsAgainst: num(saves.get(playerId), 'evShotsAgainst') ?? 0,
        evSaves: num(saves.get(playerId), 'evSaves') ?? 0,
      })
    }

    for (const row of rows(responses.teamSummary, `${seasonId} team/summary`)) {
      const code = codes.get(num(row, 'teamId'))
      const pointShare = num(row, 'pointPct')
      if (!code || pointShare === undefined) continue
      clubs.push({ season, code: CLUB_CONTINUITY[code] ?? code, pointShare })
    }
  }

  const careers: Career[] = []
  for (const [response, goalie] of [
    [raw.careerSkaters, false],
    [raw.careerGoalies, true],
  ] as const) {
    for (const row of rows(response, goalie ? 'career goalie/bios' : 'career skater/bios')) {
      const playerId = num(row, 'playerId')
      if (playerId === undefined) continue
      const first = num(row, 'firstSeasonForGameType')
      const career: Career = { playerId, goalie, matchesPlayed: num(row, 'gamesPlayed') ?? 0 }
      const draftYear = num(row, 'draftYear')
      const draftRound = num(row, 'draftRound')
      if (draftYear !== undefined) career.draftYear = draftYear
      if (draftRound !== undefined) career.draftRound = draftRound
      if (first !== undefined) career.firstSeason = Math.floor(first / 10_000)
      careers.push(career)
    }
  }

  const draftPicks: LeagueHistory['draftPicks'][number][] = []
  for (const [year, response] of Object.entries(raw.drafts)) {
    const picks = isRow(response) && Array.isArray(response.picks) ? response.picks.filter(isRow) : []
    const perRound = new Map<number, number>()
    for (const pick of picks) {
      const round = num(pick, 'round')
      if (round !== undefined) perRound.set(round, (perRound.get(round) ?? 0) + 1)
    }
    for (const [round, count] of perRound) draftPicks.push({ year: Number(year), round, picks: count })
  }

  const speed: SpeedPair[] = []
  const edgeSeasons = Object.keys(raw.edge).sort()
  const birth = new Map(skaters.map((s) => [s.playerId, s.birthDate]))
  for (let i = 0; i + 1 < edgeSeasons.length; i++) {
    const [first, second] = [raw.edge[edgeSeasons[i]!]!, raw.edge[edgeSeasons[i + 1]!]!]
    for (const [id, response] of Object.entries(first)) {
      const before = topSpeed(response)
      const after = topSpeed(second[id])
      const birthDate = birth.get(Number(id))
      if (before === undefined || after === undefined || !birthDate) continue
      speed.push({ playerId: Number(id), birthDate, season: Number(edgeSeasons[i]!.slice(0, 4)), before, after })
    }
  }

  return { skaters, goalies, clubs, careers, draftPicks, speed }
}
