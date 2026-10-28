import type { MatchEvent } from '../domain/event.js'
import type { Fixture, FixtureInput } from '../domain/fixture.js'
import { createRng, type Rng } from '../rng/index.js'
import { createPossessionModel } from './possession.js'
import { createShiftLoop, onIce } from './shift-loop.js'

/**
 * The engine's entry point (03-sim-engine.md).
 *
 * Pure (D-01): no I/O, no clock reads, no ambient state. The same input and
 * seed always yield the same array. The event stream is the only output
 * (D-03) - no score, no box score, nothing computed alongside it.
 *
 * Regulation only. A level Fixture ends level until overtime and the
 * shootout arrive in #6.
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
  const play = createPossessionModel(input, rng.fork('play'))
  const events: MatchEvent[] = []

  for (const period of REGULATION_PERIODS) {
    const start = (period - 1) * PERIOD_LENGTH
    const end = period * PERIOD_LENGTH
    events.push({ type: 'period_start', clock: start, period, strength: 'even' })
    play.startPeriod()

    let clock = start
    while (clock < end) {
      const shift = shifts.next(end - clock)
      const base = { type: 'shift_change', clock, period, strength: 'even' } as const
      events.push({
        ...base,
        clubId: input.homeClub.id,
        onIce: onIce(shift.homeLine, shift.homePairing),
      })
      events.push({
        ...base,
        clubId: input.awayClub.id,
        onIce: onIce(shift.awayLine, shift.awayPairing),
      })

      play.playShift(shift, clock, clock + shift.seconds, period, events)
      clock += shift.seconds
    }

    const goals = play.goals()
    events.push({
      type: 'period_end',
      clock: end,
      period,
      strength: 'even',
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
