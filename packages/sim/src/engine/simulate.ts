import type { MatchEvent } from '../domain/event.js'
import type { Fixture, FixtureInput } from '../domain/fixture.js'
import { createRng, type Rng } from '../rng/index.js'
import { createPenaltyBox, type Side } from './penalties.js'
import { createPossessionModel } from './possession.js'
import { createShiftLoop, onIceIds, type SideSituation } from './shift-loop.js'

/**
 * The engine's entry point (03-sim-engine.md).
 *
 * Pure (D-01): no I/O, no clock reads, no ambient state. The same input and
 * seed always yield the same array. The event stream is the only output
 * (D-03) - no score, no box score, nothing computed alongside it.
 *
 * Regulation only. A level Fixture ends level until overtime and the
 * shootout arrive in #6, and penalties still running at the end of the third
 * Period close with it.
 */

const PERIOD_LENGTH = 1200
const REGULATION_PERIODS = [1, 2, 3] as const

export function simulateFixture(input: FixtureInput, seed: number): MatchEvent[] {
  const rng = createRng(seed)
  const shifts = createShiftLoop(
    { club: input.homeClub, lineup: input.homeLineup },
    { club: input.awayClub, lineup: input.awayLineup },
    rng.fork('shifts'),
  )
  const clubIds = { home: input.homeClub.id, away: input.awayClub.id }
  const box = createPenaltyBox(clubIds)
  const play = createPossessionModel(input, box, rng.fork('play'))
  const events: MatchEvent[] = []

  const situation = (side: Side): SideSituation => ({
    strength: box.strength(side),
    skaters: box.skaters(side),
    boxed: box.boxed(side),
  })

  for (const period of REGULATION_PERIODS) {
    const start = (period - 1) * PERIOD_LENGTH
    const end = period * PERIOD_LENGTH
    events.push({ type: 'period_start', clock: start, period, strength: box.strength('home') })
    play.startPeriod()

    let clock = start
    while (clock < end) {
      // A Shift never runs past a penalty expiring: the Units must change.
      box.expire(clock, period, events)
      const until = Math.min(end, box.nextExpiry())
      const shift = shifts.next(until - clock, { home: situation('home'), away: situation('away') })

      for (const side of ['home', 'away'] as const) {
        events.push({
          type: 'shift_change',
          clock,
          period,
          strength: box.strength(side),
          clubId: clubIds[side],
          onIce: onIceIds(shift[side]),
        })
      }

      const reached = play.playShift(shift, clock, clock + shift.seconds, period, events)
      shifts.played(shift, reached - clock)
      clock = reached
    }

    if (period === REGULATION_PERIODS.at(-1)) box.close(end, period, events)
    const goals = play.goals()
    events.push({
      type: 'period_end',
      clock: end,
      period,
      strength: box.strength('home'),
      homeGoals: goals.home,
      awayGoals: goals.away,
    })
  }

  return events
}

/**
 * The seed a Season gives one Fixture (D-08). Derived from the Fixture's id,
 * not its position, so re-scheduling or adding a Club does not perturb the
 * other Fixtures. Stored on the `Match` so any Fixture can be replayed alone.
 */
export function fixtureSeed(seasonRng: Rng, fixture: Fixture): number {
  return seasonRng.fork(`fixture:${fixture.id}`).int(0, 0xffffffff)
}
