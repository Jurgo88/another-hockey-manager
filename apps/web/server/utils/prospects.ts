import {
  DEFAULT_CONFIDENCE,
  displayName,
  groupSpread,
  naturalPosition,
  observedRange,
  playerLevel,
  positionGroup,
  type Player,
  type PositionGroup,
} from '@ahm/sim'
import type { ShownAttribute } from './attributes'

/** The widest a range gets, at no confidence, for a group spread as Skaters are. */
const MAX_SPREAD = 5

/** How sure the league is of a Player as a whole: the mean confidence of his attributes. */
export function confidenceOf(player: Player): number {
  const entries = Object.values(player.provenance ?? {}) as { confidence: number }[]
  if (entries.length === 0) return DEFAULT_CONFIDENCE.generated
  return entries.reduce((sum, entry) => sum + entry.confidence, 0) / entries.length
}

/**
 * A level as a range by confidence, as wide as the group's levels are spread
 * (#92): Goalies sit closer together than Skaters, so the same doubt spans
 * fewer points, and a Goalie's range still says something about him.
 */
function range(value: number, confidence: number, group: PositionGroup): ShownAttribute {
  const maxSpread = (MAX_SPREAD * groupSpread(group)) / groupSpread('forward')
  const { low, high } = observedRange(Math.round(value), confidence, { maxSpread })
  return { low, high }
}

/**
 * A prospect as a Manager sees him, in every league (ADR-028 amendment): his
 * level and `potential` as ranges by his confidence. `potential` is never a
 * figure (D-11). Levels compare only within a position group (ADR-028), so a
 * prospect carries his.
 */
export function prospectView(player: Player) {
  const confidence = confidenceOf(player)
  const group = positionGroup(player)
  return {
    id: player.id,
    name: displayName(player),
    age: player.age,
    position: naturalPosition(player),
    group,
    level: range(playerLevel(player), confidence, group),
    potential: range(player.potential, confidence, group),
  }
}

/** Prospects by position group, each group in the order of what is shown of them. */
export function byGroup<P extends ReturnType<typeof prospectView>>(
  prospects: readonly P[],
): Record<PositionGroup, P[]> {
  const sorted = [...prospects].sort(
    (a, b) =>
      b.potential.high - a.potential.high ||
      b.level.high - a.level.high ||
      a.name.localeCompare(b.name),
  )
  return {
    forward: sorted.filter((p) => p.group === 'forward'),
    defence: sorted.filter((p) => p.group === 'defence'),
    goalie: sorted.filter((p) => p.group === 'goalie'),
  }
}

/**
 * A Player on a Roster: his level as a figure in a generated league, and as a
 * range on a roster file (ADR-003 amendment).
 */
export function rosterView(player: Player, byConfidence: boolean) {
  const level = playerLevel(player)
  const group = positionGroup(player)
  return {
    id: player.id,
    name: displayName(player),
    age: player.age,
    position: naturalPosition(player),
    group,
    level: byConfidence
      ? range(level, confidenceOf(player), group)
      : { low: Math.round(level), high: Math.round(level) },
  }
}
