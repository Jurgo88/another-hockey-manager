import {
  DEFENCE_SLOT_ABILITY,
  FORWARD_SLOT_ABILITY,
  GOALIE_ABILITY_NOISE,
  GOALIE_SLOT_ABILITY,
  SKATER_ATTRIBUTE_KEYS,
  clubStrengths,
  createRng,
  drawAbility,
  generateSkaterAttributes,
  type Ability,
  type SkaterAttributes,
  type SkaterPosition,
} from '@ahm/sim'

/**
 * The distribution the engine is calibrated on, sampled from the generator
 * (ADR-021). Real Players are ranked and given the value at the same
 * percentile here, so a real league is exactly as spread as a generated one.
 */

/** Centres, wingers and defencemen differ in the generator's emphasis, so each is ranked on its own. */
export type PositionGroup = 'C' | 'W' | 'D'

export function groupOf(position: SkaterPosition): PositionGroup {
  if (position === 'C') return 'C'
  return position === 'LD' || position === 'RD' ? 'D' : 'W'
}

export interface Reference {
  /** Latent ability of a Skater, sorted, per group. */
  ability: Readonly<Record<PositionGroup, readonly Ability[]>>
  goalieAbility: readonly Ability[]
  /** Each attribute, sorted, per group. */
  attributes: Readonly<Record<PositionGroup, Readonly<Record<keyof SkaterAttributes, readonly number[]>>>>
}

const FORWARD_SLOT_POSITIONS: readonly SkaterPosition[] = ['LW', 'C', 'RW']
const DEFENCE_SLOT_POSITIONS: readonly SkaterPosition[] = ['LD', 'RD']

/** Thirty-two Clubs, as the generator draws them, `leagues` times over. */
export function buildReference(leagues = 24, seed = 21, clubCount = 32): Reference {
  const ability: Record<PositionGroup, Ability[]> = { C: [], W: [], D: [] }
  const goalieAbility: Ability[] = []
  const emptyAttributes = () =>
    Object.fromEntries(SKATER_ATTRIBUTE_KEYS.map((key) => [key, [] as number[]])) as Record<
      keyof SkaterAttributes,
      number[]
    >
  const attributes = { C: emptyAttributes(), W: emptyAttributes(), D: emptyAttributes() }

  const rng = createRng(seed)
  for (let league = 0; league < leagues; league++) {
    for (const strength of clubStrengths(rng, clubCount)) {
      const add = (slotAbility: Ability, position: SkaterPosition) => {
        const drawn = drawAbility(rng, slotAbility, strength).ability
        const group = groupOf(position)
        ability[group].push(drawn)
        const values = generateSkaterAttributes(rng, drawn, position)
        for (const key of SKATER_ATTRIBUTE_KEYS) attributes[group][key].push(values[key])
      }
      FORWARD_SLOT_ABILITY.forEach((slot, i) => add(slot, FORWARD_SLOT_POSITIONS[i % 3]!))
      DEFENCE_SLOT_ABILITY.forEach((slot, i) => add(slot, DEFENCE_SLOT_POSITIONS[i % 2]!))
      for (const slot of GOALIE_SLOT_ABILITY) {
        goalieAbility.push(drawAbility(rng, slot, strength, GOALIE_ABILITY_NOISE).ability)
      }
    }
  }

  const sorted = (values: number[]) => values.sort((a, b) => a - b)
  for (const group of ['C', 'W', 'D'] as const) {
    sorted(ability[group])
    for (const key of SKATER_ATTRIBUTE_KEYS) sorted(attributes[group][key])
  }
  return { ability, goalieAbility: sorted(goalieAbility), attributes }
}

/** The value at percentile `p` (0-1, exclusive) of a sorted sample. */
export function quantile(sorted: readonly number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))
  return sorted[index]!
}
