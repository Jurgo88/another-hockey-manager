import {
  clampAttribute,
  type GoalieAttributes,
  type SkaterAttributes,
} from '../domain/attributes.js'
import type { SkaterPosition } from '../domain/player.js'
import type { Rng } from '../rng/index.js'
import { NHL_AGES_BY_TIER } from './nhl-age-profile.js'

/**
 * The talent model: how a league's ability is distributed.
 *
 * SCOPE, stated plainly. This module decides the distribution of *attributes*.
 * It cannot be validated against the Tier 2 point targets, because points are
 * produced by an engine that does not exist yet and the mapping from ability
 * to production is exactly what that engine is for. So the tests here assert
 * structural properties of the attribute distribution - club spread, slot
 * decline, a thin top tail - and Tier 2 remains the engine's gate, not this
 * module's.
 *
 * Three structural facts the generated league must have, each for a reason
 * taken from measured data:
 *
 * 1. **Clubs differ.** Measured standings run from 124 points to 59 over 84
 *    Fixtures. A league of interchangeable Clubs cannot produce that.
 * 2. **Rosters are structured, not sampled.** A Club is not 22 independent
 *    draws - it has a first Line and it has grinders. This is what makes the
 *    tier gap possible at all.
 * 3. **The top is thin.** The measured scoring leader had 138 points while the
 *    fifth-highest had 103, a 34% gap inside the top five. A smooth decline
 *    cannot produce that, so generational Players are drawn explicitly.
 */

/** Latent ability, 0 to 1. Mapped to the 1-20 attribute scale per position. */
export type Ability = number

/**
 * Ability by depth-chart slot. Index 0 is the first-Line left wing's slot.
 *
 * The curve declines steeply through the top six and flattens out, which is
 * how real depth charts look: the difference between a first and second Line
 * is far larger than between a third and a fourth. Calibrated on the measured
 * tier-4 forward, who scores 16.3 points: the bottom six sat 0.05 and 0.10
 * lower and left him on 12.7 (#15).
 */
// prettier-ignore
export const FORWARD_SLOT_ABILITY: readonly Ability[] = [
  0.88, 0.85, 0.82, // first Line   - mean 0.850
  0.74, 0.71, 0.68, // second       - mean 0.710, a drop of 0.140
  0.67, 0.66, 0.65, // third        - mean 0.660, a drop of 0.050
  0.63, 0.61, 0.59, // fourth       - mean 0.610, a drop of 0.050
  0.44, 0.42, // spares
  0.4, 0.38, // call-ups
]

// prettier-ignore
export const DEFENCE_SLOT_ABILITY: readonly Ability[] = [
  0.87, 0.83, // first pairing - mean 0.850
  0.72, 0.69, // second        - mean 0.705, a drop of 0.145
  0.61, 0.58, // third         - mean 0.595, a drop of 0.110
  0.48, 0.45, // spares
  0.42, 0.4, // call-ups
]

/**
 * Close together on purpose. Measured, a Club's second Goalie saves only 0.0065
 * less than its first (ADR-011), and a third-stringer is still an NHL Goalie.
 */
export const GOALIE_SLOT_ABILITY: readonly Ability[] = [0.84, 0.83, 0.8]

/**
 * How much of a Player's ability comes from the quality of their Club.
 *
 * **A Tier 2 calibration knob, now calibrated (#9).** Measured standings run
 * from 124 points to 59 over 84 Fixtures. With the engine in place, a league
 * with no Club weight at all already spreads 124 to 64: luck over 84
 * Fixtures, Player noise, goalies and the odd generational Player do most of
 * the work. 0.02 adds the rest, landing on 126, 58 and a 67-point spread
 * across eight Seasons. Earlier values were 0.16 - seven attribute points
 * between best and worst Club, caught by a test - and then 0.06, which
 * stretched standings to 134 and 52.
 */
export const CLUB_WEIGHT = 0.02

/** Per-Player noise, so a depth chart is not perfectly ordered by slot. */
export const ABILITY_NOISE = 0.04
/**
 * Smaller for Goalies. The better of two becomes the starter, so noise alone
 * opens a gap between them, and it is what spreads league save percentages.
 */
