import { SKATER_ATTRIBUTE_KEYS } from '../domain/attributes.js'
import type { Club, Line, Lineup, Pairing, Unit } from '../domain/club.js'
import type { Strength } from '../domain/event.js'
import type { PlayerId, Skater } from '../domain/player.js'
import type { Rng } from '../rng/index.js'
import { weightedIndex } from './draw.js'
import { afterShift } from './fatigue.js'
import { movedToBottom } from './lineup.js'

/**
 * Level 1 of the two-level loop (03-sim-engine.md): who is on the ice, and
 * for how long. `simulateFixture` drives it one Shift at a time and hands
 * each Shift to Level 2 (`possession.ts`).
 *
 * At even strength a Line and a Pairing take the ice. With a man advantage
 * either way, the special-teams Units do (ADR-009), and nobody in the box is
 * ever selected.
 *
 * D-03: fatigue leaves the engine only through the `match_end` event, so its
 * formula exists once (ADR-010).
 */

/**
 * Even-strength deployment weight by tier, most-used first. Provisional - #15
 * calibrates the shape. Nearly flat on purpose: the best forwards also carry
 * the power play and the kill, and FR-23's measured 1.62 tier-1/tier-4 ratio
 * is for all situations together. Pairings have no measured target yet.
 */
const LINE_DEPLOYMENT_WEIGHT: readonly number[] = [1.07, 1.03, 1.0, 1.0]
const PAIRING_DEPLOYMENT_WEIGHT: readonly number[] = [1.4, 1.15, 1.0]

/**
 * Deployment weight of the first and second special-teams Units - the first
 * power play takes about three quarters of the time. Provisional, unmeasured.
 */
const POWER_PLAY_UNIT_WEIGHT: readonly number[] = [3.0, 1.0]
const PENALTY_KILL_UNIT_WEIGHT: readonly number[] = [1.8, 1.0]
/** Deployment weight of the first overtime trio; every later trio weighs 1. Provisional, unmeasured. */
const FIRST_OVERTIME_TRIO_WEIGHT = 1.3

/** Target shift length in seconds at shiftLength=0 and shiftLength=100. Higher dial, shorter shifts. */
const BASE_SHIFT_SECONDS_LONG = 60
const BASE_SHIFT_SECONDS_SHORT = 30

/** Fraction a fully-fatigued (100) unit shortens its own target shift by. */
const FATIGUE_SHIFT_SHORTEN_MAX = 0.3

/** Multiplier applied to the targeted unit's weight when a matchup policy finds an opening. */
const MATCHUP_BIAS_MULTIPLIER = 2.5

/** Below five a side, forwards leave the ice first, down to this many. */
const MIN_FORWARDS = 2

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
  injured: Set<PlayerId>
}

