import type {
  Club,
  ClubId,
  Offseason,
  PlayedDay,
  Player,
  PlayerId,
  SeasonRecord,
  SeasonState,
} from '@ahm/sim'
import {
  clubHistory,
  daysOut,
  displayName,
  isGoalie,
  isSeasonOver,
  noticesOf,
  plainMatchStats,
  playsNext,
  recordOf,
} from '@ahm/sim'

const RESULTS_PER_INSERT = 200
const PLAYERS_PER_WRITE = 500

interface StoredBase {
  /** The Season's row. Its results and notices hang from it. */
  id: string
  careerId: string
  clubId: ClubId
  version: number
}

/** The current Season while it is played. */
export interface StoredSeason extends StoredBase {
  phase: 'season'
  state: SeasonState
}

/** The current Season once it has ended, while Managers decide (ADR-028, ADR-029). */
export interface StoredOffseason extends StoredBase {
  phase: 'offseason'
  state: Offseason
}

export type CurrentSeason = StoredSeason | StoredOffseason

/** Seasons stored before #85 have no `year`: they are the first of their run. */
type StoredState = Omit<SeasonState, 'year'> & Partial<Pick<SeasonState, 'year'>>

interface SeasonRow {
  id: string
  career_id: string
  club_id: string
  version: number
  phase: 'season' | 'offseason'
  state: StoredState | Offseason
  live: SeasonState['live']
}

/** The current Season of a Manager's career: its row with the highest `year` (ADR-029). */
export async function loadSeason(managerId: string): Promise<CurrentSeason | null> {
  const { data, error } = await dataClient()
    .from('seasons')
    .select('id, career_id, club_id, version, phase, state, live, careers!inner(manager_id)')
    .eq('careers.manager_id', managerId)
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle<SeasonRow>()
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!data) return null

  const base = {
    id: data.id,
    careerId: data.career_id,
    clubId: data.club_id,
    version: data.version,
  }
  if (data.phase === 'offseason') {
    return { ...base, phase: 'offseason', state: data.state as Offseason }
  }
  const state = data.state as StoredState
  return { ...base, phase: 'season', state: { ...state, year: state.year ?? 1, live: data.live } }
}

async function requireCurrent(managerId: string): Promise<CurrentSeason> {
  const season = await loadSeason(managerId)
  if (!season) throw createError({ statusCode: 404, message: 'errors.noSeason' })
  return season
}

/** The current Season, to be played: refused between Seasons. */
export async function requireSeason(managerId: string): Promise<StoredSeason> {
  const season = await requireCurrent(managerId)
  if (season.phase !== 'season') throw createError({ statusCode: 409, message: 'errors.offseason' })
  return season
}

/** The current Season, between Seasons. */
export async function requireOffseason(managerId: string): Promise<StoredOffseason> {
  const season = await requireCurrent(managerId)
  if (season.phase !== 'offseason') {
    throw createError({ statusCode: 409, message: 'errors.seasonMoved' })
  }
  return season
}

/**
 * The Season to read: the current one, or between Seasons the one just ended,
 * whose table, leaders and results stay readable until the next begins.
 */
export async function readSeason(
  managerId: string,
): Promise<{ id: string; clubId: ClubId; state: SeasonState }> {
  const season = await requireCurrent(managerId)
  return {
    id: season.id,
    clubId: season.clubId,
    state: season.phase === 'season' ? season.state : season.state.ended,
  }
}

/** A Manager has one career at a time, so a new one replaces the old, and all its Seasons. */
export async function startCareer(
  managerId: string,
  clubId: ClubId,
  state: SeasonState,
): Promise<void> {
  const client = dataClient()
  const removed = await client.from('careers').delete().eq('manager_id', managerId)
  if (removed.error) throw createError({ statusCode: 500, message: removed.error.message })

  const { data, error } = await client
    .from('careers')
    .insert({ manager_id: managerId, seed: state.seed })
    .select('id')
    .single<{ id: string }>()
  if (error) throw createError({ statusCode: 500, message: error.message })

  await savePlayers(data.id, playersOf(state))
  const inserted = await client.from('seasons').insert({
    career_id: data.id,
    year: state.year,
    club_id: clubId,
    seed: state.seed,
    phase: 'season',
    state,
    live: state.live,
  })
  if (inserted.error) throw createError({ statusCode: 500, message: inserted.error.message })
}

/**
 * Closes a Season with its champion (ADR-029): the Players' part of its record
 * first, by their keys, so a repeat writes the same rows; then the row itself,
 * its own part of the record and the Offseason, guarded by the version.
 */
