import type { Club, Lineup } from '../domain/club.js'
import type { MatchEvent, Period } from '../domain/event.js'
import type { FixtureInput } from '../domain/fixture.js'
import type { ClubId, Goalie, PlayerId, Skater } from '../domain/player.js'
import { createRng, type Rng } from '../rng/index.js'
import { resolveShiftPossessions, type OnIceUnit } from './possession.js'
import { applyShiftFatigue, createShiftState, selectShift, type ShiftState } from './shift-loop.js'

/**
 * The engine entry point (FR-01, D-01).
 *
 * Pure: the same `(input, seed)` pair always produces a byte-identical event
 * stream (FR-02). A Season forks one stream per Fixture from the Season seed
 * before calling this (D-08).
 *
 * Regulation only for now. Overtime and the shootout are issue #6, penalties
 * and special teams issue #5, so every event here is even strength and a
 * Fixture may end level.
 */

const PERIOD_SECONDS = 1200
const PERIODS: readonly Period[] = [1, 2, 3]

function goalieFor(club: Club, lineup: Lineup): Goalie {
  const starter = club.goalies.find((g) => g.id === lineup.starter)
  if (!starter) throw new Error(`Lineup starter ${lineup.starter} is not a Goalie on ${club.id}`)
  return starter
}

function onIceUnit(
  state: ShiftState,
  goalie: Goalie,
  onIce: readonly PlayerId[],
): OnIceUnit {
  const skaters: Skater[] = onIce.map((id) => {
    const skater = state.skaterById.get(id)
    if (!skater) throw new Error(`Skater ${id} is not on ${state.club.id}`)
    return skater
  })
  return { clubId: state.club.id, skaters, goalie, tactics: state.lineup.tactics }
}

export function simulateFixture(input: FixtureInput, seed: number): MatchEvent[] {
  const { homeClub, awayClub, homeLineup, awayLineup } = input

  const rng = createRng(seed)
  const homeRng: Rng = rng.fork('shifts:home')
  const awayRng: Rng = rng.fork('shifts:away')
  const playRng: Rng = rng.fork('play')

  const home = createShiftState(homeClub, homeLineup)
  const away = createShiftState(awayClub, awayLineup)
  const homeGoalie = goalieFor(homeClub, homeLineup)
  const awayGoalie = goalieFor(awayClub, awayLineup)

  const events: MatchEvent[] = []
  let clock = 0
  let homeGoals = 0
  let awayGoals = 0
  let possession: ClubId = homeClub.id

  for (const period of PERIODS) {
    const periodEnd = clock + PERIOD_SECONDS
    events.push({ type: 'period_start', clock, period, strength: 'even' })

    // Every period opens with a faceoff, and play resumes from one after a whistle.
    let faceoffPending = true

    while (clock < periodEnd) {
      const selection = selectShift(home, away, homeRng, awayRng)
      const seconds = Math.min(selection.seconds, periodEnd - clock)

      events.push({
        type: 'shift_change',
        clock,
        period,
        strength: 'even',
        clubId: homeClub.id,
        onIce: selection.homeOnIce,
      })
      events.push({
        type: 'shift_change',
        clock,
        period,
        strength: 'even',
        clubId: awayClub.id,
        onIce: selection.awayOnIce,
      })

      const result = resolveShiftPossessions(
        {
          home: onIceUnit(home, homeGoalie, selection.homeOnIce),
          away: onIceUnit(away, awayGoalie, selection.awayOnIce),
          clock,
          seconds,
          deadline: periodEnd,
          period,
          possession,
          faceoffPending,
        },
        playRng,
      )

      for (const event of result.events) {
        if (event.type === 'goal') {
          if (event.clubId === homeClub.id) homeGoals++
          else awayGoals++
        }
      }
      events.push(...result.events)
      possession = result.possession
      faceoffPending = result.faceoffPending

      // The possession in progress when the Shift expired was played out, so
      // the real Shift is however long the clock actually moved.
      const actualSeconds = Math.max(result.clock - clock, seconds)
      applyShiftFatigue(home, selection.homeOnIce, actualSeconds)
      applyShiftFatigue(away, selection.awayOnIce, actualSeconds)

      clock = Math.min(Math.max(result.clock, clock + seconds), periodEnd)
    }

    events.push({ type: 'period_end', clock, period, strength: 'even', homeGoals, awayGoals })
  }

  return events
}
