import { SKATER_ATTRIBUTE_KEYS } from '../domain/attributes.js'
import type { Club, Line, Lineup, Pairing } from '../domain/club.js'
import type { PlayerId, Skater } from '../domain/player.js'
import type { Rng } from '../rng/index.js'

/**
 * Level 1 of the two-level loop (03-sim-engine.md): who is on the ice, and
 * for how long. The match clock itself belongs to `simulateFixture`, which
 * interleaves these selections with Level 2 possession resolution.
 *
 * Special teams are issue #5, so every deployment here is even strength.
 */

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

/** A Club's live deployment state for one Fixture: who is available and how tired they are. */
export interface ShiftState {
  club: Club
  lineup: Lineup
  skaterById: Map<PlayerId, Skater>
  fatigue: Map<PlayerId, number>
}

export function createShiftState(club: Club, lineup: Lineup): ShiftState {
  return {
    club,
    lineup,
    skaterById: new Map(club.skaters.map((s) => [s.id, s])),
    fatigue: new Map(club.skaters.map((s) => [s.id, s.fatigue])),
  }
}

function playersOf(line: Line): readonly PlayerId[] {
  return [line.leftWing, line.centre, line.rightWing]
}

function playersOfPairing(pairing: Pairing): readonly PlayerId[] {
  return [pairing.leftDefence, pairing.rightDefence]
}

function unitQuality(state: ShiftState, playerIds: readonly PlayerId[]): number {
  return mean(playerIds.map((id) => skaterQuality(state.skaterById.get(id)!)))
}

function unitFatigue(state: ShiftState, playerIds: readonly PlayerId[]): number {
  return mean(playerIds.map((id) => state.fatigue.get(id)!))
}

function fatigueSelectionWeight(fatigue: number): number {
  return 1 / (1 + (fatigue / 100) * FATIGUE_SELECTION_SOFTENING)
}

/** Weights for picking among a Club's own Lines or Pairings, before any matchup bias. */
function baseWeights(
  state: ShiftState,
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

export interface ShiftSelection {
  /** Three forwards then two defencemen. */
  homeOnIce: readonly PlayerId[]
  awayOnIce: readonly PlayerId[]
  /** Target duration before the caller clamps it to the period boundary. */
  seconds: number
}

/**
 * Picks both Clubs' units for the next Shift.
 *
 * The away Club selects blind; the home Club selects with that choice already
 * committed, which is the home-ice last change and the only structural source
 * of home advantage in the engine. The shared Shift lasts as long as whichever
 * Club wants to change sooner.
 */
export function selectShift(
  home: ShiftState,
  away: ShiftState,
  homeRng: Rng,
  awayRng: Rng,
): ShiftSelection {
  const awayLineIdx = weightedIndex(
    awayRng,
    baseWeights(away, 4, LINE_DEPLOYMENT_WEIGHT, (i) => playersOf(away.lineup.lines[i]!)),
  )
  const awayPairingIdx = weightedIndex(
    awayRng,
    baseWeights(away, 3, PAIRING_DEPLOYMENT_WEIGHT, (i) =>
      playersOfPairing(away.lineup.pairings[i]!),
    ),
  )
  const awayLine = away.lineup.lines[awayLineIdx]!
  const awayPairing = away.lineup.pairings[awayPairingIdx]!

  const policy = home.lineup.tactics.matchup
  const awayLineQuality = unitQuality(away, playersOf(awayLine))
  const awayPairingQuality = unitQuality(away, playersOfPairing(awayPairing))
  const awayLineAvg = mean(away.lineup.lines.map((l) => unitQuality(away, playersOf(l))))
  const awayPairingAvg = mean(
    away.lineup.pairings.map((p) => unitQuality(away, playersOfPairing(p))),
  )

  const homeLineWeights = baseWeights(home, 4, LINE_DEPLOYMENT_WEIGHT, (i) =>
    playersOf(home.lineup.lines[i]!),
  )
  const homePairingWeights = baseWeights(home, 3, PAIRING_DEPLOYMENT_WEIGHT, (i) =>
    playersOfPairing(home.lineup.pairings[i]!),
  )

  // exploit: away's committed Pairing is weaker than its own average -> favour home's top Line.
  if (policy === 'exploit' && awayPairingQuality < awayPairingAvg) {
    homeLineWeights[0] = homeLineWeights[0]! * MATCHUP_BIAS_MULTIPLIER
  }
  // shutdown: away's committed Line is stronger than its own average -> favour home's top Pairing.
  if (policy === 'shutdown' && awayLineQuality > awayLineAvg) {
    homePairingWeights[0] = homePairingWeights[0]! * MATCHUP_BIAS_MULTIPLIER
  }

  const homeLine = home.lineup.lines[weightedIndex(homeRng, homeLineWeights)]!
  const homePairing = home.lineup.pairings[weightedIndex(homeRng, homePairingWeights)]!

  const homeOnIce = [...playersOf(homeLine), ...playersOfPairing(homePairing)]
  const awayOnIce = [...playersOf(awayLine), ...playersOfPairing(awayPairing)]

  const seconds = Math.min(
    targetShiftSeconds(home.lineup.tactics.shiftLength, unitFatigue(home, homeOnIce)),
    targetShiftSeconds(away.lineup.tactics.shiftLength, unitFatigue(away, awayOnIce)),
  )

  return { homeOnIce, awayOnIce, seconds }
}

/** Accrues fatigue for the Skaters on the ice and recovers it for those on the bench. */
export function applyShiftFatigue(
  state: ShiftState,
  onIce: readonly PlayerId[],
  seconds: number,
): void {
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
