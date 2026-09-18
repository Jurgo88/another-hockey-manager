/**
 * Player attributes.
 *
 * All attributes are integers on a 1-20 scale, following the Eastside Hockey
 * Manager convention: 1 is beer-league, 10 is a replacement-level pro, 20 is
 * generational.
 *
 * RULE (D-06): an attribute may only exist here if some code path in
 * src/engine reads it. An attribute with no effect on simulation is noise in
 * the UI and a lie to the player. Adding one means adding its read site in
 * the same change.
 *
 * `strength` was removed under that rule. It had no public data source and
 * its intended effect - winning contested pucks on the boards and at the net
 * - overlapped almost entirely with `checking` and `puckControl`. It can
 * return if board battles ever become a distinct step in the engine.
 */

export const ATTRIBUTE_MIN = 1
export const ATTRIBUTE_MAX = 20

/** A 1-20 attribute value. Not branded - kept structurally simple on purpose. */
export type AttributeValue = number

export interface SkaterAttributes {
  // Offensive
  /** Accuracy and power when releasing the puck at the net. */
  shooting: AttributeValue
  /** Completing intended passes under pressure. */
  passing: AttributeValue
  /** Retaining the puck while carrying, dangling, protecting. */
  puckControl: AttributeValue
  /** Finding and occupying dangerous ice without the puck. */
  offPositioning: AttributeValue

  // Defensive
  /** Separating an opponent from the puck by body or stick. */
  checking: AttributeValue
  /** Reading play and denying lanes in the defensive zone. */
  defPositioning: AttributeValue
  /** Getting into shot lanes and absorbing pucks. */
  shotBlocking: AttributeValue
  /** Winning draws. Only meaningful for centres. */
  faceoffs: AttributeValue

  // Physical
  /** Acceleration and top speed. */
  speed: AttributeValue
  /** How slowly fatigue accumulates and how quickly it clears between shifts. */
  stamina: AttributeValue

  // Mental
  /** Inverse of penalty propensity. Low discipline means more time in the box. */
  discipline: AttributeValue
}

export interface GoalieAttributes {
  /** Raw reaction speed on pucks the goalie did not read early. */
  reflexes: AttributeValue
  /** Being in the right place, so reflexes are needed less often. */
  positioning: AttributeValue
  /** Killing second chances by smothering or steering rebounds. */
  reboundControl: AttributeValue
  /** Getting back into a stance after the first save of a sequence. */
  recovery: AttributeValue
  /** Handling and distributing the puck to start a breakout. */
  puckHandling: AttributeValue
}

export const SKATER_ATTRIBUTE_KEYS = [
  'shooting',
  'passing',
  'puckControl',
  'offPositioning',
  'checking',
  'defPositioning',
  'shotBlocking',
  'faceoffs',
  'speed',
  'stamina',
  'discipline',
] as const satisfies readonly (keyof SkaterAttributes)[]

export const GOALIE_ATTRIBUTE_KEYS = [
  'reflexes',
  'positioning',
  'reboundControl',
  'recovery',
  'puckHandling',
] as const satisfies readonly (keyof GoalieAttributes)[]

export function clampAttribute(value: number): AttributeValue {
  return Math.max(ATTRIBUTE_MIN, Math.min(ATTRIBUTE_MAX, Math.round(value)))
}
