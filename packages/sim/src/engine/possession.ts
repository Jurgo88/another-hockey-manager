import type { Lineup, Tactics } from '../domain/club.js'
import type { MatchEvent, Period } from '../domain/event.js'
import type { FixtureInput } from '../domain/fixture.js'
import type { ClubId, Goalie, PlayerId, Skater } from '../domain/player.js'
import type { Rng } from '../rng/index.js'
import { logisticNoise, logit, sigmoid, weightedIndex } from './draw.js'
import { onIce, type ShiftSelection } from './shift-loop.js'

/**
 * Level 2 of the two-level loop (03-sim-engine.md): possessions inside a
 * Shift, resolved to events.
 *
 * Every probability is modelled in log-odds: a base rate plus attribute
 * edges. Attributes enter centred on the middle of the 1-20 scale, so a
 * difference of one attribute point moves log-odds by the same amount
 * anywhere on the scale - which is what lets a first Line compound its edge
 * over a fourth Line instead of saturating.
 *
 * **Every constant below is provisional** and belongs to calibration (#15).
 * Base rates are set so the league lands on the measured Tier 1 figures;
 * the slopes are judgement until Tier 2 constrains them. Constants with no
 * measured target say so.
 *
 * Special teams (#5), overtime and the empty net (#6) are not modelled here.
 * Every event is at even strength.
 */

// --- Pace ------------------------------------------------------------------

/** Mean length of one possession in seconds, for two average units. */
const POSSESSION_SECONDS = 12
/** How much faster play gets per unit of centred mean `speed` on the ice. */
const PACE_SPEED = 0.25
const MIN_POSSESSION_SECONDS = 2

// --- Outcome of a possession -----------------------------------------------

/** Log-odds that a possession between average units ends in a shot attempt. */
const ATTEMPT_BASE = logit(0.345)
/** Slope on the attacking unit's offence minus the defending unit's defence. */
const ATTEMPT_EDGE = 0.45
/** `shotVolume` at 100 adds this to attempt log-odds (and -this at 0). */
const SHOT_VOLUME_ATTEMPTS = 0.35
/** Own `aggression` at 100 adds this to attempts for. */
const AGGRESSION_FOR = 0.25
/** Opposition `aggression` at 100 adds this to attempts against it - structure traded away. */
const AGGRESSION_AGAINST = 0.15

/** Share of non-attempt possessions that end in icing or offside. Unmeasured. */
const STOPPAGE_SHARE = 0.18
/** Share of non-attempt possessions recorded as a giveaway or takeaway. Unmeasured. */
const RECORDED_TURNOVER_SHARE = 0.12
/** Slope on defending `checking` against attacking `puckControl` for takeaway vs giveaway. */
const TAKEAWAY_EDGE = 1.0

// --- Shot attempt ----------------------------------------------------------

/** A defenceman's pull on the shooter draw relative to a forward. */
const DEFENCE_SHOOTER_WEIGHT = 0.5

/** Log-odds of a goal for a typical attempt against an average goalie. */
const DANGER_BASE = logit(0.141)
const DANGER_SHOOTER = 0.55
const DANGER_SUPPORT = 0.25
const DANGER_PRESSURE = 0.3
/** Point shots from the blue line are long and screened, not dangerous. */
const DANGER_POINT_SHOT = -0.9
/** `shotVolume` at 100 takes this off danger - more shots from distance. */
const SHOT_VOLUME_DANGER = 0.35
/** Spread of shot quality between attempts, in log-odds. */
const DANGER_SPREAD = 0.55

const BLOCK_BASE = logit(0.22)
const BLOCK_SKILL = 0.8
const BLOCK_POINT_SHOT = 0.6

const MISS_BASE = logit(0.27)
const MISS_SKILL = 0.8

/** After a block or a miss, chance the attacking Club recovers the loose puck. Unmeasured. */
const LOOSE_PUCK_RETAINED = 0.35

// --- Goalie ----------------------------------------------------------------

const GOALIE_POSITIONING = 0.55
const GOALIE_REFLEXES = 0.55
/** On a rebound the goalie is moving, so `recovery` replaces `positioning`. */
const GOALIE_RECOVERY = 0.55

const REBOUND_BASE = logit(0.12)
const REBOUND_CONTROL = 1.0
/** A rebound is a second look at an out-of-position goalie. */
const REBOUND_DANGER = 0.9

