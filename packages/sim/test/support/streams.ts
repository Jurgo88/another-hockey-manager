import type { MatchEvent, ShiftChangeEvent } from '../../src/domain/event.js'
import type { Fixture } from '../../src/domain/fixture.js'
import type { ClubId } from '../../src/domain/player.js'

const PERIOD_LENGTH = 1200

export function fixtureBetween(homeClubId: ClubId, awayClubId: ClubId, id = 'f1'): Fixture {
  return {
    id,
    competitionId: 'nhl',
    seasonId: 's1',
    round: 0,
    homeClubId,
    awayClubId,
    allowsTie: false,
  }
}

/**
 * Wraps the shift loop's output in three regulation Periods. `runShiftLoop`
 * emits `shift_change` events only; `simulateFixture` (#4) will emit the
 * Period boundaries itself, and this helper goes away with it.
 */
export function inRegulationPeriods(shifts: readonly ShiftChangeEvent[]): MatchEvent[] {
  const events: MatchEvent[] = []
  let next = 0

  for (const period of [1, 2, 3] as const) {
    const start = (period - 1) * PERIOD_LENGTH
    const end = period * PERIOD_LENGTH
    events.push({ type: 'period_start', clock: start, period, strength: 'even' })
    while (next < shifts.length && shifts[next]!.clock < end) events.push(shifts[next++]!)
    events.push({
      type: 'period_end',
      clock: end,
      period,
      strength: 'even',
      homeGoals: 0,
      awayGoals: 0,
    })
  }

  return events
}
