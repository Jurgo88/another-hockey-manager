import type { Club, ClubId, PlayedDay, PlayerId, SeasonState } from '@ahm/sim'
import { displayName, isSeasonOver, plainMatchStats, playsNext } from '@ahm/sim'

const RESULTS_PER_INSERT = 200

export interface StoredSeason {
  id: string
  clubId: ClubId
  version: number
  state: SeasonState
}

interface SeasonRow {
  id: string
  club_id: string
  version: number
  state: SeasonState
}

export async function loadSeason(managerId: string): Promise<StoredSeason | null> {
  const { data, error } = await dataClient()
    .from('seasons')
    .select('id, club_id, version, state')
    .eq('manager_id', managerId)
    .maybeSingle<SeasonRow>()
  if (error) throw createError({ statusCode: 500, message: error.message })
  return data && { id: data.id, clubId: data.club_id, version: data.version, state: data.state }
}

export async function requireSeason(managerId: string): Promise<StoredSeason> {
  const season = await loadSeason(managerId)
  if (!season) throw createError({ statusCode: 404, message: 'errors.noSeason' })
  return season
}

/** A Manager has one Season at a time, so a new one replaces the old. */
export async function replaceSeason(
  managerId: string,
  clubId: ClubId,
  state: SeasonState,
): Promise<void> {
  const client = dataClient()
  const removed = await client.from('seasons').delete().eq('manager_id', managerId)
  if (removed.error) throw createError({ statusCode: 500, message: removed.error.message })

  const { error } = await client
    .from('seasons')
    .insert({ manager_id: managerId, club_id: clubId, seed: state.seed, state })
  if (error) throw createError({ statusCode: 500, message: error.message })
}

/**
 * Stores what a run of days produced. Results first: if the state then fails,
 * the same days play the same again and overwrite them, so nothing is lost.
 * The version refuses a second advance that started from the same state.
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

  const state = days.at(-1)?.state ?? season.state
  const { data, error } = await client
    .from('seasons')
    .update({ state, version: season.version + 1, updated_at: new Date().toISOString() })
    .eq('id', season.id)
    .eq('version', season.version)
    .select('id')
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (data.length === 0) throw createError({ statusCode: 409, message: 'errors.seasonMoved' })
  return state
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

/** What the home screen needs. The state itself never leaves the server (ADR-016). */
export function seasonSummary({ clubId, state }: StoredSeason) {
  const next = state.fixtures
    .slice(state.nextFixture)
    .find((fixture) => fixture.homeClubId === clubId || fixture.awayClubId === clubId)
  const row = state.standings.find((candidate) => candidate.clubId === clubId)
  const qualified = state.playoffs?.bracket.seeds.some((seed) => seed.clubId === clubId) ?? null

  return {
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
