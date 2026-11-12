import { PENALTY_KILL_UNIT_SIZE, POWER_PLAY_UNIT_SIZE } from '../domain/club.js'
import type {
  Club,
  Lineup,
  MatchupPolicy,
  OvertimeTrio,
  Pairing,
  Tactics,
  Unit,
} from '../domain/club.js'
import type { Line } from '../domain/club.js'
import { skaterLevel, type PlayerId, type Skater, type SkaterPosition } from '../domain/player.js'

/**
 * Lineup validity rules plus a naive AI builder (FR-20, FR-09).
 *
 * The AI builder goes through the same validation every human Manager's
 * Lineup will - there is no `if (human)` shortcut (D-04). Validation returns
 * every violation it finds rather than throwing on the first one, so a
 * caller (this builder today, a UI later) can show a Manager the whole list
 * at once instead of a fix-one-see-the-next loop.
 */

export type LineupRule =
  | 'roster-size'
  | 'not-on-roster'
  | 'illegal-position'
  | 'duplicate-player'
  | 'goalies-not-distinct'
  | 'overtime-rotation-empty'
  | 'overtime-rotation-invalid'
  | 'special-teams-unit-invalid'
  | 'not-dressed'
  | 'tactics-invalid'
  | 'playoff-cap'

export interface LineupViolation {
  rule: LineupRule
  message: string
}

const LINE_SLOTS: readonly (readonly [keyof Line, SkaterPosition])[] = [
  ['leftWing', 'LW'],
  ['centre', 'C'],
  ['rightWing', 'RW'],
]

const PAIRING_SLOTS: readonly (readonly [keyof Pairing, SkaterPosition])[] = [
  ['leftDefence', 'LD'],
  ['rightDefence', 'RD'],
]

function violation(rule: LineupRule, message: string): LineupViolation {
  return { rule, message }
}

/** Validates a Lineup against its own Club's Roster. Pure - no I/O, no mutation. */
export function validateLineup(lineup: Lineup, club: Club): readonly LineupViolation[] {
  const violations: LineupViolation[] = []
  const skaterById = new Map(club.skaters.map((s) => [s.id, s]))
  const goalieById = new Map(club.goalies.map((g) => [g.id, g]))

  if (lineup.lines.length !== 4 || lineup.pairings.length !== 3) {
    violations.push(
      violation('roster-size', 'A Lineup dresses exactly 4 Lines and 3 Pairings (FR-20).'),
    )
  }

  // The base 18: every dressed Skater and the position slot they fill.
  const dressed = new Map<PlayerId, SkaterPosition>()
  const seenTwice = new Set<PlayerId>()

  const checkSlot = (playerId: PlayerId, position: SkaterPosition, where: string) => {
    if (dressed.has(playerId)) seenTwice.add(playerId)
    dressed.set(playerId, position)

    const skater = skaterById.get(playerId)
    if (!skater) {
      violations.push(
        violation('not-on-roster', `${where}: Player ${playerId} is not a Skater on ${club.id}.`),
      )
      return
    }
    if (!skater.preferredPositions.includes(position)) {
      violations.push(
        violation(
          'illegal-position',
          `${where}: ${skater.firstName} ${skater.lastName} cannot play ${position} (preferred: ${skater.preferredPositions.join(', ')}).`,
        ),
      )
    }
  }

  lineup.lines.forEach((line, i) => {
    for (const [key, position] of LINE_SLOTS) {
      checkSlot(line[key], position, `Line ${i + 1} ${position}`)
    }
  })
  lineup.pairings.forEach((pairing, i) => {
    for (const [key, position] of PAIRING_SLOTS) {
      checkSlot(pairing[key], position, `Pairing ${i + 1} ${position}`)
    }
  })

  for (const playerId of seenTwice) {
    violations.push(
      violation('duplicate-player', `Player ${playerId} is dressed in more than one slot.`),
    )
  }

  if (!goalieById.has(lineup.starter)) {
    violations.push(
      violation('not-on-roster', `Starter ${lineup.starter} is not a Goalie on ${club.id}.`),
    )
  }
  if (!goalieById.has(lineup.backup)) {
    violations.push(
      violation('not-on-roster', `Backup ${lineup.backup} is not a Goalie on ${club.id}.`),
    )
  }
  if (lineup.starter === lineup.backup) {
    violations.push(
      violation('goalies-not-distinct', 'Starter and backup Goalie must be different Players.'),
    )
  }

  if (lineup.overtimeRotation.length === 0) {
    violations.push(
      violation('overtime-rotation-empty', 'At least one overtime trio is required (FR-09).'),
    )
  }
  for (const [i, trio] of lineup.overtimeRotation.entries()) {
    const ids = trio.players
    const distinct = new Set(ids)
    if (distinct.size !== ids.length) {
      violations.push(
        violation('overtime-rotation-invalid', `Overtime trio ${i + 1} repeats a Player.`),
      )
    }
    for (const playerId of ids) {
      if (!dressed.has(playerId)) {
        violations.push(
          violation(
            'overtime-rotation-invalid',
            `Overtime trio ${i + 1} uses ${playerId}, who is not dressed.`,
          ),
        )
      }
    }
  }

  const checkUnitGroup = (units: readonly Unit[], label: string, size: number) => {
    if (units.length === 0 || units.length > 2) {
      violations.push(
        violation(
          'special-teams-unit-invalid',
          `${label} declares ${units.length} units; 1 or 2 are required.`,
        ),
      )
    }
    units.forEach((unit, i) => {
      const memberIds = unit.skaters
      if (memberIds.length !== size) {
        violations.push(
          violation(
            'special-teams-unit-invalid',
            `${label} unit ${i + 1} lists ${memberIds.length} Skaters; it needs exactly ${size} (ADR-009).`,
          ),
        )
      }
      const distinct = new Set(memberIds)
      if (distinct.size !== memberIds.length) {
        violations.push(
          violation('special-teams-unit-invalid', `${label} unit ${i + 1} repeats a Player.`),
        )
      }
      for (const playerId of memberIds) {
        if (!dressed.has(playerId)) {
          violations.push(
            violation(
              'special-teams-unit-invalid',
              `${label} unit ${i + 1} uses ${playerId}, who is not dressed.`,
            ),
          )
        }
      }
    })
  }
  checkUnitGroup(lineup.powerPlayUnits, 'Power play', POWER_PLAY_UNIT_SIZE)
  checkUnitGroup(lineup.penaltyKillUnits, 'Penalty kill', PENALTY_KILL_UNIT_SIZE)
  violations.push(...tacticsViolations(lineup.tactics))

  return violations
}