export async function saveEnded(
  season: StoredSeason,
  record: SeasonRecord,
  offseason: Offseason,
): Promise<void> {
  const client = dataClient()
  const split = splitRecord(record)
  await savePlayers(season.careerId, playersOf(season.state))
  const rows = split.players.map((row) => ({
    ...row,
    career_id: season.careerId,
    year: record.year,
  }))
  for (let i = 0; i < rows.length; i += PLAYERS_PER_WRITE) {
    const { error } = await client
      .from('player_seasons')
      .upsert(rows.slice(i, i + PLAYERS_PER_WRITE))
    if (error) throw createError({ statusCode: 500, message: error.message })
  }

  const { data, error } = await client
    .from('seasons')
    .update({
      phase: 'offseason',
      state: offseason,
      live: {},
      record: split.record,
      version: season.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', season.id)
    .eq('version', season.version)
    .select('id')
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (data.length === 0) throw createError({ statusCode: 409, message: 'errors.seasonMoved' })
}

/**
 * Starts the next Season of a career (ADR-029). Its row is inserted once, the
 * unique career and year refusing a second; then the Seasons before it let go
 * of their state, which only the current Season holds.
 */
export async function saveNext(season: StoredOffseason, state: SeasonState): Promise<void> {
  const client = dataClient()
  await savePlayers(season.careerId, playersOf(state))
  const { error } = await client.from('seasons').insert({
    career_id: season.careerId,
    year: state.year,
    club_id: season.clubId,
    seed: state.seed,
    phase: 'season',
    state,
    live: state.live,
  })
  // 23505 is a unique key: another request started this Season first.
  if (error?.code === '23505') throw createError({ statusCode: 409, message: 'errors.seasonMoved' })
  if (error) throw createError({ statusCode: 500, message: error.message })

  const cleared = await client
    .from('seasons')
    .update({ state: null })
    .eq('career_id', season.careerId)
    .lt('year', state.year)
    .not('state', 'is', null)
  if (cleared.error) throw createError({ statusCode: 500, message: cleared.error.message })
}

/** A finished Season's record, put back together from its two places (ADR-029). */
export async function loadRecord(careerId: string, year: number): Promise<SeasonRecord | null> {
  const client = dataClient()
  const season = await client
    .from('seasons')
    .select('record')
    .eq('career_id', careerId)
    .eq('year', year)
    .maybeSingle<{ record: StoredRecord | null }>()
  if (season.error) throw createError({ statusCode: 500, message: season.error.message })
  if (!season.data?.record) return null

  const rows: PlayerSeasonRow[] = []
  for (let from = 0; ; from += PLAYERS_PER_WRITE) {
    const page = await client
      .from('player_seasons')
      .select('player_id, goalie, roster_order, club_id, age, position, level, regular, playoffs')
      .eq('career_id', careerId)
      .eq('year', year)
      .order('player_id')
      .range(from, from + PLAYERS_PER_WRITE - 1)
      .returns<PlayerSeasonRow[]>()
    if (page.error) throw createError({ statusCode: 500, message: page.error.message })
    rows.push(...page.data)
    if (page.data.length < PLAYERS_PER_WRITE) break
  }
  return joinRecord(season.data.record, rows)
}

/** Everyone a Season knows by name: its Rosters and the prospects whose rights are held. */
function playersOf(state: SeasonState): Player[] {
  return [
    ...state.clubs.flatMap((club) => [...club.skaters, ...club.goalies]),
    ...state.prospects.map((prospect) => prospect.player),
  ]
}

/** Who each Player is, written once (D-11). A Player already known stays as he was. */
async function savePlayers(careerId: string, players: readonly Player[]): Promise<void> {
  const rows = players.map((player) => ({
    career_id: careerId,
    player_id: player.id,
    first_name: player.firstName,
    last_name: player.lastName,
    goalie: isGoalie(player),
  }))
  for (let i = 0; i < rows.length; i += PLAYERS_PER_WRITE) {
    const { error } = await dataClient()
      .from('players')
      .upsert(rows.slice(i, i + PLAYERS_PER_WRITE), { ignoreDuplicates: true })
    if (error) throw createError({ statusCode: 500, message: error.message })
  }
}

/**
 * Stores what a run of days produced. Results first: if the state then fails,
 * the same days play the same again and overwrite them, so nothing is lost.
 */
export async function saveDays(
  season: StoredSeason,
  days: readonly PlayedDay[],
): Promise<SeasonState> {
  const client = dataClient()
  const rows = days
    .flatMap((day) => day.played)
    .map(({ fixture, match, events }) => ({
      season_id: season.id,
      fixture_id: fixture.id,
      day: fixture.day,
      home_club_id: fixture.homeClubId,
      away_club_id: fixture.awayClubId,
      home_goals: match.result.homeGoals,
      away_goals: match.result.awayGoals,
      decided_in: match.result.decidedIn,
      stats: plainMatchStats(match),
      // Only the Manager's own Fixtures keep their stream (ADR-017).
      events:
        fixture.homeClubId === season.clubId || fixture.awayClubId === season.clubId
          ? events
          : null,
    }))

  for (let i = 0; i < rows.length; i += RESULTS_PER_INSERT) {
    const { error } = await client
      .from('fixture_results')
      .upsert(rows.slice(i, i + RESULTS_PER_INSERT))
    if (error) throw createError({ statusCode: 500, message: error.message })
  }

  const notices = days.flatMap((day, i) =>
    noticesOf(days[i - 1]?.state ?? season.state, day, season.clubId).map(
      ({ kind, day: on, ...data }) => ({ season_id: season.id, day: on, kind, data }),
    ),
  )
  const state = days.at(-1)?.state ?? season.state
  await saveState(season, state)
  // After the state, since a retry would otherwise tell the same news twice.
  if (notices.length > 0) {
    const { error } = await client.from('notices').insert(notices)
    if (error) throw createError({ statusCode: 500, message: error.message })
  }
  return state
}

/** The version refuses a change made from a state that has since moved on. */
export async function saveState(season: StoredSeason, state: SeasonState): Promise<void> {
  const { data, error } = await dataClient()
    .from('seasons')
    .update({
      state,
      live: state.live,
      version: season.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', season.id)
    .eq('version', season.version)
    .select('id')
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (data.length === 0) throw createError({ statusCode: 409, message: 'errors.seasonMoved' })
}

/** Stores only the progress of a followed Fixture. */
export async function saveLive(season: StoredSeason, live: SeasonState['live']): Promise<number> {
  const version = season.version + 1
  const { data, error } = await dataClient()
    .from('seasons')
    .update({ live, version })
    .eq('id', season.id)
    .eq('version', season.version)
    .select('id')
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (data.length === 0) throw createError({ statusCode: 409, message: 'errors.seasonMoved' })
  return version
}

export function clubName(state: SeasonState, clubId: ClubId): string {
  return state.clubs.find((club) => club.id === clubId)?.name ?? clubId
}

export function playerNames(clubs: readonly Club[]): ReadonlyMap<PlayerId, string> {
  return new Map(
    clubs.flatMap((club) =>
      [...club.skaters, ...club.goalies].map((player) => [player.id, displayName(player)]),
    ),
  )
}

/** Those declared in a Club's Lineup who are out. They are replaced for the Fixture itself. */
function injuredInLineup(state: SeasonState, clubId: ClubId): string[] {
  const lineup = state.lineups[clubId]
  if (!lineup) return []
  const names = playerNames(state.clubs)
  return [
    lineup.starter,
    lineup.backup,
    ...lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
    ...lineup.pairings.flatMap((pairing) => [pairing.leftDefence, pairing.rightDefence]),
  ]
    .filter((id) => daysOut(state, id) > 0)
    .map((id) => names.get(id) ?? id)
}

/** What the home screen needs. The state itself never leaves the server (ADR-016). */
export function seasonSummary({ clubId, state }: StoredSeason) {
  const next = state.fixtures
    .slice(state.nextFixture)
    .find((fixture) => fixture.homeClubId === clubId || fixture.awayClubId === clubId)
  const row = state.standings.find((candidate) => candidate.clubId === clubId)
  const qualified = state.playoffs?.bracket.seeds.some((seed) => seed.clubId === clubId) ?? null

  return {
    phase: 'season' as const,
    year: state.year,
    clubId,
    clubName: clubName(state, clubId),
    day: state.fixtures[state.nextFixture]?.day ?? null,
    fixturesPlayed: state.nextFixture,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    otLosses: row?.otLosses ?? 0,
    points: row?.points ?? 0,
    gamesPlayed: row?.gamesPlayed ?? 0,
    inPlayoffs: state.playoffs !== null,
    qualified,
    over: isSeasonOver(state),
    champion: state.playoffs?.champion ? clubName(state, state.playoffs.champion) : null,
    playsNext: playsNext(state, clubId),
    following: liveFixture(state, clubId) !== null,
    injuredInLineup: injuredInLineup(state, clubId),
    next: next
      ? {
          id: next.id,
          day: next.day,
          atHome: next.homeClubId === clubId,
          opponent: clubName(state, next.homeClubId === clubId ? next.awayClubId : next.homeClubId),
        }
      : null,
  }
}

/** What the home screen needs between Seasons: how the Season just ended. */
export function offseasonSummary({ clubId, state: off }: StoredOffseason) {
  const ended = off.ended
  const row = ended.standings.find((candidate) => candidate.clubId === clubId)
  const [past] = clubHistory([recordOf(ended)], clubId)
  return {
    phase: 'offseason' as const,
    year: ended.year,
    nextYear: off.year,
    clubId,
    clubName: clubName(ended, clubId),
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    otLosses: row?.otLosses ?? 0,
    points: row?.points ?? 0,
    gamesPlayed: row?.gamesPlayed ?? 0,
    leagueRank: past?.leagueRank ?? null,
    playoffs: past?.playoffs ?? null,
    champion: clubName(ended, ended.playoffs!.champion!),
  }
}

export function currentSummary(season: CurrentSeason) {
  return season.phase === 'season' ? seasonSummary(season) : offseasonSummary(season)
}