/** Chance a goalie freezes a save not followed by a rebound. Unmeasured. */
const FREEZE_SHARE = 0.45
/** Log-odds the defending Club gets a cleared puck, and the `puckHandling` slope on it. */
const CLEAR_BASE = logit(0.6)
const CLEAR_HANDLING = 0.8

// --- Faceoffs and assists --------------------------------------------------

const FACEOFF_EDGE = 1.0

/** Chance a goal has a first assist, and a second given a first. Unmeasured. */
const FIRST_ASSIST = 0.92
const SECOND_ASSIST = 0.82

/** An attribute centred on the middle of the 1-20 scale, roughly -1 to 1. */
function centred(value: number): number {
  return (value - 10.5) / 9.5
}

/** A Tactics dial from 0-100 to -1 to 1. */
function dial(value: number): number {
  return (value - 50) / 50
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

type Side = 'home' | 'away'

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home')

interface SideContext {
  clubId: ClubId
  tactics: Tactics
  goalie: Goalie
  skaterById: ReadonlyMap<PlayerId, Skater>
}

/** One unit's composites, computed once per Shift. Skaters are forwards then defence. */
interface Unit {
  skaters: readonly Skater[]
  centre: Skater
  offence: number
  defence: number
  speed: number
  support: number
  pressure: number
  blocking: number
  puckControl: number
  checking: number
}

function buildUnit(context: SideContext, ids: readonly PlayerId[]): Unit {
  const skaters = ids.map((id) => {
    const skater = context.skaterById.get(id)
    if (!skater) throw new Error(`Player ${id} is not a Skater of Club ${context.clubId}`)
    return skater
  })
  const avg = (read: (s: Skater) => number) => centred(mean(skaters.map(read)))

  return {
    skaters,
    centre: skaters[1]!,
    offence: avg(
      (s) =>
        (s.attributes.passing +
          s.attributes.puckControl +
          s.attributes.offPositioning +
          s.attributes.speed) /
        4,
    ),
    defence: avg(
      (s) => (s.attributes.defPositioning + s.attributes.checking + s.attributes.speed) / 3,
    ),
    speed: avg((s) => s.attributes.speed),
    support: avg((s) => s.attributes.passing),
    pressure: avg((s) => s.attributes.defPositioning),
    blocking: avg((s) => s.attributes.shotBlocking),
    puckControl: avg((s) => s.attributes.puckControl),
    checking: avg((s) => s.attributes.checking),
  }
}

function sideContext(
  clubId: ClubId,
  skaters: readonly Skater[],
  goalies: readonly Goalie[],
  lineup: Lineup,
): SideContext {
  const goalie = goalies.find((g) => g.id === lineup.starter)
  if (!goalie) throw new Error(`Starter ${lineup.starter} is not a Goalie of Club ${clubId}`)
  return {
    clubId,
    tactics: lineup.tactics,
    goalie,
    skaterById: new Map(skaters.map((s) => [s.id, s])),
  }
}

export interface PossessionModel {
  /** The puck is dropped at centre ice: the next possession starts with a faceoff. */
  startPeriod(): void
  /** Plays the Shift from `from` to `to`, appending its events. */
  playShift(
    shift: ShiftSelection,
    from: number,
    to: number,
    period: Period,
    events: MatchEvent[],
  ): void
  goals(): { home: number; away: number }
}

export function createPossessionModel(input: FixtureInput, rng: Rng): PossessionModel {
  const contexts: Record<Side, SideContext> = {
    home: sideContext(
      input.homeClub.id,
      input.homeClub.skaters,
      input.homeClub.goalies,
      input.homeLineup,
    ),
    away: sideContext(
      input.awayClub.id,
      input.awayClub.skaters,
      input.awayClub.goalies,
      input.awayLineup,
    ),
  }
  const score: Record<Side, number> = { home: 0, away: 0 }
  /** Who has the puck; null when play restarts with a faceoff. */
  let puck: Side | null = null

  return {
    startPeriod() {
      puck = null
    },

    goals() {
      return { ...score }
    },

    playShift(shift, from, to, period, events) {
      const units: Record<Side, Unit> = {
        home: buildUnit(contexts.home, onIce(shift.homeLine, shift.homePairing)),
        away: buildUnit(contexts.away, onIce(shift.awayLine, shift.awayPairing)),
      }
      const meanPossession =
        POSSESSION_SECONDS / (1 + PACE_SPEED * mean([units.home.speed, units.away.speed]))
      const base = { period, strength: 'even' as const }

      let clock = from
      while (clock < to) {
        if (puck === null) puck = faceoff(clock)

        const seconds = Math.max(
          MIN_POSSESSION_SECONDS,
          Math.round(meanPossession * (0.5 + rng.next())),
        )
        // A possession still running at the change carries over to the next
        // Shift - the puck stays with the same Club, the time is spent.
        if (clock + seconds > to) break
        clock += seconds
        possession(puck, clock)
      }

      function faceoff(clock: number): Side {
        const home = units.home.centre
        const away = units.away.centre
        const homeWins = rng.chance(
          sigmoid(
            FACEOFF_EDGE * (centred(home.attributes.faceoffs) - centred(away.attributes.faceoffs)),
          ),
        )
        const winner: Side = homeWins ? 'home' : 'away'
        events.push({
          type: 'faceoff',
          clock,
          ...base,
          wonBy: contexts[winner].clubId,
          winner: homeWins ? home.id : away.id,
          loser: homeWins ? away.id : home.id,
        })
        return winner
      }

      function possession(attacking: Side, clock: number): void {
        const defending = other(attacking)
        const att = units[attacking]
        const def = units[defending]
        const attTactics = contexts[attacking].tactics
        const defTactics = contexts[defending].tactics

        const attempt = sigmoid(
          ATTEMPT_BASE +
            ATTEMPT_EDGE * (att.offence - def.defence) +
            SHOT_VOLUME_ATTEMPTS * dial(attTactics.shotVolume) +
            AGGRESSION_FOR * dial(attTactics.aggression) +
            AGGRESSION_AGAINST * dial(defTactics.aggression),
        )
        if (rng.chance(attempt)) {
          shotAttempt(attacking, clock)
          return
        }

        const roll = rng.next()
        if (roll < STOPPAGE_SHARE) {
          events.push({
            type: 'turnover',
            clock,
            ...base,
            clubId: contexts[attacking].clubId,
            kind: rng.chance(0.5) ? 'icing' : 'offside',
            player: rng.pick(att.skaters).id,
          })
          puck = null
          return
        }

        if (roll < STOPPAGE_SHARE + RECORDED_TURNOVER_SHARE) {
          const takeaway = rng.chance(sigmoid(TAKEAWAY_EDGE * (def.checking - att.puckControl)))
          if (takeaway) {
            const taker =
              def.skaters[
                weightedIndex(
                  rng,
                  def.skaters.map((s) => s.attributes.checking),
                )
              ]!
            events.push({
              type: 'turnover',
              clock,
              ...base,
              clubId: contexts[defending].clubId,
              kind: 'takeaway',
              player: taker.id,
            })
          } else {
            const loser =
              att.skaters[
                weightedIndex(
                  rng,
                  att.skaters.map((s) => 21 - s.attributes.puckControl),
                )
              ]!
            events.push({
              type: 'turnover',
              clock,
              ...base,
              clubId: contexts[attacking].clubId,
              kind: 'giveaway',
              player: loser.id,
            })
          }
        }
        // Otherwise a dump-in, a lost race or a loose puck: possession
        // changes without anything worth recording.
        puck = defending
      }

      function shotAttempt(attacking: Side, clock: number): void {
        const defending = other(attacking)
        const att = units[attacking]
        const def = units[defending]
        const shotVolume = dial(contexts[attacking].tactics.shotVolume)
        const clubId = contexts[attacking].clubId

        const shooterIndex = weightedIndex(
          rng,
          att.skaters.map(
            (s, i) =>
              (s.attributes.shooting + s.attributes.offPositioning) *
              (i >= 3 ? DEFENCE_SHOOTER_WEIGHT : 1),
          ),
        )
        const shooter = att.skaters[shooterIndex]!
        const pointShot = shooterIndex >= 3

        const dangerLogit =
          DANGER_BASE +
          DANGER_SHOOTER *
            centred((shooter.attributes.shooting + shooter.attributes.offPositioning) / 2) +
          DANGER_SUPPORT * att.support -
          DANGER_PRESSURE * def.pressure +
          (pointShot ? DANGER_POINT_SHOT : 0) -
          SHOT_VOLUME_DANGER * shotVolume +
          DANGER_SPREAD * logisticNoise(rng)
        const danger = sigmoid(dangerLogit)

        if (
          rng.chance(
            sigmoid(BLOCK_BASE + BLOCK_SKILL * def.blocking + (pointShot ? BLOCK_POINT_SHOT : 0)),
          )
        ) {
          const blocker =
            def.skaters[
              weightedIndex(
                rng,
                def.skaters.map((s) => s.attributes.shotBlocking),
              )
            ]!
          events.push({
            type: 'shot',
            clock,
            ...base,
            clubId,
            shooter: shooter.id,
            result: 'block',
            blocker: blocker.id,
            danger,
          })
          puck = rng.chance(LOOSE_PUCK_RETAINED) ? attacking : defending
          return
        }

        resolveOnTarget(attacking, shooter, danger, clock, false)
      }

      /** A shot that got past the defending unit: miss, goal or save, and a rebound off a save. */
      function resolveOnTarget(
        attacking: Side,
        shooter: Skater,
        danger: number,
        clock: number,
        rebound: boolean,
      ): void {
        const defending = other(attacking)
        const clubId = contexts[attacking].clubId
        const goalie = contexts[defending].goalie

        if (rng.chance(sigmoid(MISS_BASE - MISS_SKILL * centred(shooter.attributes.shooting)))) {
          events.push({
            type: 'shot',
            clock,
            ...base,
            clubId,
            shooter: shooter.id,
            result: 'miss',
            danger,
          })
          puck = rng.chance(LOOSE_PUCK_RETAINED) ? attacking : defending
          return
        }

        // Positioning cuts the danger before reflexes see it; on a rebound
        // the goalie is moving, so recovery stands in for positioning.
        const reading = rebound
          ? GOALIE_RECOVERY * centred(goalie.attributes.recovery)
          : GOALIE_POSITIONING * centred(goalie.attributes.positioning)
        const goalChance = sigmoid(
          logit(danger) - reading - GOALIE_REFLEXES * centred(goalie.attributes.reflexes),
        )

        if (rng.chance(goalChance)) {
          score[attacking]++
          events.push({
            type: 'shot',
            clock,
            ...base,
            clubId,
            shooter: shooter.id,
            result: 'goal',
            danger,
          })
          events.push({
            type: 'goal',
            clock,
            ...base,
            clubId,
            scorer: shooter.id,
            assists: assists(units[attacking], shooter),
            goalieBeaten: goalie.id,
            emptyNet: false,
          })
          puck = null
          return
        }

        const live =
          !rebound &&
          rng.chance(
            sigmoid(REBOUND_BASE - REBOUND_CONTROL * centred(goalie.attributes.reboundControl)),
          )
        events.push({
          type: 'shot',
          clock,
          ...base,
          clubId,
          shooter: shooter.id,
          result: 'save',
          goalie: goalie.id,
          danger,
        })
        events.push({
          type: 'save',
          clock,
          ...base,
          clubId: contexts[defending].clubId,
          goalie: goalie.id,
          shooter: shooter.id,
          rebound: live,
        })

        if (live) {
          const att = units[attacking]
          const crasher =
            att.skaters[
              weightedIndex(
                rng,
                att.skaters.map((s, i) => (i < 3 ? s.attributes.offPositioning : 0)),
              )
            ]!
          resolveOnTarget(attacking, crasher, sigmoid(logit(danger) + REBOUND_DANGER), clock, true)
          return
        }

        if (rng.chance(FREEZE_SHARE)) {
          puck = null
          return
        }
        const cleared = rng.chance(
          sigmoid(CLEAR_BASE + CLEAR_HANDLING * centred(goalie.attributes.puckHandling)),
        )
        puck = cleared ? defending : attacking
      }

      function assists(unit: Unit, scorer: Skater): PlayerId[] {
        const credited: PlayerId[] = []
        let candidates = unit.skaters.filter((s) => s.id !== scorer.id)

        for (const chance of [FIRST_ASSIST, SECOND_ASSIST]) {
          if (!rng.chance(chance)) break
          const pick =
            candidates[
              weightedIndex(
                rng,
                candidates.map((s) => s.attributes.passing + s.attributes.offPositioning),
              )
            ]!
          credited.push(pick.id)
          candidates = candidates.filter((s) => s.id !== pick.id)
        }
        return credited
      }
    },
  }
}