const MATCHUP_POLICIES: readonly MatchupPolicy[] = ['none', 'exploit', 'shutdown']

function tacticsViolations(tactics: Tactics): LineupViolation[] {
  const { aggression, shotVolume, shiftLength, matchup, goalieRotation } = tactics
  const found: LineupViolation[] = []
  for (const [name, value] of Object.entries({ aggression, shotVolume, shiftLength })) {
    if (!(value >= 0 && value <= 100)) {
      found.push(violation('tactics-invalid', `${name} must be between 0 and 100.`))
    }
  }
  if (!MATCHUP_POLICIES.includes(matchup)) {
    found.push(violation('tactics-invalid', `Unknown matchup policy ${matchup}.`))
  }
  const { maxConsecutiveStarts } = goalieRotation
  if (maxConsecutiveStarts !== null && !(maxConsecutiveStarts >= 1)) {
    found.push(violation('tactics-invalid', 'A limit on starts running must be at least 1.'))
  }
  return found
}

/** One place in a Lineup a Player can stand. */
export type LineupSlot =
  | { group: 'line'; index: number; key: keyof Line }
  | { group: 'pairing'; index: number; key: keyof Pairing }
  | { group: 'goalie'; key: 'starter' | 'backup' }
  | { group: 'powerPlay' | 'penaltyKill' | 'overtime'; index: number; position: number }

export function playerAt(lineup: Lineup, slot: LineupSlot): PlayerId {
  switch (slot.group) {
    case 'line':
      return lineup.lines[slot.index]![slot.key]
    case 'pairing':
      return lineup.pairings[slot.index]![slot.key]
    case 'goalie':
      return lineup[slot.key]
    case 'powerPlay':
      return lineup.powerPlayUnits[slot.index]!.skaters[slot.position]!
    case 'penaltyKill':
      return lineup.penaltyKillUnits[slot.index]!.skaters[slot.position]!
    case 'overtime':
      return lineup.overtimeRotation[slot.index]!.players[slot.position]!
  }
}

