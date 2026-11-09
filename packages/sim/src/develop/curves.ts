/**
 * The age curves development follows (ADR-022, ADR-026), as data.
 *
 * Two are measured: ice time per Fixture and top skating speed. Each group
 * follows one of them with its growth drawn out to an age the author chose
 * (ADR-026): Players keep growing in speed a year longer, in skill longer still
 * and, longest, in reading the game, by as much in all as measured but over more
 * years, and decline later. The later ages are a design choice, not a measurement.
 *
 * Each step is the mean change from the season at `age` to the next, by the
 * delta method, copied from `07-league-over-time.md` (NHL 2015-16 to 2025-26,
 * `pnpm sim:measure`). They are in the units of their own measure, so each
 * curve carries the spread of that measure across the league, and a step is
 * read as a share of it.
 *
 * THE SPREADS ARE ESTIMATES. `07-league-over-time.md` measures the steps and
 * not how widely each measure is spread across the league in a season. They are
 * set here from typical NHL figures and are measured with the long-run
 * calibration (Phase 2, item 8), which sizes development as a whole anyway.
 */

export interface AgeStep {
  /** Age in the first of the two seasons. */
  age: number
  /** Players compared at this age. Weights the smoothing. */
  pairs: number
  /** Mean change to the next season, in the measure's units. */
  change: number
}

export interface AgeCurve {
  /** What was measured, for the reader. */
  measure: string
  /** How widely the measure is spread across the league in a season, in its units. An estimate. */
  spread: number
  /**
   * Neighbours on each side averaged into a step, weighted by pairs. The
   * measured steps jump about from one age to the next on a few hundred pairs,
   * and speed rests on one pair of seasons, so it is smoothed more.
   */
  smoothing: number
  steps: readonly AgeStep[]
}

const steps = (rows: readonly (readonly [number, number, number])[]): AgeStep[] =>
  rows.map(([age, pairs, change]) => ({ age, pairs, change }))

/** Skaters' ice time per Fixture, in minutes: the coaches' view of a Skater overall. */
export const ICE_TIME: AgeCurve = {
  measure: 'Skaters’ ice time per Fixture, minutes',
  spread: 3.5,
  smoothing: 1,
  // prettier-ignore
  steps: steps([
    [18, 23, 1.01], [19, 89, 0.83], [20, 186, 0.86], [21, 284, 0.74], [22, 425, 0.51],
    [23, 503, 0.35], [24, 533, 0.13], [25, 530, 0.02], [26, 507, 0.0], [27, 488, -0.04],
    [28, 436, -0.27], [29, 388, -0.27], [30, 350, -0.35], [31, 286, -0.54], [32, 216, -0.56],
    [33, 165, -0.74], [34, 121, -0.86], [35, 80, -1.03], [36, 51, -1.47], [37, 28, -1.21],
  ]),
}

/** Skaters' NHL EDGE top speed, in mph, from one pair of seasons. */
export const TOP_SPEED: AgeCurve = {
  measure: 'Skaters’ NHL EDGE top speed, mph, one pair of seasons',
  spread: 0.75,
  smoothing: 2,
  // prettier-ignore
  steps: steps([
    [19, 16, 0.7], [20, 36, 0.11], [21, 35, 0.18], [22, 42, 0.2], [23, 61, -0.0],
    [24, 51, 0.11], [25, 52, 0.2], [26, 57, -0.11], [27, 59, 0.03], [28, 58, 0.16],
    [29, 49, -0.1], [30, 50, -0.13], [31, 44, -0.06], [32, 40, -0.03], [33, 27, -0.2],
    [34, 19, -0.22], [35, 12, -0.1],
  ]),
}

/**
 * A group's curve: a measured one with its growth drawn out (ADR-026). Growth
 * that ended at `measuredGrowthEnd` ends at `growthEnd` instead, by as much in
 * all, so each Season's step is smaller; decline then follows the measured
 * curve as many years later.
 */
export interface DevelopmentCurve {
  base: AgeCurve
  /** The age growth ends at in the measurement. */
  measuredGrowthEnd: number
  /** The age growth ends at in the game. */
  growthEnd: number
}

/**
 * A group's step at an age, as a share of its measure's spread. Before
 * `growthEnd` the measured growth is read at a proportionally earlier age and
 * scaled down by the same proportion; from it on, the measured decline is read
 * the extra years earlier.
 */
export function changeAt(curve: DevelopmentCurve, age: number): number {
  const { base, measuredGrowthEnd, growthEnd } = curve
  const first = base.steps[0]!.age
  if (age >= growthEnd) return stepAt(base, age - (growthEnd - measuredGrowthEnd))
  const ratio = (measuredGrowthEnd - first) / (growthEnd - first)
  return stepAt(base, first + (age - first) * ratio) * ratio
}

/** Ice time grows until 26 and then holds, before it declines. */
const ICE_TIME_GROWTH_END = 26

/** Skill - `shooting`, `puckControl`, `checking`, a Goalie's `reflexes` and `recovery`: grows to 29. */
export const SKILL_CURVE: DevelopmentCurve = {
  base: ICE_TIME,
  measuredGrowthEnd: ICE_TIME_GROWTH_END,
  growthEnd: 29,
}

/** Reading the game - positioning, passing, blocking, faceoffs, a Goalie's technique: grows to 32. */
export const READING_CURVE: DevelopmentCurve = {
  base: ICE_TIME,
  measuredGrowthEnd: ICE_TIME_GROWTH_END,
  growthEnd: 32,
}

/** `speed` and `stamina`: the measured growth drawn out a year, to 29; decline from 29. */
export const PHYSICAL_CURVE: DevelopmentCurve = {
  base: TOP_SPEED,
  measuredGrowthEnd: 28,
  growthEnd: 29,
}

/**
 * A curve's step at an age as a share of its measure's spread, smoothed over
 * its neighbours. Before the first measured age the first step holds, and
 * after the last the last one does, so decline keeps going.
 */
export function stepAt(curve: AgeCurve, age: number): number {
  const { steps: measured, smoothing, spread } = curve
  const first = measured[0]!.age
  const last = measured[measured.length - 1]!.age
  const at = Math.max(first, Math.min(last, age))
  let sum = 0
  let weight = 0
  for (const step of measured) {
    if (Math.abs(step.age - at) > smoothing) continue
    sum += step.change * step.pairs
    weight += step.pairs
  }
  return sum / weight / spread
}
