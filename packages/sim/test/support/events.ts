import type { MatchEvent, ShiftChangeEvent } from '../../src/domain/event.js'

/** The clock play stopped at: the last `period_end` before any shootout. */
export function endOfPlay(events: readonly MatchEvent[]): number {
  return events.filter((e) => e.type === 'period_end' && e.period !== 'SO').at(-1)!.clock
}

/**
 * The Skaters the penalties allow this Club - those on the ice less an extra
 * attacker for a pulled Goalie, which is not a power play (ADR-009).
 */
export function skatersAllowed(shift: ShiftChangeEvent): number {
  return shift.onIce.length - (shift.goalie === null ? 1 : 0)
}
