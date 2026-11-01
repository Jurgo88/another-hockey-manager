import type { ClubId, SeasonState } from '@ahm/sim'

export interface StoredSeason {
  id: string
  clubId: ClubId
  state: SeasonState
}

interface SeasonRow {
  id: string
  club_id: string
  state: SeasonState
}

export async function loadSeason(managerId: string): Promise<StoredSeason | null> {
  const { data, error } = await dataClient()
    .from('seasons')
    .select('id, club_id, state')
    .eq('manager_id', managerId)
    .maybeSingle<SeasonRow>()
  if (error) throw createError({ statusCode: 500, message: error.message })
  return data && { id: data.id, clubId: data.club_id, state: data.state }
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

/** What the home screen needs. The state itself never leaves the server (ADR-016). */
export function seasonSummary({ clubId, state }: StoredSeason) {
  const nameOf = (id: ClubId) => state.clubs.find((club) => club.id === id)?.name ?? id
  const next = state.fixtures
    .slice(state.nextFixture)
    .find((fixture) => fixture.homeClubId === clubId || fixture.awayClubId === clubId)
  const row = state.standings.find((candidate) => candidate.clubId === clubId)

  return {
    clubId,
    clubName: nameOf(clubId),
    fixturesPlayed: state.nextFixture,
    points: row?.points ?? 0,
    gamesPlayed: row?.gamesPlayed ?? 0,
    next: next
      ? {
          day: next.day,
          atHome: next.homeClubId === clubId,
          opponent: nameOf(next.homeClubId === clubId ? next.awayClubId : next.homeClubId),
        }
      : null,
  }
}
