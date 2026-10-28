import { SKATER_ATTRIBUTE_KEYS } from '../domain/attributes.js'
import type { Club, Line, Lineup, Pairing, Unit } from '../domain/club.js'
import type { Strength } from '../domain/event.js'
import type { PlayerId, Skater } from '../domain/player.js'
import type { Rng } from '../rng/index.js'
import { weightedIndex } from './draw.js'

/**
 * Level 1 of the two-level loop (03-sim-engine.md): who is on the ice, and
 * for how long. `simulateFixture` drives it one Shift at a time and hands
 * each Shift to Level 2 (`possession.ts`).
 *
 * At even strength a Line and a Pairing take the ice. With a man advantage
 * either way, the special-teams Units do (ADR-009), and nobody in the box is
 * ever selected.
 *
 * D-03: nothing here is returned to the caller of the engine. End-of-match
 * fatigue is derivable from the `shift_change` events (clock deltas plus
 * `stamina`), the same way `src/stats` derives everything else.
 */

/**
 * Even-strength deployment weight by tier, most-used first. Provisional - #15
 * calibrates the shape. Nearly flat on purpose: the best forwards also carry
 * the power play and the kill, and FR-23's measured 1.62 tier-1/tier-4 ratio
 * is for all situations together. Pairings have no measured target yet.
 */
const LINE_DEPLOYMENT_WEIGHT: readonly number[] = [1.1, 1.03, 1.0, 1.0]
const PAIRING_DEPLOYMENT_WEIGHT: readonly number[] = [1.4, 1.15, 1.0]

/**
 * Deployment weight of the first and second special-teams Units - the first
 * power play takes about three quarters of the time. Provisional, unmeasured.
 */
const POWER_PLAY_UNIT_WEIGHT: readonly number[] = [3.0, 1.0]
const PENALTY_KILL_UNIT_WEIGHT: readonly number[] = [1.8, 1.0]

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

/** Below five a side, forwards leave the ice first, down to this many. */
const MIN_FORWARDS = 2

