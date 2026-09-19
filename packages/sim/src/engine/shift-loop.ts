import { SKATER_ATTRIBUTE_KEYS } from '../domain/attributes.js'
import type { Club, Line, Lineup, Pairing } from '../domain/club.js'
import type { Period, ShiftChangeEvent } from '../domain/event.js'
import type { PlayerId, Skater } from '../domain/player.js'
import type { Rng } from '../rng/index.js'

/**
 * Level 1 of the two-level loop (03-sim-engine.md): who is on the ice, and
 * for how long. Level 2 (possession resolution, issue #4) does not exist
 * yet, so this only produces `shift_change` events - no shots, no goals, no
 * stoppages. `strength` is always 'even': special teams are issue #5.
 *
 * D-03: the only output is the event stream. Ending-of-match fatigue is not
 * returned separately - it is derivable from the `shift_change` events
 * themselves (clock deltas plus `stamina`), the same way `src/stats` will
 * derive everything else.
 */

const REGULATION_SECONDS = 3 * 1200
const PERIOD_LENGTH = 1200

/**
 * Deployment weight by tier, most-used first. Provisional - #15 calibrates
 * the shape. The Line ratio is seeded from FR-23's measured tier-1/tier-4
 * ice-time ratio (1.62); Pairings have no equivalent measured target yet.
 */
const LINE_DEPLOYMENT_WEIGHT: readonly number[] = [1.62, 1.35, 1.15, 1.0]
const PAIRING_DEPLOYMENT_WEIGHT: readonly number[] = [1.4, 1.15, 1.0]

/** Target shift length in seconds at shiftLength=0 and shiftLength=100. Higher dial, shorter shifts. */
const BASE_SHIFT_SECONDS_LONG = 60
const BASE_SHIFT_SECONDS_SHORT = 30

/** Fraction a fully-fatigued (100) unit shortens its own target shift by. */
const FATIGUE_SHIFT_SHORTEN_MAX = 0.3

/** How strongly fatigue depresses a unit's chance of being picked next. */
const FATIGUE_SELECTION_SOFTENING = 1.5

/** Multiplier applied to the targeted unit's weight when a matchup policy finds an opening. */
const MATCHUP_BIAS_MULTIPLIER = 2.5

/** Fatigue points accrued per second on ice, before the stamina adjustment. */
const FATIGUE_ACCRUAL_PER_SECOND = 100 / (20 * 60)
/** Fatigue points recovered per second on the bench, before the stamina adjustment. */
const FATIGUE_RECOVERY_PER_SECOND = 100 / (12 * 60)

