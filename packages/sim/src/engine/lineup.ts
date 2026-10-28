import { SKATER_ATTRIBUTE_KEYS } from '../domain/attributes.js'
import { PENALTY_KILL_UNIT_SIZE, POWER_PLAY_UNIT_SIZE } from '../domain/club.js'
import type { Club, Lineup, MatchupPolicy, OvertimeTrio, Pairing, Tactics, Unit } from '../domain/club.js'
import type { Line } from '../domain/club.js'
import type { PlayerId, Skater, SkaterPosition } from '../domain/player.js'

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
      violations.push(violation('not-on-roster', `${where}: Player ${playerId} is not a Skater on ${club.id}.`))
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
    violations.push(violation('duplicate-player', `Player ${playerId} is dressed in more than one slot.`))
  }

  if (!goalieById.has(lineup.starter)) {
    violations.push(violation('not-on-roster', `Starter ${lineup.starter} is not a Goalie on ${club.id}.`))
  }
  if (!goalieById.has(lineup.backup)) {
    violations.push(violation('not-on-roster', `Backup ${lineup.backup} is not a Goalie on ${club.id}.`))
  }
  if (lineup.starter === lineup.backup) {
    violations.push(violation('goalies-not-distinct', 'Starter and backup Goalie must be different Players.'))
  }

  if (lineup.overtimeRotation.length === 0) {
    violations.push(violation('overtime-rotation-empty', 'At least one overtime trio is required (FR-09).'))
  }
  for (const [i, trio] of lineup.overtimeRotation.entries()) {
    const ids = trio.players
    const distinct = new Set(ids)
    if (distinct.size !== ids.length) {
      violations.push(violation('overtime-rotation-invalid', `Overtime trio ${i + 1} repeats a Player.`))
    }
    for (const playerId of ids) {
      if (!dressed.has(playerId)) {
        violations.push(
          violation('overtime-rotation-invalid', `Overtime trio ${i + 1} uses ${playerId}, who is not dressed.`),
        )
      }
    }
  }

  const checkUnitGroup = (units: readonly Unit[], label: string, size: number) => {
    if (units.length === 0 || units.length > 2) {
      violations.push(
        violation('special-teams-unit-invalid', `${label} declares ${units.length} units; 1 or 2 are required.`),
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
        violations.push(violation('special-teams-unit-invalid', `${label} unit ${i + 1} repeats a Player.`))
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

  return violations
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
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Overall quality: the plain mean of every Skater attribute. Deliberately naive - sort by attribute, fill in order. */
function skaterQuality(skater: Skater): number {
  return mean(SKATER_ATTRIBUTE_KEYS.map((key) => skater.attributes[key]))
}

function byQualityDesc(a: Skater, b: Skater): number {
  return skaterQuality(b) - skaterQuality(a)
}

function takeByPosition(skaters: readonly Skater[], position: SkaterPosition, count: number): Skater[] {
  const pool = skaters.filter((s) => s.preferredPositions[0] === position).sort(byQualityDesc)
  if (pool.length < count) {
    throw new Error(
      `Naive Lineup builder needs ${count} natural ${position}s, only ${pool.length} available on this Club.`,
    )
  }
  return pool.slice(0, count)
}

/**
 * Sorts by attribute and fills in order (issue #2 scope - deliberately naive,
 * not a tactical Lineup). Goes through no path a human Manager's Lineup
 * would not also go through (D-04).
 */
export function buildNaiveLineup(club: Club, tactics: Tactics = DEFAULT_TACTICS): Lineup {
  const lw = takeByPosition(club.skaters, 'LW', 4)
  const centres = takeByPosition(club.skaters, 'C', 4)
  const rw = takeByPosition(club.skaters, 'RW', 4)
  const ld = takeByPosition(club.skaters, 'LD', 3)
  const rd = takeByPosition(club.skaters, 'RD', 3)

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
    throw new Error(`Naive Lineup builder needs 2 Goalies, only ${goalies.length} available on ${club.id}.`)
  }

  const bestBy = (score: (s: Skater) => number) => (a: Skater, b: Skater) => score(b) - score(a)
  const powerPlayForwards = [...lw, ...centres, ...rw].sort(
    bestBy((s) => s.attributes.shooting + s.attributes.offPositioning + s.attributes.passing),
  )
  const powerPlayDefence = [...ld, ...rd].sort(bestBy((s) => s.attributes.shooting + s.attributes.passing))
  // The best defensive forwards kill penalties, whichever Line they play on.
  const killForwards = [...lw, ...centres, ...rw].sort(
    bestBy((s) => s.attributes.defPositioning + s.attributes.checking),
  )
  const killDefence = [...ld, ...rd].sort(bestBy((s) => s.attributes.defPositioning + s.attributes.shotBlocking))

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
      skaters: [killDefence[2 * i]!.id, killDefence[2 * i + 1]!.id, killForwards[2 * i]!.id, killForwards[2 * i + 1]!.id],
    })),
    overtimeRotation: [overtimeRotation[0]!, overtimeRotation[1]!],
    tactics,
  }
}