function withPlayerAt(lineup: Lineup, slot: LineupSlot, player: PlayerId): Lineup {
  const replaced = <T>(items: readonly T[], index: number, item: T): T[] =>
    items.map((existing, i) => (i === index ? item : existing))
  const inUnit = (units: readonly Unit[], index: number, position: number): Unit[] =>
    replaced(units, index, { skaters: replaced(units[index]!.skaters, position, player) })

  switch (slot.group) {
    case 'line': {
      const line = { ...lineup.lines[slot.index]!, [slot.key]: player }
      return { ...lineup, lines: replaced(lineup.lines, slot.index, line) as unknown as Lineup['lines'] }
    }
    case 'pairing': {
      const pairing = { ...lineup.pairings[slot.index]!, [slot.key]: player }
      return {
        ...lineup,
        pairings: replaced(lineup.pairings, slot.index, pairing) as unknown as Lineup['pairings'],
      }
    }
    case 'goalie':
      return { ...lineup, [slot.key]: player }
    case 'powerPlay':
      return { ...lineup, powerPlayUnits: inUnit(lineup.powerPlayUnits, slot.index, slot.position) }
    case 'penaltyKill':
      return {
        ...lineup,
        penaltyKillUnits: inUnit(lineup.penaltyKillUnits, slot.index, slot.position),
      }
    case 'overtime': {
      const { players } = lineup.overtimeRotation[slot.index]!
      const trio: OvertimeTrio = {
        players: replaced(players, slot.position, player) as unknown as OvertimeTrio['players'],
      }
      return { ...lineup, overtimeRotation: replaced(lineup.overtimeRotation, slot.index, trio) }
    }
  }
}

/** Two Players trade places. Only these two slots change: a Unit keeps its own list. */
export function swapSlots(lineup: Lineup, a: LineupSlot, b: LineupSlot): Lineup {
  const first = playerAt(lineup, a)
  const second = playerAt(lineup, b)
  return withPlayerAt(withPlayerAt(lineup, a, second), b, first)
}

/**
 * A Player from outside the Lineup takes a slot, and takes over everywhere
 * from the one who leaves, since a Unit may only list those dressed.
 */
export function bringIn(lineup: Lineup, slot: LineupSlot, player: PlayerId): Lineup {
  const leaving = playerAt(lineup, slot)
  const swapped = (id: PlayerId) => (id === leaving ? player : id)
  const inUnits = (units: readonly Unit[]) =>
    units.map((unit) => ({ skaters: unit.skaters.map(swapped) }))

  return {
    ...withPlayerAt(lineup, slot, player),
    powerPlayUnits: inUnits(lineup.powerPlayUnits),
    penaltyKillUnits: inUnits(lineup.penaltyKillUnits),
    overtimeRotation: lineup.overtimeRotation.map((trio) => ({
      players: trio.players.map(swapped) as unknown as OvertimeTrio['players'],
    })),
  }
}

/**
 * Naive default Tactics: no matchup targeting, middle-of-the-road sliders.
 * A starting point for both the naive builder and a human Manager's first Lineup.
 */
export const DEFAULT_TACTICS: Tactics = {
  aggression: 50,
  shotVolume: 50,
  shiftLength: 50,
  matchup: 'none' satisfies MatchupPolicy,
  // One goal down at two minutes, two down at three, three down at four
  // only with a power play to make it 6-on-4. Provisional (OQ #10).
  pullGoalie: [
    { deficit: 1, secondsRemaining: 120, powerPlayOnly: false },
    { deficit: 2, secondsRemaining: 180, powerPlayOnly: false },
    { deficit: 3, secondsRemaining: 240, powerPlayOnly: true },
  ],
  // Measured: the same Goalie starts both ends of a back-to-back 8.1% of the time.
  goalieRotation: {
    restOnBackToBack: true,
    maxConsecutiveStarts: 2,
  },
}

/**
 * Moves a Skater to the bottom of their column, everyone below stepping up a
 * Line or Pairing in the same position. A Skater not dressed changes nothing.
 * This is how a Lineup answers an injury, in a Match or between Fixtures, so
 * a Manager's Lines survive it and come back whole (ADR-012).
 */
