import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from '../domain/attributes.js'
import type { Tactics } from '../domain/club.js'
import type { MatchEvent, Period, TurnoverKind } from '../domain/event.js'
import type { ClubId, Goalie, PlayerId, Skater } from '../domain/player.js'
import type { Rng } from '../rng/index.js'

/**
 * Level 2 of the two-level loop (03-sim-engine.md): the possessions inside
 * one Shift, resolved into events.
 *
 * The separation that matters here is multiplicative, not additive. A first
 * Line has to out-produce a fourth Line by 2.71 points per minute on the
 * strength of attributes alone (04-validation-targets.md), and that only
 * happens if a better unit wins more possessions AND attempts more shots AND
 * carries more danger per attempt AND collects more assists. Four factors of
 * roughly 1.3 compound to 2.7; four factors added together produce nothing.
 *
 * Every constant below is provisional. Issue #15 calibrates them against the
 * full realism suite; the values here are seeded to land near the measured
 * even-strength rates, since power plays (#5) do not exist yet.
 */

/** Seconds one possession consumes. A Shift of ~42s therefore holds 2-5 of them. */
const POSSESSION_SECONDS_MIN = 8
const POSSESSION_SECONDS_MAX = 20

/** Share of possessions that produce a shot attempt for a league-average matchup. */
const SHOT_ATTEMPT_BASE = 0.343
/** Share of possessions that end in a whistle rather than a turnover. */
const STOPPAGE_CHANCE = 0.09

/** How far a unit-strength edge swings possession and attempt rates. */
const ATTACK_SWING = 0.8

/**
 * Pre-goalie danger for a league-average attempt. Seeded high relative to the
 * ~10% of shots that become goals because a starting Goalie is the best of
 * three on the Roster, and so sits well above the median Skater on the same
 * 1-20 scale - the two `*_WEIGHT` cuts below take most of this back out.
 */
const DANGER_BASE = 0.21
/** How far a shooter/defence quality gap swings danger. */
const DANGER_SWING = 0.9

/** Share of unblocked attempts that miss the net. */
const MISS_CHANCE = 0.27
/** Share of attempts a league-average defending unit blocks. */
const BLOCK_BASE = 0.36

/** How much a Goalie's positioning and reflexes each cut an attempt down. */
const POSITIONING_WEIGHT = 0.35
const REFLEX_WEIGHT = 0.35
/** Rebound chance off a save by a Goalie with no rebound control at all. */
const REBOUND_BASE = 0.3
/** Multiplier applied to danger on a rebound attempt - the goalie is moving. */
const REBOUND_DANGER_MULTIPLIER = 2.2

/** Defencemen take fewer shots than forwards. */
const DEFENCE_SHOOTING_WEIGHT = 0.45

const ASSIST_PRIMARY_CHANCE = 0.9
const ASSIST_SECONDARY_CHANCE = 0.88

/** How far the shotVolume dial moves attempt count, and danger the other way. */
const VOLUME_ATTEMPT_SWING = 0.4
const VOLUME_DANGER_SWING = 0.35
/** How far the aggression dial raises attempts, for both Clubs. */
const AGGRESSION_SWING = 0.3

/** Maps a 1-20 attribute onto 0-1. */
function norm(value: number): number {
  return (value - ATTRIBUTE_MIN) / (ATTRIBUTE_MAX - ATTRIBUTE_MIN)
}