export const GOALIE_ABILITY_NOISE = 0.02

/** Chance a Skater is generational, and how far above his slot that puts him. */
export const GENERATIONAL_CHANCE = 0.012
export const GENERATIONAL_BONUS = 0.13

/**
 * Club strength on a -1 to 1 scale, spread across the league.
 *
 * Deterministic in shape - the league always contains the same span of Club
 * quality - but which Club lands where depends on the seed. A random draw per
 * Club would occasionally produce a league of 32 average teams, and that
 * league cannot satisfy the measured standings spread.
 */
export function clubStrengths(rng: Rng, clubCount: number): number[] {
  const spread = Array.from({ length: clubCount }, (_, index) =>
    clubCount === 1 ? 0 : (index / (clubCount - 1)) * 2 - 1,
  )

  return rng.shuffle(spread)
}

/** Box-Muller, for ability noise. Symmetric and unbounded, unlike `next()`. */
function gaussian(rng: Rng): number {
  const u = Math.max(rng.next(), Number.EPSILON)
  const v = rng.next()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface AbilityDraw {
  ability: Ability
  generational: boolean
}

export function drawAbility(
  rng: Rng,
  slotAbility: Ability,
  clubStrength: number,
  noise: number = ABILITY_NOISE,
): AbilityDraw {
  const generational = rng.chance(GENERATIONAL_CHANCE)

  const raw =
    slotAbility +
    clubStrength * CLUB_WEIGHT +
    gaussian(rng) * noise +
    (generational ? GENERATIONAL_BONUS : 0)

  return { ability: Math.max(0.05, Math.min(0.99, raw)), generational }
}

/** Exponent on the ability-to-attribute map. Above 1 is convex. */
export const ABILITY_CURVE = 1.45

/** Per-attribute variation within one Player, in ability units. */
export const ATTRIBUTE_NOISE = 0.075

/**
 * Maps ability to the 1-20 scale.
 *
 * **Convex** (exponent above 1), which pushes the middle and lower range down
 * while leaving the very top near the ceiling. On this scale 10 is a
 * replacement-level professional and 20 is generational, so most of the
 * population belongs well below the midpoint - a concave map would put an
 * average second-Line forward at 17 and leave no room above him.
 *
 * The noise is per attribute, not per Player, and is deliberately large
 * enough to make Players spiky. A Player who is 15 at everything is not a
 * hockey player; real ones are fast but cannot shoot, or have a heavy shot and
 * no defensive read. Spikiness is also what makes Lineup decisions
 * interesting, so it is a design requirement and not just realism.
 */
function toAttribute(ability: Ability, weight: number, rng: Rng): number {
  const curved = Math.pow(ability, ABILITY_CURVE)
  const centred = curved * weight + gaussian(rng) * ATTRIBUTE_NOISE
  return clampAttribute(1 + centred * 19)
}

/** Per-position attribute emphasis. 1.0 is neutral; above 1 is a strength. */
const SKATER_WEIGHTS: Readonly<
  Record<SkaterPosition, Partial<Record<keyof SkaterAttributes, number>>>
> = {
  C: { faceoffs: 1.18, passing: 1.08, defPositioning: 1.04, offPositioning: 1.04 },
  LW: { shooting: 1.1, offPositioning: 1.06, faceoffs: 0.45, defPositioning: 0.92 },
  RW: { shooting: 1.1, offPositioning: 1.06, faceoffs: 0.45, defPositioning: 0.92 },
  LD: { defPositioning: 1.16, shotBlocking: 1.18, checking: 1.1, shooting: 0.82, faceoffs: 0.25 },
  RD: { defPositioning: 1.16, shotBlocking: 1.18, checking: 1.1, shooting: 0.82, faceoffs: 0.25 },
}

export function generateSkaterAttributes(
  rng: Rng,
  ability: Ability,
  position: SkaterPosition,
): SkaterAttributes {
  const weights = SKATER_WEIGHTS[position]
  const at = (key: keyof SkaterAttributes) => toAttribute(ability, weights[key] ?? 1, rng)

  return {
    shooting: at('shooting'),
    passing: at('passing'),
    puckControl: at('puckControl'),
    offPositioning: at('offPositioning'),
    checking: at('checking'),
    defPositioning: at('defPositioning'),
    shotBlocking: at('shotBlocking'),
    faceoffs: at('faceoffs'),
    speed: at('speed'),
    stamina: at('stamina'),
    // Discipline is close to independent of ability - elite Players take
    // penalties too - so it is drawn around the middle of the scale instead.
    discipline: clampAttribute(11 + gaussian(rng) * 3.2),
  }
}

export function generateGoalieAttributes(rng: Rng, ability: Ability): GoalieAttributes {
  const at = (weight = 1) => toAttribute(ability, weight, rng)

  return {
    reflexes: at(1.06),
    positioning: at(1.08),
    reboundControl: at(),
    recovery: at(),
    puckHandling: at(0.9),
  }
}

/**
 * Where the depth chart splits, in ability: into thirds between the fourth and
 * fifth, and the eighth and ninth, of the twelve forward slots that dress, and
 * below the dressed slots for the spares and call-ups, who stand in for the
 * real Players of fewer than 20 Fixtures. Goalies split between starter, backup
 * and third, the third being the one who rarely plays.
 */
export const SKATER_TIER_ABILITY: readonly [Ability, Ability, Ability] = [0.725, 0.655, 0.55]
export const GOALIE_TIER_ABILITY: readonly [Ability, Ability, Ability] = [0.835, 0.825, 0.815]

/** Standard normal CDF, Abramowitz and Stegun 7.1.26: deterministic, error below 2e-7. */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-x * x)
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

