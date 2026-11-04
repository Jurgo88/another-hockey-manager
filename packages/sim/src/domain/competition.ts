import type { ClubId } from './player.js'
import type { OvertimeRegime } from './playoff.js'

export type ConferenceId = string
export type DivisionId = string
export type CompetitionId = string
export type SeasonId = string

export interface Division {
  id: DivisionId
  name: string
  conferenceId: ConferenceId
  clubIds: readonly ClubId[]
}

export interface Conference {
  id: ConferenceId
  name: string
  divisionIds: readonly DivisionId[]
}

/**
 * How many times two Clubs meet, and how the venues split.
 *
 * The NHL 2026-27 key (84 games, 42 home / 42 away):
 *   - divisional (7 opponents):        4 games, 2 home / 2 away  = 28
 *   - same conference, other division: 3 games, unbalanced       = 24
 *     (4 opponents at 2 home / 1 away, 4 opponents at 1 home / 2 away)
 *   - non-conference (16 opponents):   2 games, 1 home / 1 away  = 32
 */
export interface ScheduleKey {
  divisional: { games: number; home: number }
  intraConference: { games: number; homeHeavy: number; awayHeavy: number }
  interConference: { games: number; home: number }
}

/** How the rounds of a schedule spread over the calendar (ADR-010). */
export interface ScheduleCalendar {
  /** Days one round spans. */
  daysPerRound: number
  /** Chance a Fixture falls on the last day of its round rather than the first. */
  lastDayShare: number
  /** Days from the first day of one Season to the first day of the next (#85). */
  daysPerYear: number
}

export interface CompetitionStructure {
  id: CompetitionId
  name: string
  /** The season this alignment describes, e.g. '2026-27'. */
  season: string
  conferences: readonly Conference[]
  divisions: readonly Division[]
  scheduleKey: ScheduleKey
  calendar: ScheduleCalendar
  /** How a level regular-season Fixture is decided, or null when ties stand (FR-09b). */
  overtime: OvertimeRegime | null
}

/** Total regular-season Fixtures per Club implied by a key. */
export function gamesPerClub(key: ScheduleKey, divisionSize: number, conferenceSize: number): number {
  const divisionalOpponents = divisionSize - 1
  const intraConferenceOpponents = conferenceSize - divisionSize
  const interConferenceOpponents = conferenceSize // the other conference, same size
  return (
    divisionalOpponents * key.divisional.games +
    intraConferenceOpponents * key.intraConference.games +
    interConferenceOpponents * key.interConference.games
  )
}