/** Maps a 0-100 tactical dial onto -0.5..+0.5, so 50 is neutral. */
function dial(value: number): number {
  return value / 100 - 0.5
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** One Club's five Skaters and Goalie, as deployed for the current Shift. */
export interface OnIceUnit {
  clubId: ClubId
  /** Three forwards then two defencemen, in Line/Pairing order. */
  skaters: readonly Skater[]
  goalie: Goalie
  tactics: Tactics
}

export interface ShiftPossessionContext {
  home: OnIceUnit
  away: OnIceUnit
  /** Elapsed match seconds at the start of the Shift. */
  clock: number
  /** How long the Shift is meant to last. The possession in progress when it expires is played out. */
  seconds: number
  /** Hard stop - the end of the period. No event is ever timestamped past it. */
  deadline: number
  period: Period
  /** Which Club carries the puck into the Shift. */
  possession: ClubId
  /** Whether play resumes from a faceoff. */
  faceoffPending: boolean
}

export interface ShiftPossessionResult {
  events: readonly MatchEvent[]
  /** Where the match clock actually stands afterwards, which may overrun `seconds` slightly. */
  clock: number
  possession: ClubId
  faceoffPending: boolean
}

function forwards(unit: OnIceUnit): readonly Skater[] {
  return unit.skaters.slice(0, 3)
}

function defenders(unit: OnIceUnit): readonly Skater[] {
  return unit.skaters.slice(3)
}

/** The centre takes the draw. `playersOf` orders a Line left wing, centre, right wing. */
function centre(unit: OnIceUnit): Skater {
  return unit.skaters[1]!
}

function attackStrength(unit: OnIceUnit): number {
  return mean(
    unit.skaters.map(
      (s) =>
        0.4 * norm(s.attributes.puckControl) +
        0.35 * norm(s.attributes.offPositioning) +
        0.25 * norm(s.attributes.passing),
    ),
  )
}

function defenceStrength(unit: OnIceUnit): number {
  return mean(
    unit.skaters.map(
      (s) => 0.6 * norm(s.attributes.defPositioning) + 0.4 * norm(s.attributes.checking),
    ),
  )
}

/** Picks the shooter, weighted by finishing ability and position. */
function pickShooter(unit: OnIceUnit, rng: Rng): Skater {
  const weights = unit.skaters.map((s, i) => {
    const skill = 0.6 * norm(s.attributes.shooting) + 0.4 * norm(s.attributes.offPositioning)
    const positionWeight = i < 3 ? 1 : DEFENCE_SHOOTING_WEIGHT
    return (0.35 + skill) * positionWeight
  })
  return unit.skaters[weightedIndex(rng, weights)]!
}

/** Credits up to two assists from the Skaters on the ice other than the scorer. */
function pickAssists(unit: OnIceUnit, scorer: Skater, rng: Rng): PlayerId[] {
  const candidates = unit.skaters.filter((s) => s.id !== scorer.id)
  if (candidates.length === 0) return []

  const weights = candidates.map(
    (s) => 0.3 + 0.6 * norm(s.attributes.passing) + 0.4 * norm(s.attributes.offPositioning),
  )

  const assists: PlayerId[] = []
  if (!rng.chance(ASSIST_PRIMARY_CHANCE)) return assists

  const primaryIdx = weightedIndex(rng, weights)
  assists.push(candidates[primaryIdx]!.id)

  if (!rng.chance(ASSIST_SECONDARY_CHANCE)) return assists

  const remainingWeights = weights.map((w, i) => (i === primaryIdx ? 0 : w))
  if (remainingWeights.some((w) => w > 0)) {
    assists.push(candidates[weightedIndex(rng, remainingWeights)]!.id)
  }
  return assists
}

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

/**
 * Runs the possessions that fit inside one Shift, appending events and
 * reporting who carries the puck into the next one.
 */
export function resolveShiftPossessions(
  ctx: ShiftPossessionContext,
  rng: Rng,
): ShiftPossessionResult {
  const events: MatchEvent[] = []
  let clock = ctx.clock
  const end = ctx.clock + ctx.seconds
  let possession = ctx.possession
  let faceoffPending = ctx.faceoffPending

  const unitOf = (clubId: ClubId): OnIceUnit => (clubId === ctx.home.clubId ? ctx.home : ctx.away)
  const opponentOf = (clubId: ClubId): OnIceUnit =>
    clubId === ctx.home.clubId ? ctx.away : ctx.home

  while (clock < end && clock < ctx.deadline) {
    const attacking = unitOf(possession)
    const defending = opponentOf(possession)
    const base = { period: ctx.period, strength: 'even' as const }

    if (faceoffPending) {
      const homeCentre = centre(ctx.home)
      const awayCentre = centre(ctx.away)
      const homeSkill = 0.2 + norm(homeCentre.attributes.faceoffs)
      const homeWins = rng.chance(homeSkill / (homeSkill + 0.2 + norm(awayCentre.attributes.faceoffs)))

      events.push({
        type: 'faceoff',
        clock,
        ...base,
        wonBy: homeWins ? ctx.home.clubId : ctx.away.clubId,
        winner: homeWins ? homeCentre.id : awayCentre.id,
        loser: homeWins ? awayCentre.id : homeCentre.id,
      })
      possession = homeWins ? ctx.home.clubId : ctx.away.clubId
      faceoffPending = false
      continue
    }

    clock = Math.min(clock + rng.int(POSSESSION_SECONDS_MIN, POSSESSION_SECONDS_MAX), ctx.deadline)

    const edge = attackStrength(attacking) - defenceStrength(defending)
    const volumeAttempt = 1 + VOLUME_ATTEMPT_SWING * 2 * dial(attacking.tactics.shotVolume)
    const aggression =
      1 +
      AGGRESSION_SWING * 2 * dial(attacking.tactics.aggression) +
      AGGRESSION_SWING * 2 * dial(defending.tactics.aggression)
    const shotChance = clamp01(
      SHOT_ATTEMPT_BASE * (1 + ATTACK_SWING * edge) * volumeAttempt * aggression,
    )

    const roll = rng.next()
    if (roll >= shotChance + STOPPAGE_CHANCE) {
      // Turnover: the attacker coughed it up, or the defender took it.
      const giveaway = rng.chance(0.55)
      const player = giveaway
        ? pickWeakest(attacking.skaters, (s) => norm(s.attributes.puckControl), rng)
        : pickStrongest(defending.skaters, (s) => norm(s.attributes.checking), rng)

      events.push({
        type: 'turnover',
        clock,
        ...base,
        clubId: giveaway ? attacking.clubId : defending.clubId,
        kind: giveaway ? 'giveaway' : ('takeaway' satisfies TurnoverKind),
        player: player.id,
      })
      possession = defending.clubId
      continue
    }

    if (roll >= shotChance) {
      // Whistle: icing or offside, both of which reset to a faceoff.
      const icing = rng.chance(0.5)
      events.push({
        type: 'turnover',
        clock,
        ...base,
        clubId: attacking.clubId,
        kind: icing ? 'icing' : 'offside',
        player: rng.pick(attacking.skaters).id,
      })
      faceoffPending = true
      continue
    }

    const outcome = resolveAttempt(attacking, defending, clock, ctx.period, rng, 1, ctx.deadline)
    events.push(...outcome.events)
    clock = outcome.clock
    if (outcome.endsWithFaceoff) {
      faceoffPending = true
    } else {
      possession = outcome.retained ? attacking.clubId : defending.clubId
    }
  }

  return { events, clock, possession, faceoffPending }
}

function pickWeakest(
  skaters: readonly Skater[],
  score: (s: Skater) => number,
  rng: Rng,
): Skater {
  return skaters[weightedIndex(rng, skaters.map((s) => 1.2 - score(s)))]!
}

function pickStrongest(
  skaters: readonly Skater[],
  score: (s: Skater) => number,
  rng: Rng,
): Skater {
  return skaters[weightedIndex(rng, skaters.map((s) => 0.2 + score(s)))]!
}

interface AttemptOutcome {
  events: readonly MatchEvent[]
  clock: number
  /** True when play stops and the next possession starts from a faceoff. */
  endsWithFaceoff: boolean
  /** True when the attacking Club keeps the puck. */
  retained: boolean
}

/**
 * One shot attempt, from release to whistle. `dangerMultiplier` is above 1 for
 * a rebound, where the Goalie is out of position and moving.
 */
function resolveAttempt(
  attacking: OnIceUnit,
  defending: OnIceUnit,
  clock: number,
  period: Period,
  rng: Rng,
  dangerMultiplier: number,
  deadline: number,
): AttemptOutcome {
  const events: MatchEvent[] = []
  const base = { period, strength: 'even' as const }
  const shooter = pickShooter(attacking, rng)
  const goalie = defending.goalie

  const support = mean(forwards(attacking).map((s) => norm(s.attributes.passing)))
  const pressure = mean(defenders(defending).map((s) => norm(s.attributes.defPositioning)))
  const shooterQuality =
    0.6 * norm(shooter.attributes.shooting) + 0.4 * norm(shooter.attributes.offPositioning)

  // shotVolume raises attempt count and lowers mean danger, so it is not the aggression dial.
  const volumeDanger = 1 - VOLUME_DANGER_SWING * 2 * dial(attacking.tactics.shotVolume)
  const danger = clamp01(
    DANGER_BASE *
      (1 + DANGER_SWING * (0.6 * shooterQuality + 0.4 * support - pressure)) *
      volumeDanger *
      dangerMultiplier,
  )

  const blockChance = BLOCK_BASE * mean(defenders(defending).map((s) => norm(s.attributes.shotBlocking)))
  if (rng.chance(blockChance)) {
    const blocker = pickStrongest(defenders(defending), (s) => norm(s.attributes.shotBlocking), rng)
    events.push({
      type: 'shot',
      clock,
      ...base,
      clubId: attacking.clubId,
      shooter: shooter.id,
      result: 'block',
      blocker: blocker.id,
      danger,
    })
    return { events, clock, endsWithFaceoff: false, retained: rng.chance(0.4) }
  }

  if (rng.chance(MISS_CHANCE)) {
    events.push({
      type: 'shot',
      clock,
      ...base,
      clubId: attacking.clubId,
      shooter: shooter.id,
      result: 'miss',
      danger,
    })
    return { events, clock, endsWithFaceoff: false, retained: rng.chance(0.35) }
  }

  // Positioning cuts the attempt down first; reflexes resolve what is left.
  const effective = danger * (1 - POSITIONING_WEIGHT * norm(goalie.attributes.positioning))
  const beatsGoalie =
    dangerMultiplier > 1
      ? effective * (1 - REFLEX_WEIGHT * norm(goalie.attributes.recovery))
      : effective * (1 - REFLEX_WEIGHT * norm(goalie.attributes.reflexes))

  if (rng.chance(beatsGoalie)) {
    events.push({
      type: 'shot',
      clock,
      ...base,
      clubId: attacking.clubId,
      shooter: shooter.id,
      result: 'goal',
      danger,
    })
    events.push({
      type: 'goal',
      clock,
      ...base,
      clubId: attacking.clubId,
      scorer: shooter.id,
      assists: pickAssists(attacking, shooter, rng),
      goalieBeaten: goalie.id,
      emptyNet: false,
    })
    return { events, clock, endsWithFaceoff: true, retained: false }
  }

  const rebound =
    dangerMultiplier === 1 &&
    rng.chance(REBOUND_BASE * (1 - norm(goalie.attributes.reboundControl)))

  events.push({
    type: 'shot',
    clock,
    ...base,
    clubId: attacking.clubId,
    shooter: shooter.id,
    result: 'save',
    goalie: goalie.id,
    danger,
  })
  events.push({
    type: 'save',
    clock,
    ...base,
    clubId: defending.clubId,
    goalie: goalie.id,
    shooter: shooter.id,
    rebound,
  })

  if (rebound) {
    const followUp = resolveAttempt(
      attacking,
      defending,
      Math.min(clock + 1, deadline),
      period,
      rng,
      REBOUND_DANGER_MULTIPLIER,
      deadline,
    )
    return {
      events: [...events, ...followUp.events],
      clock: followUp.clock,
      endsWithFaceoff: followUp.endsWithFaceoff,
      retained: followUp.retained,
    }
  }

  // A save the Goalie held is a whistle; anything else is a live puck.
  return { events, clock, endsWithFaceoff: true, retained: false }
}