/** The age at cumulative share `u` of a measured age table. */
function ageAt(table: readonly (readonly [number, number])[], u: number): number {
  const total = table.reduce((sum, [, count]) => sum + count, 0)
  let running = 0
  for (const [age, count] of table) {
    running += count
    if (u * total < running) return age
  }
  return table[table.length - 1]![0]
}

/**
 * Age and the room left to grow.
 *
 * The age comes from the measured ages of NHL Players at the same depth: the
 * top third by ice time is older and the bottom third younger (#84,
 * `07-league-over-time.md`). It is read off one Gaussian draw through its
 * cumulative share, the same draw as before, so the random numbers of every
 * Player after it do not move. Headroom is furthest above ability for the youngest.
 */
export function generateAgeAndHeadroom(
  rng: Rng,
  ability: Ability,
  kind: 'skater' | 'goalie' = 'skater',
): { age: number; headroom: Ability } {
  const thresholds = kind === 'goalie' ? GOALIE_TIER_ABILITY : SKATER_TIER_ABILITY
  const tier = thresholds.findIndex((threshold) => ability >= threshold)
  const table = NHL_AGES_BY_TIER[tier === -1 ? thresholds.length : tier]!
  const age = ageAt(table, normalCdf(gaussian(rng)))

  return { age, headroom: drawHeadroom(rng, age) }
}

/** The room a Player of this age has left to grow, in ability units. */
export function drawHeadroom(rng: Rng, age: number): Ability {
  const yearsToPrime = Math.max(0, 26 - age)
  return (yearsToPrime / 8) * 0.22 + Math.max(0, gaussian(rng)) * 0.05
}

/**
 * The ability whose neutral attribute is this level, the inverse of the curve.
 * For a Player whose level is known and whose ability is not, such as a real one.
 */
export function abilityOfLevel(level: number): Ability {
  const curved = Math.max(0, Math.min(1, (level - 1) / 19))
  return Math.max(0.05, Math.min(0.99, Math.pow(curved, 1 / ABILITY_CURVE)))
}

/**
 * The ceiling of a Player's level (ADR-020). The headroom goes through the same
 * curve as the attributes and lands on the level the Player was generated with,
 * so it never sits below the rounded level. Mapping it straight onto the scale
 * left a fifth of the league below its own best attribute.
 */
export function potentialOf(level: number, ability: Ability, headroom: Ability): number {
  const ceiling = Math.min(0.99, ability + headroom)
  const room = Math.max(0, Math.pow(ceiling, ABILITY_CURVE) - Math.pow(ability, ABILITY_CURVE))
  return clampAttribute(level + room * 19)
}