function clampFatigue(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function periodFor(clock: number): Period {
  if (clock < PERIOD_LENGTH) return 1
  if (clock < 2 * PERIOD_LENGTH) return 2
  return 3
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function skaterQuality(skater: Skater): number {
  return mean(SKATER_ATTRIBUTE_KEYS.map((key) => skater.attributes[key]))
}

/** Weighted-random index draw. Throws on an empty or all-zero weight array. */
function weightedIndex(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) throw new Error('weightedIndex: total weight must be positive')

  let draw = rng.next() * total
  for (let i = 0; i < weights.length; i++) {
    draw -= weights[i]!
    if (draw < 0) return i
  }
  return weights.length - 1
}

interface ClubState {
  club: Club
  lineup: Lineup
  skaterById: Map<PlayerId, Skater>
  fatigue: Map<PlayerId, number>
}

function buildClubState(club: Club, lineup: Lineup): ClubState {
  const skaterById = new Map(club.skaters.map((s) => [s.id, s]))
  const fatigue = new Map(club.skaters.map((s) => [s.id, s.fatigue]))
  return { club, lineup, skaterById, fatigue }
}

function playersOf(line: Line): readonly PlayerId[] {
  return [line.leftWing, line.centre, line.rightWing]
}

function playersOfPairing(pairing: Pairing): readonly PlayerId[] {
  return [pairing.leftDefence, pairing.rightDefence]
}

function unitQuality(state: ClubState, playerIds: readonly PlayerId[]): number {
  return mean(playerIds.map((id) => skaterQuality(state.skaterById.get(id)!)))
}

function unitFatigue(state: ClubState, playerIds: readonly PlayerId[]): number {
  return mean(playerIds.map((id) => state.fatigue.get(id)!))
}

function fatigueSelectionWeight(fatigue: number): number {
  return 1 / (1 + (fatigue / 100) * FATIGUE_SELECTION_SOFTENING)
}

/** Weights for picking among a Club's own Lines or Pairings, before any matchup bias. */
function baseWeights(
  state: ClubState,
  count: number,
  tierWeight: readonly number[],
  playersAt: (i: number) => readonly PlayerId[],
): number[] {
  return Array.from({ length: count }, (_, i) => {
    const fatigue = unitFatigue(state, playersAt(i))
    return tierWeight[i]! * fatigueSelectionWeight(fatigue)
  })
}

function targetShiftSeconds(shiftLengthDial: number, unitFatigue0to100: number): number {
  const base =
    BASE_SHIFT_SECONDS_LONG -
    (BASE_SHIFT_SECONDS_LONG - BASE_SHIFT_SECONDS_SHORT) * (shiftLengthDial / 100)
  const shorten = FATIGUE_SHIFT_SHORTEN_MAX * (unitFatigue0to100 / 100)
  return base * (1 - shorten)
}

/**
 * Runs the shift loop for one Fixture's regulation time (3 x 1200s).
 * Overtime (#6) and special teams (#5) are not modelled here.
 */
export function runShiftLoop(
  home: { club: Club; lineup: Lineup },
  away: { club: Club; lineup: Lineup },
  rng: Rng,
): readonly ShiftChangeEvent[] {
  const homeState = buildClubState(home.club, home.lineup)
  const awayState = buildClubState(away.club, away.lineup)
  const homeRng = rng.fork('home')
  const awayRng = rng.fork('away')

  const events: ShiftChangeEvent[] = []
  let clock = 0

  while (clock < REGULATION_SECONDS) {
    // Away always selects first, blind (spec: home has last change).
    const awayLineIdx = weightedIndex(
      awayRng,
      baseWeights(awayState, 4, LINE_DEPLOYMENT_WEIGHT, (i) => playersOf(awayState.lineup.lines[i]!)),
    )
    const awayPairingIdx = weightedIndex(
      awayRng,
      baseWeights(awayState, 3, PAIRING_DEPLOYMENT_WEIGHT, (i) =>
        playersOfPairing(awayState.lineup.pairings[i]!),
      ),
    )
    const awayLine = awayState.lineup.lines[awayLineIdx]!
    const awayPairing = awayState.lineup.pairings[awayPairingIdx]!

    // Home selects with the away unit already committed.
    const policy = home.lineup.tactics.matchup
    const awayLineQuality = unitQuality(awayState, playersOf(awayLine))
    const awayPairingQuality = unitQuality(awayState, playersOfPairing(awayPairing))
    const awayLineAvg = mean(
      awayState.lineup.lines.map((l) => unitQuality(awayState, playersOf(l))),
    )
    const awayPairingAvg = mean(
      awayState.lineup.pairings.map((p) => unitQuality(awayState, playersOfPairing(p))),
    )

    const homeLineWeights = baseWeights(homeState, 4, LINE_DEPLOYMENT_WEIGHT, (i) =>
      playersOf(homeState.lineup.lines[i]!),
    )
    const homePairingWeights = baseWeights(homeState, 3, PAIRING_DEPLOYMENT_WEIGHT, (i) =>
      playersOfPairing(homeState.lineup.pairings[i]!),
    )

    // exploit: away's committed Pairing is weaker than its own average -> favour home's top Line.
    if (policy === 'exploit' && awayPairingQuality < awayPairingAvg) {
      homeLineWeights[0] = homeLineWeights[0]! * MATCHUP_BIAS_MULTIPLIER
    }
    // shutdown: away's committed Line is stronger than its own average -> favour home's top Pairing.
    if (policy === 'shutdown' && awayLineQuality > awayLineAvg) {
      homePairingWeights[0] = homePairingWeights[0]! * MATCHUP_BIAS_MULTIPLIER
    }

    const homeLineIdx = weightedIndex(homeRng, homeLineWeights)
    const homePairingIdx = weightedIndex(homeRng, homePairingWeights)
    const homeLine = homeState.lineup.lines[homeLineIdx]!
    const homePairing = homeState.lineup.pairings[homePairingIdx]!

    const homeOnIce = [...playersOf(homeLine), ...playersOfPairing(homePairing)]
    const awayOnIce = [...playersOf(awayLine), ...playersOfPairing(awayPairing)]

    const homeTarget = targetShiftSeconds(
      home.lineup.tactics.shiftLength,
      unitFatigue(homeState, homeOnIce),
    )
    const awayTarget = targetShiftSeconds(
      away.lineup.tactics.shiftLength,
      unitFatigue(awayState, awayOnIce),
    )
    const remaining = REGULATION_SECONDS - clock
    const shiftSeconds = Math.min(homeTarget, awayTarget, remaining)

    const period = periodFor(clock)
    events.push({ type: 'shift_change', clock, period, strength: 'even', clubId: home.club.id, onIce: homeOnIce })
    events.push({ type: 'shift_change', clock, period, strength: 'even', clubId: away.club.id, onIce: awayOnIce })

    applyFatigue(homeState, homeOnIce, shiftSeconds)
    applyFatigue(awayState, awayOnIce, shiftSeconds)

    clock += shiftSeconds
  }

  return events
}

function applyFatigue(state: ClubState, onIce: readonly PlayerId[], seconds: number): void {
  const onIceSet = new Set(onIce)
  for (const skater of state.club.skaters) {
    const current = state.fatigue.get(skater.id)!
    const staminaFactor = (21 - skater.attributes.stamina) / 20
    const next = onIceSet.has(skater.id)
      ? current + FATIGUE_ACCRUAL_PER_SECOND * seconds * staminaFactor
      : current - FATIGUE_RECOVERY_PER_SECOND * seconds * (2 - staminaFactor)
    state.fatigue.set(skater.id, clampFatigue(next))
  }
}
