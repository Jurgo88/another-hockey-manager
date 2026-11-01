/**
 * Fatigue is one number per Skater, 0-100 (ADR-010). It rises during play, eases
 * at the two regulation intermissions (ADR-019) and falls between Fixtures, so a
 * Fixture's end is what the next one inherits. These functions are the whole of
 * the model; everything else reads the resulting number.
 *
 * Set against the measured cost of a back-to-back (04-validation-targets.md):
 * a day's rest takes a share rather than a fixed amount, so every Skater
 * carries something over and a heavy Match never saturates across a Season.
 */

/** Fatigue points per second on ice in a very short Shift, before the stamina adjustment. */
const FATIGUE_PER_SECOND = 0.04
/** A Shift this long costs twice as much per second as a very short one. */
const SHIFT_COST_SECONDS = 60
/** Share of fatigue left after one day between Fixtures, at the bottom of the stamina scale. */
const LEFT_AFTER_A_DAY = 0.4

/**
 * Share of fatigue left after a regulation intermission, at the bottom of the
 * stamina scale. Set by the cost of a back-to-back (ADR-019): at 0.85 too little
 * reaches the next Fixture for that row to hold.
 */
const LEFT_AFTER_INTERMISSION = 0.9

/** 1 at the bottom of the 1-20 stamina scale, 0.05 at the top. */
function staminaFactor(stamina: number): number {
  return (21 - stamina) / 20
}

/**
 * What one continuous Shift costs. Per second it grows with the length of the
 * Shift, so splitting the same ice time into shorter Shifts tires a Skater
 * less - which is what the `shiftLength` dial trades on. `effort` scales the
 * whole cost, for a Shift played harder than a Skater's turn in the rotation.
 */
export function afterShift(fatigue: number, seconds: number, stamina: number, effort = 1): number {
  const perSecond = FATIGUE_PER_SECOND * (1 + seconds / SHIFT_COST_SECONDS)
  return Math.min(100, fatigue + effort * perSecond * seconds * staminaFactor(stamina))
}

/** What is left after a regulation intermission. Higher `stamina` clears it faster. */
export function afterIntermission(fatigue: number, stamina: number): number {
  return fatigue * LEFT_AFTER_INTERMISSION ** (2 - staminaFactor(stamina))
}

/** What is left after `days` between two Fixtures. Higher `stamina` clears it faster. */
export function afterRest(fatigue: number, days: number, stamina: number): number {
  return fatigue * LEFT_AFTER_A_DAY ** (days * (2 - staminaFactor(stamina)))
}
