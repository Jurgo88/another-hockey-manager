import {
  clampAttribute,
  GOALIE_ATTRIBUTE_KEYS,
  type GoalieAttributes,
  type SkaterAttributes,
} from '../domain/attributes.js'
import {
  goalieLevel,
  isSkater,
  skaterLevel,
  SKATER_LEVEL_KEYS,
  type Goalie,
  type Player,
  type Skater,
} from '../domain/player.js'
import { DEFAULT_CONFIDENCE, type AttributeProvenance } from '../domain/provenance.js'
import { gaussian, type Rng } from '../rng/index.js'
import {
  changeAt,
  PHYSICAL_CURVE,
  READING_CURVE,
  SKILL_CURVE,
  type DevelopmentCurve,
} from './curves.js'

/**
 * Development between Seasons (ADR-022, ADR-026): every Player's attributes move
 * by his age, group by group, along the curves in `curves.ts`. `potential` decides
 * how far a Player grows, and the curve when.
 *
 * Pure: a Player and his own stream in, the Player a Season on out. The caller
 * forks the stream from the Season's seed by Season and Player id (D-08), so one
 * Player's development never moves another's random numbers.
 *
 * Every size below is a starting value. The long-run calibration (Phase 2,
 * item 8) sets them against the age profile of a ten-Season run.
 */

/**
 * How widely one attribute is spread across a generated league, in points.
 * Measured on seeds 1-3 at the start of a Season: 3.8-4.4 for each Skater
 * attribute, 1.5-1.9 for each Goalie one. A curve's step, a share of its
 * measure's spread, becomes the same share of this.
 */
export const SKATER_ATTRIBUTE_SPREAD = 4
export const GOALIE_ATTRIBUTE_SPREAD = 1.65

/** Multiplies every curve. The size of development as a whole. */
export const DEVELOPMENT_SCALE = 1

/**
 * Extra growth a Season for a young Player who dressed in most of his Club's
 * Fixtures, as a share of the attribute spread. Small, because the measured
 * curves already contain the ice time real young Players got.
 */
export const ICE_TIME_BONUS = 0.03
/** The bonus is for Players younger than this, while skill still grows (ADR-026). */
export const ICE_TIME_BONUS_BEFORE = 29

/**
 * The noise around the curve, as shares of the attribute spread: one draw a
 * Season shared by all of a Player's attributes, so some young Players boom and
 * some stall, and one per attribute. Estimates, until the spread of measured
 * season-to-season changes is measured in item 8.
 */
export const PLAYER_DEVELOPMENT_NOISE = 0.06
export const ATTRIBUTE_DEVELOPMENT_NOISE = 0.06

/**
 * Until a Player is this old, his `potential` moves each Season with the draw
 * his attributes share that Season, and that draw is larger (ADR-028): a young
 * Player who booms grows faster and further, one who stalls slower and less.
 * It is what makes the draft uncertain.
 */
export const POTENTIAL_SETTLES_AT = 23

/**
 * The shared draw of a Player younger than `POTENTIAL_SETTLES_AT`, as a
 * multiple of `PLAYER_DEVELOPMENT_NOISE`. Fitted in #89 against the draft
 * table: a late pick becomes a regular only if he grows faster than the curves,
 * so the ceiling alone cannot make him one. Refitted in item 8.
 */
export const YOUNG_DEVELOPMENT_NOISE = 5

/**
 * How far `potential` moves for the shared draw, as a multiple of the move it
 * gives the attributes. Fitted in #89, refitted in item 8.
 */
export const POTENTIAL_DRIFT = 1.5

/** What a Season of modelled development costs an attribute in confidence (D-11). */
export const CONFIDENCE_LOSS_PER_SEASON = 0.1

/** What a Player's Season says about his development. */
export interface SeasonPlayed {
  /** Dressed in at least half of his Club's regular-Season Fixtures. */
  regular: boolean
}

/**
 * The curve each attribute ages along (ADR-026), or null for one that does not
 * age. Reading the game grows longest, skill a little less, and speed as
 * measured. Discipline is temperament and does not age.
 */
const SKATER_CURVES: Readonly<Record<keyof SkaterAttributes, DevelopmentCurve | null>> = {
  shooting: SKILL_CURVE,
  puckControl: SKILL_CURVE,
  checking: SKILL_CURVE,
  passing: READING_CURVE,
  offPositioning: READING_CURVE,
  defPositioning: READING_CURVE,
  shotBlocking: READING_CURVE,
  faceoffs: READING_CURVE,
  speed: PHYSICAL_CURVE,
  stamina: PHYSICAL_CURVE,
  discipline: null,
}