function clampFatigue(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function skaterQuality(skater: Skater): number {
  return mean(SKATER_ATTRIBUTE_KEYS.map((key) => skater.attributes[key]))
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

/** Weights for picking among a Club's own Lines, Pairings or Units, before any matchup bias. */
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

/** What one Club faces when the next Shift starts. */
export interface SideSituation {
  strength: Strength
  skaters: number
  /** Players in the box, who cannot take the ice. */
  boxed: ReadonlySet<PlayerId>
}

/** Who is on the ice for one Club. */
export interface OnIce {
  forwards: readonly PlayerId[]
  defence: readonly PlayerId[]
}

/** Player ids on the ice, forwards then defence - the `shift_change` order. */
export function onIceIds(onIce: OnIce): readonly PlayerId[] {
  return [...onIce.forwards, ...onIce.defence]
}

/** One Shift: who is on the ice for each Club, and for how many whole seconds at most. */
export interface ShiftSelection {
  home: OnIce
  away: OnIce
  seconds: number
}

export interface ShiftLoop {
  /** Selects the next Shift for the situation on the ice, at most `maxSeconds` long. */
  next(
    maxSeconds: number,
    situation: Readonly<Record<'home' | 'away', SideSituation>>,
  ): ShiftSelection
  /**
   * Applies fatigue for the seconds the Shift actually lasted. A change in
   * skater counts ends a Shift early, so this can be less than it planned.
   */
  played(selection: ShiftSelection, seconds: number): void
}

/** Every dressed Skater in Lineup order - Lines, then Pairings - with the role the slot gives. */
function dressedOrder(lineup: Lineup): readonly (readonly [PlayerId, boolean])[] {
  return [
    ...lineup.lines.flatMap((line) => playersOf(line).map((id) => [id, false] as const)),
    ...lineup.pairings.flatMap((pairing) =>
      playersOfPairing(pairing).map((id) => [id, true] as const),
    ),
  ]
}

/**
 * Brings a selection to exactly `count` Skaters. Short - because the box
 * emptied a unit - it fills from the dressed Skaters in Lineup order (ADR-009).
 * Long - below five a side - forwards leave first, weakest first, down to two.
 */
function fit(
  state: ClubState,
  selected: { forwards: PlayerId[]; defence: PlayerId[] },
  side: SideSituation,
): OnIce {
  const { forwards, defence } = selected
  const size = () => forwards.length + defence.length

  for (const [id, isDefence] of dressedOrder(state.lineup)) {
    if (size() >= side.skaters) break
    if (side.boxed.has(id) || forwards.includes(id) || defence.includes(id)) continue
    ;(isDefence ? defence : forwards).push(id)
  }

  const weakest = (ids: readonly PlayerId[]) =>
    ids.reduce(
      (low, id, i) =>
        skaterQuality(state.skaterById.get(id)!) < skaterQuality(state.skaterById.get(ids[low]!)!)
          ? i
          : low,
      0,
    )
  while (size() > side.skaters) {
    if (forwards.length > MIN_FORWARDS || defence.length === 0)
      forwards.splice(weakest(forwards), 1)
    else defence.splice(weakest(defence), 1)
  }

  return { forwards, defence }
}

function fromEvenStrength(
  state: ClubState,
  line: Line,
  pairing: Pairing,
  side: SideSituation,
): OnIce {
  return fit(
    state,
    {
      forwards: playersOf(line).filter((id) => !side.boxed.has(id)),
      defence: playersOfPairing(pairing).filter((id) => !side.boxed.has(id)),
    },
    side,
  )
}

/** A special-teams Unit: its first available Skaters in order, by natural position. */
function fromUnit(state: ClubState, unit: Unit, side: SideSituation): OnIce {
  const forwards: PlayerId[] = []
  const defence: PlayerId[] = []
  for (const id of unit.skaters.filter((id) => !side.boxed.has(id)).slice(0, side.skaters)) {
    const position = state.skaterById.get(id)!.preferredPositions[0]
    ;(position === 'LD' || position === 'RD' ? defence : forwards).push(id)
  }
  return fit(state, { forwards, defence }, side)
}

/**
 * The shift loop for one Fixture. Stateful only within the Fixture that
 * created it - fatigue carries from Shift to Shift and Period to Period.
 * Overtime is #6.
 */
export function createShiftLoop(
  home: { club: Club; lineup: Lineup },
  away: { club: Club; lineup: Lineup },
  rng: Rng,
): ShiftLoop {
  const homeState = buildClubState(home.club, home.lineup)
  const awayState = buildClubState(away.club, away.lineup)
  const homeRng = rng.fork('home')
  const awayRng = rng.fork('away')

  return { next, played }

  function lineWeights(state: ClubState): number[] {
    return baseWeights(state, 4, LINE_DEPLOYMENT_WEIGHT, (i) => playersOf(state.lineup.lines[i]!))
  }

  function pairingWeights(state: ClubState): number[] {
    return baseWeights(state, 3, PAIRING_DEPLOYMENT_WEIGHT, (i) =>
      playersOfPairing(state.lineup.pairings[i]!),
    )
  }

  /** The power-play or penalty-kill Unit for a Club with an advantage either way. */
  function specialUnit(state: ClubState, unitRng: Rng, side: SideSituation): OnIce {
    const powerPlay = side.strength === 'powerplay'
    const units = powerPlay ? state.lineup.powerPlayUnits : state.lineup.penaltyKillUnits
    const weights = baseWeights(
      state,
      units.length,
      powerPlay ? POWER_PLAY_UNIT_WEIGHT : PENALTY_KILL_UNIT_WEIGHT,
      (i) => units[i]!.skaters,
    )
    return fromUnit(state, units[weightedIndex(unitRng, weights)]!, side)
  }

  function next(
    maxSeconds: number,
    situation: Readonly<Record<'home' | 'away', SideSituation>>,
  ): ShiftSelection {
    // Away always selects first, blind (spec: home has last change).
    let awayLine: Line | null = null
    let awayPairing: Pairing | null = null
    let awayOnIce: OnIce
    if (situation.away.strength === 'even') {
      awayLine = awayState.lineup.lines[weightedIndex(awayRng, lineWeights(awayState))]!
      awayPairing = awayState.lineup.pairings[weightedIndex(awayRng, pairingWeights(awayState))]!
      awayOnIce = fromEvenStrength(awayState, awayLine, awayPairing, situation.away)
    } else {
      awayOnIce = specialUnit(awayState, awayRng, situation.away)
    }

    let homeOnIce: OnIce
    if (situation.home.strength === 'even') {
      const homeLineWeights = lineWeights(homeState)
      const homePairingWeights = pairingWeights(homeState)

      // Home selects with the away unit already committed. Matchups exist
      // only at even strength - special teams are not chosen to match.
      if (awayLine && awayPairing) {
        const policy = home.lineup.tactics.matchup
        const awayLineQuality = unitQuality(awayState, playersOf(awayLine))
        const awayPairingQuality = unitQuality(awayState, playersOfPairing(awayPairing))
        const awayLineAvg = mean(
          awayState.lineup.lines.map((l) => unitQuality(awayState, playersOf(l))),
        )
        const awayPairingAvg = mean(
          awayState.lineup.pairings.map((p) => unitQuality(awayState, playersOfPairing(p))),
        )

        // exploit: away's committed Pairing is weaker than its own average -> favour home's top Line.
        if (policy === 'exploit' && awayPairingQuality < awayPairingAvg) {
          homeLineWeights[0] = homeLineWeights[0]! * MATCHUP_BIAS_MULTIPLIER
        }
        // shutdown: away's committed Line is stronger than its own average -> favour home's top Pairing.
        if (policy === 'shutdown' && awayLineQuality > awayLineAvg) {
          homePairingWeights[0] = homePairingWeights[0]! * MATCHUP_BIAS_MULTIPLIER
        }
      }

      const homeLine = homeState.lineup.lines[weightedIndex(homeRng, homeLineWeights)]!
      const homePairing = homeState.lineup.pairings[weightedIndex(homeRng, homePairingWeights)]!
      homeOnIce = fromEvenStrength(homeState, homeLine, homePairing, situation.home)
    } else {
      homeOnIce = specialUnit(homeState, homeRng, situation.home)
    }

    const homeTarget = targetShiftSeconds(
      home.lineup.tactics.shiftLength,
      unitFatigue(homeState, onIceIds(homeOnIce)),
    )
    const awayTarget = targetShiftSeconds(
      away.lineup.tactics.shiftLength,
      unitFatigue(awayState, onIceIds(awayOnIce)),
    )
    const seconds = Math.min(Math.max(1, Math.round(Math.min(homeTarget, awayTarget))), maxSeconds)

    return { home: homeOnIce, away: awayOnIce, seconds }
  }

  function played(selection: ShiftSelection, seconds: number): void {
    applyFatigue(homeState, onIceIds(selection.home), seconds)
    applyFatigue(awayState, onIceIds(selection.away), seconds)
  }
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