export function movedToBottom(lineup: Lineup, playerId: PlayerId): Lineup {
  const lower = <T extends object>(units: readonly T[]): T[] => {
    const next = [...units]
    for (const key of Object.keys(next[0]!) as (keyof T)[]) {
      const from = next.findIndex((unit) => unit[key] === (playerId as T[keyof T]))
      if (from === -1) continue
      for (let i = from; i < next.length - 1; i++) {
        next[i] = { ...next[i]!, [key]: next[i + 1]![key] }
      }
      next[next.length - 1] = { ...next.at(-1)!, [key]: playerId }
    }
    return next
  }

  return {
    ...lineup,
    lines: lower(lineup.lines) as unknown as Lineup['lines'],
    pairings: lower(lineup.pairings) as unknown as Lineup['pairings'],
  }
}

/**
 * The Lineup with nobody in `out` in it, for the same Manager and the same
 * rule whoever that is (D-04). Everyone below moves up, the best healthy spare
 * for the position takes the empty slot, and the next healthy Goalie on the
 * Roster dresses. A Roster with nobody left keeps the injured Player.
 */
export function withoutInjured(club: Club, lineup: Lineup, out: ReadonlySet<PlayerId>): Lineup {
  const dressed = (l: Lineup) => [
    ...l.lines.flatMap((line) => LINE_SLOTS.map(([key]) => line[key])),
    ...l.pairings.flatMap((pairing) => PAIRING_SLOTS.map(([key]) => pairing[key])),
  ]
  const goalieIds = [lineup.starter, lineup.backup, ...club.goalies.map((g) => g.id)]
  const healthyGoalies = [...new Set(goalieIds)].filter((id) => !out.has(id))
  const goalies = {
    starter: healthyGoalies[0] ?? lineup.starter,
    backup: healthyGoalies[1] ?? lineup.backup,
  }
  if (!dressed(lineup).some((id) => out.has(id))) return { ...lineup, ...goalies }

  const moved = dressed(lineup)
    .filter((id) => out.has(id))
    .reduce(movedToBottom, lineup)

  const onLineup = new Set(dressed(moved))
  const spares = club.skaters
    .filter((s) => !onLineup.has(s.id) && !out.has(s.id))
    .sort(byQualityDesc)

  const replacement = new Map<PlayerId, PlayerId>()
  const fill = (playerId: PlayerId, position: SkaterPosition): PlayerId => {
    if (!out.has(playerId)) return playerId
    const index = spares.findIndex((s) => s.preferredPositions.includes(position))
    const spare = spares.splice(Math.max(index, 0), 1)[0]
    if (!spare) return playerId
    replacement.set(playerId, spare.id)
    return spare.id
  }

  const fillSlots = <T extends object>(
    unit: T,
    slots: readonly (readonly [keyof T, SkaterPosition])[],
  ): T => {
    const next = { ...unit }
    for (const [key, position] of slots) {
      next[key] = fill(unit[key] as PlayerId, position) as T[keyof T]
    }
    return next
  }

  const lines = moved.lines.map((line) => fillSlots(line, LINE_SLOTS))
  const pairings = moved.pairings.map((pairing) => fillSlots(pairing, PAIRING_SLOTS))
  const standIn = (id: PlayerId) => replacement.get(id) ?? id

  return {
    ...moved,
    ...goalies,
    lines: lines as unknown as Lineup['lines'],
    pairings: pairings as unknown as Lineup['pairings'],
    powerPlayUnits: moved.powerPlayUnits.map((u) => ({ skaters: u.skaters.map(standIn) })),
    penaltyKillUnits: moved.penaltyKillUnits.map((u) => ({ skaters: u.skaters.map(standIn) })),
    overtimeRotation: moved.overtimeRotation.map((trio) => ({
      players: [standIn(trio.players[0]), standIn(trio.players[1]), standIn(trio.players[2])],
    })),
  }
}

/** Who a Club last put in net, and how many Fixtures running they have started. */
export interface GoalieHistory {
  goalie: PlayerId
  day: number
  consecutiveStarts: number
}

/**
 * The declared Lineup as it stands for a Fixture on `day`: its `goalieRotation`
 * applied to its two Goalies, the same for every Manager (D-04). The engine
 * only ever reads `starter`, so a Manager can also simply set it.
 */