/** A Goalie's reactions age like skill, his technique like reading the game. */
const GOALIE_CURVES: Readonly<Record<keyof GoalieAttributes, DevelopmentCurve>> = {
  reflexes: SKILL_CURVE,
  recovery: SKILL_CURVE,
  positioning: READING_CURVE,
  reboundControl: READING_CURVE,
  puckHandling: READING_CURVE,
}

/** A Player a Season on: his attributes moved by his age, before he is a year older. */
export function develop<P extends Player>(player: P, rng: Rng, season: SeasonPlayed): P {
  return (
    isSkater(player)
      ? developSkater(player, rng, season)
      : developGoalie(player, rng, season)
  ) as P
}

function developSkater(skater: Skater, rng: Rng, season: SeasonPlayed): Skater {
  const curves = SKATER_CURVES
  const shared = sharedDraw(skater, rng)
  const attributes = moved<keyof SkaterAttributes>(
    skater,
    curves,
    SKATER_ATTRIBUTE_SPREAD,
    SKATER_LEVEL_KEYS,
    skaterLevel(skater.attributes),
    rng,
    season,
    shared,
  )
  const level = skaterLevel(attributes)
  return {
    ...skater,
    attributes,
    potential: movedPotential(skater, level, shared * SKATER_ATTRIBUTE_SPREAD, rng),
    ...(skater.provenance ? { provenance: aged(skater.provenance, curves) } : {}),
  }
}

function developGoalie(goalie: Goalie, rng: Rng, season: SeasonPlayed): Goalie {
  const curves = GOALIE_CURVES
  const shared = sharedDraw(goalie, rng)
  const attributes = moved<keyof GoalieAttributes>(
    goalie,
    curves,
    GOALIE_ATTRIBUTE_SPREAD,
    GOALIE_ATTRIBUTE_KEYS,
    goalieLevel(goalie.attributes),
    rng,
    season,
    shared,
  )
  const level = goalieLevel(attributes)
  return {
    ...goalie,
    attributes,
    potential: movedPotential(goalie, level, shared * GOALIE_ATTRIBUTE_SPREAD, rng),
    ...(goalie.provenance ? { provenance: aged(goalie.provenance, curves) } : {}),
  }
}

/**
 * A Player's level a Season on, as development expects it: his attributes moved
 * along their curves at his age, capped by `potential`, without the noise or
 * the bonus for ice time (ADR-028 amendment). A Club looks a Season ahead with
 * it when it chooses whom to call up and whom to release.
 */
export function expectedLevel(player: Player): number {
  return isSkater(player)
    ? expectedOf(player, SKATER_CURVES, SKATER_ATTRIBUTE_SPREAD, SKATER_LEVEL_KEYS)
    : expectedOf(player, GOALIE_CURVES, GOALIE_ATTRIBUTE_SPREAD, GOALIE_ATTRIBUTE_KEYS)
}

function expectedOf<K extends string>(
  player: { age: number; potential: number; attributes: Readonly<Record<K, number>> },
  curves: Readonly<Record<K, DevelopmentCurve | null>>,
  spread: number,
  levelKeys: readonly K[],
): number {
  const deltas = {} as Record<K, number>
  for (const key of Object.keys(curves) as K[]) {
    const curve = curves[key]
    deltas[key] = curve ? changeAt(curve, player.age) * DEVELOPMENT_SCALE * spread : 0
  }
  const level = levelKeys.reduce((sum, key) => sum + player.attributes[key], 0) / levelKeys.length
  const capped = withinPotential(deltas, levelKeys, level, player.potential)
  const moved = levelKeys.map((key) => Math.min(20, Math.max(1, player.attributes[key] + capped[key])))
  return moved.reduce((sum, value) => sum + value, 0) / moved.length
}

/**
 * The attributes a Season on. The change is worked out in fractions of a point
 * and rounded at random in proportion, so a change of a third of a point a
 * Season adds up over three Seasons rather than rounding away every time.
 */