function buildClubState(club: Club, lineup: Lineup): ClubState {
  const skaterById = new Map(club.skaters.map((s) => [s.id, s]))
  const fatigue = new Map(club.skaters.map((s) => [s.id, s.fatigue]))
  return { club, lineup, skaterById, fatigue, injured: new Set() }
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
  /** Skaters to put out - more than the penalties allow when the Goalie is pulled. */
  skaters: number
  /** Players in the box, who cannot take the ice. */
  boxed: ReadonlySet<PlayerId>
  /** Regular-season overtime: level play uses the overtime trios (FR-09). */
  threeOnThree: boolean
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
  /** Mean fatigue of each unit as it takes the ice, 0-100. */
  fatigue: Readonly<Record<'home' | 'away', number>>
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
  /** Every Skater on both Rosters as things stand, to two decimals. */
  fatigue(): Record<PlayerId, number>
  /**
   * Takes a Skater out for the rest of the Fixture. Everyone below moves up,
   * and the slot left at the bottom fills from the dressed Skaters (ADR-012).
   */
  injure(side: 'home' | 'away', playerId: PlayerId): void
  injured(side: 'home' | 'away'): ReadonlySet<PlayerId>
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
 * created it - fatigue carries from Shift to Shift and Period to Period,
 * through every overtime (FR-09a).
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

  return { next, played, fatigue, injure, injured }

  /** The power-play or penalty-kill Unit for a Club with an advantage either way. */
  function specialUnit(state: ClubState, unitRng: Rng, side: SideSituation): OnIce {
    const powerPlay = side.strength === 'powerplay'
    const units = powerPlay ? state.lineup.powerPlayUnits : state.lineup.penaltyKillUnits
    const weights = powerPlay ? POWER_PLAY_UNIT_WEIGHT : PENALTY_KILL_UNIT_WEIGHT
    const index = weightedIndex(unitRng, weights.slice(0, units.length))
    return fromUnit(state, units[index]!, side)
  }

  /** A trio from the Lineup's overtime rotation, for level 3-on-3 play. */
  function overtimeTrio(state: ClubState, trioRng: Rng, side: SideSituation): OnIce {
    const trios = state.lineup.overtimeRotation
    const weights = trios.map((_, i) => (i === 0 ? FIRST_OVERTIME_TRIO_WEIGHT : 1))
    return fromUnit(state, { skaters: trios[weightedIndex(trioRng, weights)]!.players }, side)
  }

  function next(
    maxSeconds: number,
    situation: Readonly<Record<'home' | 'away', SideSituation>>,
  ): ShiftSelection {
    // Away always selects first, blind (spec: home has last change).
    let awayLine: Line | null = null
    let awayPairing: Pairing | null = null
    let awayOnIce: OnIce
    if (situation.away.strength === 'even' && situation.away.threeOnThree) {
      awayOnIce = overtimeTrio(awayState, awayRng, situation.away)
    } else if (situation.away.strength === 'even') {
      awayLine = awayState.lineup.lines[weightedIndex(awayRng, LINE_DEPLOYMENT_WEIGHT)]!
      awayPairing = awayState.lineup.pairings[weightedIndex(awayRng, PAIRING_DEPLOYMENT_WEIGHT)]!
      awayOnIce = fromEvenStrength(awayState, awayLine, awayPairing, situation.away)
    } else {
      awayOnIce = specialUnit(awayState, awayRng, situation.away)
    }

    let homeOnIce: OnIce
    if (situation.home.strength === 'even' && situation.home.threeOnThree) {
      homeOnIce = overtimeTrio(homeState, homeRng, situation.home)
    } else if (situation.home.strength === 'even') {
      const homeLineWeights = [...LINE_DEPLOYMENT_WEIGHT]
      const homePairingWeights = [...PAIRING_DEPLOYMENT_WEIGHT]

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

    const fatigue = {
      home: unitFatigue(homeState, onIceIds(homeOnIce)),
      away: unitFatigue(awayState, onIceIds(awayOnIce)),
    }
    const homeTarget = targetShiftSeconds(home.lineup.tactics.shiftLength, fatigue.home)
    const awayTarget = targetShiftSeconds(away.lineup.tactics.shiftLength, fatigue.away)
    const seconds = Math.min(Math.max(1, Math.round(Math.min(homeTarget, awayTarget))), maxSeconds)

    return { home: homeOnIce, away: awayOnIce, seconds, fatigue }
  }

  function played(selection: ShiftSelection, seconds: number): void {
    applyFatigue(homeState, onIceIds(selection.home), seconds)
    applyFatigue(awayState, onIceIds(selection.away), seconds)
  }

  function injure(side: 'home' | 'away', playerId: PlayerId): void {
    const state = side === 'home' ? homeState : awayState
    state.injured.add(playerId)
    state.lineup = movedToBottom(state.lineup, playerId)
  }

  function injured(side: 'home' | 'away'): ReadonlySet<PlayerId> {
    return (side === 'home' ? homeState : awayState).injured
  }

  function fatigue(): Record<PlayerId, number> {
    const round = (value: number) => Math.round(value * 100) / 100
    return Object.fromEntries(
      [...homeState.fatigue, ...awayState.fatigue].map(([id, value]) => [id, round(value)]),
    )
  }
}

function applyFatigue(state: ClubState, onIce: readonly PlayerId[], seconds: number): void {
  for (const id of onIce) {
    const stamina = state.skaterById.get(id)!.attributes.stamina
    state.fatigue.set(id, afterShift(state.fatigue.get(id)!, seconds, stamina))
  }
}