export function lineupForFixture(
  lineup: Lineup,
  day: number,
  history: GoalieHistory | null,
): Lineup {
  if (history === null) return lineup

  const { restOnBackToBack, maxConsecutiveStarts } = lineup.tactics.goalieRotation
  const playedYesterday = day - history.day === 1
  const sits =
    (restOnBackToBack && playedYesterday) ||
    (maxConsecutiveStarts !== null && history.consecutiveStarts >= maxConsecutiveStarts)
  if (!sits || history.goalie === lineup.backup) return lineup

  return { ...lineup, starter: lineup.backup, backup: lineup.starter }
}

/** The history after a Club puts `goalie` in net on `day`. */
export function afterStart(
  history: GoalieHistory | null,
  goalie: PlayerId,
  day: number,
): GoalieHistory {
  const consecutiveStarts = history?.goalie === goalie ? history.consecutiveStarts + 1 : 1
  return { goalie, day, consecutiveStarts }
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Overall quality: the Skater's level (ADR-020), without `faceoffs` and
 * `discipline`, which say nothing about how good a winger is (#81).
 */
function skaterQuality(skater: Skater): number {
  return skaterLevel(skater.attributes)
}

/**
 * Equal quality goes by id, compared by code unit: `localeCompare` follows the
 * host's locale, and a Slovak one sorts "ch" after "h", so a Season played on
 * another machine came out different (D-01).
 */
function byQualityDesc(a: Skater, b: Skater): number {
  return skaterQuality(b) - skaterQuality(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * What playing away from his natural position costs a Skater when the naive
 * builder weighs him, in level points. Enough that a Club's natural positions
 * hold when the difference is small, little enough that a second star at the
 * same position moves to his second one rather than to the second Line (#81).
 */
export const SECOND_POSITION_COST = 1

/** How many candidates per slot the builder weighs for one unit. Enough to never miss the best. */
const CANDIDATES_PER_SLOT = 6

/** Can `units` more units of `positions` still be filled from `pool`? Bipartite matching, slot by slot. */
function canFill(pool: readonly Skater[], positions: readonly SkaterPosition[], units: number): boolean {
  const slots = Array.from({ length: units }, () => positions).flat()
  const holder = new Map<string, number>()
  const assign = (slot: number, seen: Set<string>): boolean => {
    for (const skater of pool) {
      if (!skater.preferredPositions.includes(slots[slot]!) || seen.has(skater.id)) continue
      seen.add(skater.id)
      const current = holder.get(skater.id)
      if (current === undefined || assign(current, seen)) {
        holder.set(skater.id, slot)
        return true
      }
    }
    return false
  }
  return slots.every((_, slot) => assign(slot, new Set()))
}

/**
 * Units filled in order, the first the strongest (#81): for each, the Skaters
 * at its positions with the greatest level, any preferred position allowed at
 * `SECOND_POSITION_COST`, as long as the units after it can still be filled.
 */
function fillUnits(
  skaters: readonly Skater[],
  positions: readonly SkaterPosition[],
  units: number,
): Skater[][] {
  let pool = [...skaters].sort(byQualityDesc)
  if (!canFill(pool, positions, units)) {
    throw new Error(
      `Naive Lineup builder needs ${units} each of ${positions.join(', ')}, and this Club cannot dress them.`,
    )
  }

  const value = (skater: Skater, position: SkaterPosition) =>
    skaterQuality(skater) - (skater.preferredPositions[0] === position ? 0 : SECOND_POSITION_COST)

  const filled: Skater[][] = []
  for (let unit = 0; unit < units; unit++) {
    const candidates = positions.map((position) =>
      pool.filter((s) => s.preferredPositions.includes(position)).slice(0, CANDIDATES_PER_SLOT),
    )
    let best: { skaters: Skater[]; value: number } | null = null
    const search = (slot: number, chosen: Skater[], total: number) => {
      if (slot === positions.length) {
        if (best && total <= best.value) return
        const rest = pool.filter((s) => !chosen.includes(s))
        if (canFill(rest, positions, units - unit - 1)) best = { skaters: [...chosen], value: total }
        return
      }
      for (const skater of candidates[slot]!) {
        if (chosen.includes(skater)) continue
        search(slot + 1, [...chosen, skater], total + value(skater, positions[slot]!))
      }
    }
    search(0, [], 0)
    const chosen = (best as { skaters: Skater[] } | null)?.skaters
    if (!chosen) throw new Error(`Naive Lineup builder could not fill unit ${unit + 1}`)
    filled.push(chosen)
    pool = pool.filter((s) => !chosen.includes(s))
  }
  return filled
}

/**
 * Fills the Lines and Pairings in order by level, at second positions where it
 * pays (#81) - deliberately naive, not a tactical Lineup. Goes through no path a human Manager's Lineup
 * would not also go through (D-04).
 */
export function buildNaiveLineup(club: Club, tactics: Tactics = DEFAULT_TACTICS): Lineup {
  const forwardUnits = fillUnits(club.skaters, ['LW', 'C', 'RW'], 4)
  const lw = forwardUnits.map((line) => line[0]!)
  const centres = forwardUnits.map((line) => line[1]!)
  const rw = forwardUnits.map((line) => line[2]!)
  const defenceUnits = fillUnits(club.skaters, ['LD', 'RD'], 3)
  const ld = defenceUnits.map((pairing) => pairing[0]!)
  const rd = defenceUnits.map((pairing) => pairing[1]!)

  const lines: Line[] = [0, 1, 2, 3].map((i) => ({
    leftWing: lw[i]!.id,
    centre: centres[i]!.id,
    rightWing: rw[i]!.id,
  }))
  const pairings: Pairing[] = [0, 1, 2].map((i) => ({
    leftDefence: ld[i]!.id,
    rightDefence: rd[i]!.id,
  }))

  const goalies = [...club.goalies].sort(
    (a, b) => mean(Object.values(b.attributes)) - mean(Object.values(a.attributes)),
  )
  if (goalies.length < 2) {
    throw new Error(
      `Naive Lineup builder needs 2 Goalies, only ${goalies.length} available on ${club.id}.`,
    )
  }

  const bestBy = (score: (s: Skater) => number) => (a: Skater, b: Skater) => score(b) - score(a)
  const powerPlayForwards = [...lw, ...centres, ...rw].sort(
    bestBy((s) => s.attributes.shooting + s.attributes.offPositioning + s.attributes.passing),
  )
  const powerPlayDefence = [...ld, ...rd].sort(
    bestBy((s) => s.attributes.shooting + s.attributes.passing),
  )
  // The best defensive forwards kill penalties, whichever Line they play on.
  const killForwards = [...lw, ...centres, ...rw].sort(
    bestBy((s) => s.attributes.defPositioning + s.attributes.checking),
  )
  const killDefence = [...ld, ...rd].sort(
    bestBy((s) => s.attributes.defPositioning + s.attributes.shotBlocking),
  )

  const dressedSkaters = [...lw, ...centres, ...rw, ...ld, ...rd]
  const overallByQuality = [...dressedSkaters].sort(byQualityDesc)
  const overtimeRotation: OvertimeTrio[] = [0, 1].map((i): OvertimeTrio => {
    const trio = overallByQuality.slice(i * 3, i * 3 + 3)
    return { players: [trio[0]!.id, trio[1]!.id, trio[2]!.id] }
  })

  return {
    clubId: club.id,
    lines: [lines[0]!, lines[1]!, lines[2]!, lines[3]!],
    pairings: [pairings[0]!, pairings[1]!, pairings[2]!],
    starter: goalies[0]!.id,
    backup: goalies[1]!.id,
    // Naive: four forwards and a defenceman on each power play, the fourth
    // forward listed last so a 4-on-3 keeps three forwards and the point. The
    // kill takes the most defensive forwards and defencemen, defencemen
    // listed first so a 5-on-3 kill keeps both of them (ADR-009).
    powerPlayUnits: [0, 1].map((i) => ({
      skaters: [
        powerPlayForwards[4 * i]!.id,
        powerPlayForwards[4 * i + 1]!.id,
        powerPlayForwards[4 * i + 2]!.id,
        powerPlayDefence[i]!.id,
        powerPlayForwards[4 * i + 3]!.id,
      ],
    })),
    penaltyKillUnits: [0, 1].map((i) => ({
      skaters: [
        killDefence[2 * i]!.id,
        killDefence[2 * i + 1]!.id,
        killForwards[2 * i]!.id,
        killForwards[2 * i + 1]!.id,
      ],
    })),
    overtimeRotation: [overtimeRotation[0]!, overtimeRotation[1]!],
    tactics,
  }
}