function moved<K extends string>(
  player: { age: number; potential: number; attributes: Readonly<Record<K, number>> },
  curves: Readonly<Record<K, DevelopmentCurve | null>>,
  spread: number,
  levelKeys: readonly K[],
  level: number,
  rng: Rng,
  season: SeasonPlayed,
  shared: number,
): Record<K, number> {
  const keys = Object.keys(curves) as K[]
  const bonus = season.regular && player.age < ICE_TIME_BONUS_BEFORE ? ICE_TIME_BONUS : 0

  const deltas = {} as Record<K, number>
  for (const key of keys) {
    const curve = curves[key]
    if (!curve) {
      deltas[key] = 0
      continue
    }
    const own = gaussian(rng) * ATTRIBUTE_DEVELOPMENT_NOISE
    const share = changeAt(curve, player.age) * DEVELOPMENT_SCALE + bonus + shared + own
    deltas[key] = share * spread
  }

  const capped = withinPotential(deltas, levelKeys, level, player.potential)
  const attributes = { ...player.attributes } as Record<K, number>
  for (const key of keys) {
    if (capped[key] === 0) continue
    const exact = player.attributes[key] + capped[key]
    const whole = Math.floor(exact)
    attributes[key] = clampAttribute(whole + (rng.chance(exact - whole) ? 1 : 0))
  }
  return attributes
}

/** The draw all of a Player's attributes share this Season, larger while he is young. */
function sharedDraw(player: { age: number }, rng: Rng): number {
  const scale = player.age < POTENTIAL_SETTLES_AT ? YOUNG_DEVELOPMENT_NOISE : 1
  return gaussian(rng) * PLAYER_DEVELOPMENT_NOISE * scale
}

/**
 * A young Player's `potential` a Season on (ADR-028): moved by the Season's
 * shared draw, in points, times `POTENTIAL_DRIFT`, rounded at random in
 * proportion as attributes are, and never below his level. From
 * `POTENTIAL_SETTLES_AT` it no longer moves, and draws nothing.
 */
function movedPotential(
  player: { age: number; potential: number },
  level: number,
  sharedPoints: number,
  rng: Rng,
): number {
  if (player.age >= POTENTIAL_SETTLES_AT) return player.potential
  const exact = player.potential + sharedPoints * POTENTIAL_DRIFT
  const whole = Math.floor(exact)
  const rounded = whole + (rng.chance(exact - whole) ? 1 : 0)
  return clampAttribute(Math.max(rounded, Math.round(level)))
}

/**
 * `potential` caps growth, not attributes (ADR-022): development may not lift
 * the level above it, and a level already there does not rise. Decline is not
 * capped. The rises are scaled down together, so single attributes still move
 * up while others move down, and noise does not turn into a drift downwards.
 */
export function withinPotential<K extends string>(
  deltas: Readonly<Record<K, number>>,
  levelKeys: readonly K[],
  level: number,
  potential: number,
): Record<K, number> {
  const levelDeltas = levelKeys.map((key) => deltas[key])
  const room = Math.max(0, potential - level) * levelKeys.length
  const total = levelDeltas.reduce((sum, delta) => sum + delta, 0)
  if (total <= room) return { ...deltas }

  const rises = levelDeltas.filter((delta) => delta > 0).reduce((sum, delta) => sum + delta, 0)
  const falls = total - rises
  const factor = Math.max(0, (room - falls) / rises)
  return Object.fromEntries(
    (Object.entries(deltas) as [K, number][]).map(([key, delta]) => [
      key,
      delta > 0 ? delta * factor : delta,
    ]),
  ) as Record<K, number>
}

/**
 * Provenance a Season on (D-11): every attribute that ages is trusted 0.1 less,
 * down to the confidence of a generated value, and counts one more Season of
 * ageing. The source stays. One already below that floor keeps its own figure.
 */
function aged<K extends string>(
  provenance: Readonly<Record<K, AttributeProvenance>>,
  curves: Readonly<Record<K, DevelopmentCurve | null>>,
): Record<K, AttributeProvenance> {
  const floor = DEFAULT_CONFIDENCE.generated
  return Object.fromEntries(
    (Object.entries(provenance) as [K, AttributeProvenance][]).map(([key, entry]) => {
      if (!curves[key]) return [key, entry]
      const confidence =
        entry.confidence > floor
          ? Math.max(floor, Math.round((entry.confidence - CONFIDENCE_LOSS_PER_SEASON) * 100) / 100)
          : entry.confidence
      return [key, { ...entry, confidence, seasonsAged: (entry.seasonsAged ?? 0) + 1 }]
    }),
  ) as Record<K, AttributeProvenance>
}
