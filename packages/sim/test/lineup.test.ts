import { beforeAll, describe, expect, it } from 'vitest'
import { SKATER_ATTRIBUTE_KEYS } from '../src/domain/attributes.js'
import type { Club, GoalieRotation, Lineup, Tactics } from '../src/domain/club.js'
import {
  afterStart,
  bringIn,
  buildNaiveLineup,
  DEFAULT_TACTICS,
  lineupForFixture,
  playerAt,
  swapSlots,
  validateLineup,
  type LineupRule,
  type LineupSlot,
} from '../src/engine/lineup.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'

const IDENTITIES = new Map(
  NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
)

const provider = createGeneratedRosterProvider({
  structure: NHL_2026_27,
  seed: 2026,
  clubIdentities: IDENTITIES,
})

let clubs: readonly Club[]
let bruins: Club

beforeAll(async () => {
  const result = await provider.loadCompetition('nhl')
  clubs = result.clubs
  bruins = clubs.find((c) => c.id === 'bos')!
})

const rulesOf = (violations: readonly { rule: LineupRule }[]) => violations.map((v) => v.rule)

describe('lineupForFixture (ADR-011)', () => {
  const lineup = (rotation: GoalieRotation): Lineup => ({
    ...({} as Lineup),
    starter: 'first',
    backup: 'second',
    tactics: { ...DEFAULT_TACTICS, goalieRotation: rotation },
  })
  const rest = lineup({ restOnBackToBack: true, maxConsecutiveStarts: 3 })
  const ride = lineup({ restOnBackToBack: false, maxConsecutiveStarts: null })

  it('starts the declared starter when nothing has happened yet', () => {
    expect(lineupForFixture(rest, 0, null)).toBe(rest)
  })

  it('sits whoever played yesterday', () => {
    const history = { goalie: 'first', day: 9, consecutiveStarts: 1 }
    const today = lineupForFixture(rest, 10, history)
    expect(today.starter).toBe('second')
    expect(today.backup).toBe('first')
  })

  it('returns the starter after the backup played yesterday', () => {
    const history = { goalie: 'second', day: 9, consecutiveStarts: 1 }
    expect(lineupForFixture(rest, 10, history).starter).toBe('first')
  })

  it('keeps the starter after a day off', () => {
    const history = { goalie: 'first', day: 8, consecutiveStarts: 2 }
    expect(lineupForFixture(rest, 10, history).starter).toBe('first')
  })

  it('sits the starter after too many starts running', () => {
    const history = { goalie: 'first', day: 7, consecutiveStarts: 3 }
    expect(lineupForFixture(rest, 10, history).starter).toBe('second')
  })

  it('rides the starter with no rule, even on a back-to-back', () => {
    const history = { goalie: 'first', day: 9, consecutiveStarts: 40 }
    expect(lineupForFixture(ride, 10, history)).toBe(ride)
  })

  it('counts starts running, and starts again for a new Goalie', () => {
    const once = afterStart(null, 'first', 1)
    const twice = afterStart(once, 'first', 3)
    expect(twice).toEqual({ goalie: 'first', day: 3, consecutiveStarts: 2 })
    expect(afterStart(twice, 'second', 4).consecutiveStarts).toBe(1)
  })
})

describe('buildNaiveLineup', () => {
  it('produces a valid Lineup for every generated Club', () => {
    for (const club of clubs) {
      const lineup = buildNaiveLineup(club)
      const violations = validateLineup(lineup, club)
      expect({ club: club.id, violations }).toEqual({ club: club.id, violations: [] })
    }
  })

  it('dresses 18 distinct Skaters and 2 distinct Goalies', () => {
    const lineup = buildNaiveLineup(bruins)
    const skaterIds = [
      ...lineup.lines.flatMap((l) => [l.leftWing, l.centre, l.rightWing]),
      ...lineup.pairings.flatMap((p) => [p.leftDefence, p.rightDefence]),
    ]
    expect(new Set(skaterIds).size).toBe(18)
    expect(lineup.starter).not.toBe(lineup.backup)
  })

  it('declines in quality from Line 1 to Line 4', () => {
    const lineup = buildNaiveLineup(bruins)
    const skaterById = new Map(bruins.skaters.map((s) => [s.id, s]))
    const quality = (id: string) => {
      const s = skaterById.get(id)!
      const values = SKATER_ATTRIBUTE_KEYS.map((key) => s.attributes[key])
      return values.reduce((sum, v) => sum + v, 0) / values.length
    }
    const lineQuality = (i: number) => {
      const l = lineup.lines[i]!
      return (quality(l.leftWing) + quality(l.centre) + quality(l.rightWing)) / 3
    }
    expect(lineQuality(0)).toBeGreaterThanOrEqual(lineQuality(1))
    expect(lineQuality(1)).toBeGreaterThanOrEqual(lineQuality(2))
    expect(lineQuality(2)).toBeGreaterThanOrEqual(lineQuality(3))
  })

  it('supplies at least one overtime trio drawn from the dressed Skaters', () => {
    const lineup = buildNaiveLineup(bruins)
    expect(lineup.overtimeRotation.length).toBeGreaterThan(0)
  })
})

describe('validateLineup', () => {
  it('accepts a valid Lineup with zero violations', () => {
    const lineup = buildNaiveLineup(bruins)
    expect(validateLineup(lineup, bruins)).toEqual([])
  })

  it('rejects a Skater dressed in two slots at once (duplicate-player)', () => {
    const lineup = buildNaiveLineup(bruins)
    const broken: Lineup = {
      ...lineup,
      pairings: [
        { ...lineup.pairings[0], leftDefence: lineup.lines[0].leftWing },
        lineup.pairings[1],
        lineup.pairings[2],
      ],
    }
    expect(rulesOf(validateLineup(broken, bruins))).toContain('duplicate-player')
  })

  it('rejects a Skater placed at a position they cannot play (illegal-position)', () => {
    const lineup = buildNaiveLineup(bruins)
    const rightDefenceOnly = bruins.skaters.find(
      (s) => s.preferredPositions.length === 1 && s.preferredPositions[0] === 'RD',
    )
    // Fall back to any RD-capable Skater not currently at centre if none is RD-exclusive.
    const forcedIntoCentre =
      rightDefenceOnly ?? bruins.skaters.find((s) => s.preferredPositions[0] === 'RD')!
    const broken: Lineup = {
      ...lineup,
      lines: [
        { ...lineup.lines[0], centre: forcedIntoCentre.id },
        lineup.lines[1],
        lineup.lines[2],
        lineup.lines[3],
      ],
    }
    expect(rulesOf(validateLineup(broken, bruins))).toContain('illegal-position')
  })

  it('rejects the same Goalie as starter and backup (goalies-not-distinct)', () => {
    const lineup = buildNaiveLineup(bruins)
    const broken = { ...lineup, backup: lineup.starter }
    expect(rulesOf(validateLineup(broken, bruins))).toContain('goalies-not-distinct')
  })

  it('rejects a Player id that is not on the Club (not-on-roster)', () => {
    const lineup = buildNaiveLineup(bruins)
    const broken = { ...lineup, starter: 'nobody' }
    expect(rulesOf(validateLineup(broken, bruins))).toContain('not-on-roster')
  })

  it('rejects an empty overtime rotation (overtime-rotation-empty)', () => {
    const lineup = buildNaiveLineup(bruins)
    const broken = { ...lineup, overtimeRotation: [] }
    expect(rulesOf(validateLineup(broken, bruins))).toContain('overtime-rotation-empty')
  })

  it('rejects an overtime trio with an undressed Player (overtime-rotation-invalid)', () => {
    const lineup = buildNaiveLineup(bruins)
    const spare = bruins.skaters.find(
      (s) => ![...lineup.lines.flatMap((l) => [l.leftWing, l.centre, l.rightWing])].includes(s.id),
    )!
    const broken = {
      ...lineup,
      overtimeRotation: [{ players: [spare.id, spare.id, spare.id] as const }],
    }
    expect(rulesOf(validateLineup(broken, bruins))).toContain('overtime-rotation-invalid')
  })

  it('rejects more than 2 power-play units (special-teams-unit-invalid)', () => {
    const lineup = buildNaiveLineup(bruins)
    const broken = {
      ...lineup,
      powerPlayUnits: [...lineup.powerPlayUnits, lineup.powerPlayUnits[0]!],
    }
    expect(rulesOf(validateLineup(broken, bruins))).toContain('special-teams-unit-invalid')
  })

  it('rejects a Lineup with no penalty-kill unit (special-teams-unit-invalid)', () => {
    const broken = { ...buildNaiveLineup(bruins), penaltyKillUnits: [] }
    expect(rulesOf(validateLineup(broken, bruins))).toContain('special-teams-unit-invalid')
  })

  it('rejects special-teams units of the wrong size (ADR-009)', () => {
    const lineup = buildNaiveLineup(bruins)
    const fivePenaltyKillers = {
      ...lineup,
      penaltyKillUnits: [{ skaters: lineup.powerPlayUnits[0]!.skaters }],
    }
    const fourOnThePowerPlay = {
      ...lineup,
      powerPlayUnits: [{ skaters: lineup.penaltyKillUnits[0]!.skaters }],
    }
    expect(rulesOf(validateLineup(fivePenaltyKillers, bruins))).toContain(
      'special-teams-unit-invalid',
    )
    expect(rulesOf(validateLineup(fourOnThePowerPlay, bruins))).toContain(
      'special-teams-unit-invalid',
    )
  })

  it('builds a naive kill from the best defenders, defencemen listed first', () => {
    const lineup = buildNaiveLineup(bruins)
    const defence = new Set(lineup.pairings.flatMap((p) => [p.leftDefence, p.rightDefence]))
    const forwards = lineup.lines.flatMap((l) => [l.leftWing, l.centre, l.rightWing])
    const defending = (id: string) => {
      const { defPositioning, checking } = bruins.skaters.find((s) => s.id === id)!.attributes
      return defPositioning + checking
    }
    const killers = lineup.penaltyKillUnits.flatMap((unit) => unit.skaters.slice(2))
    const bestFour = [...forwards].sort((a, b) => defending(b) - defending(a)).slice(0, 4)

    for (const unit of lineup.penaltyKillUnits) {
      expect(unit.skaters.map((id) => defence.has(id))).toEqual([true, true, false, false])
    }
    expect(killers.map(defending)).toEqual(bestFour.map(defending))
  })

  it('builds a naive power play of four forwards and a defenceman, the fourth forward last', () => {
    const lineup = buildNaiveLineup(bruins)
    const defence = new Set(lineup.pairings.flatMap((p) => [p.leftDefence, p.rightDefence]))
    for (const unit of lineup.powerPlayUnits) {
      expect(unit.skaters.map((id) => defence.has(id))).toEqual([false, false, false, true, false])
    }
    expect(validateLineup(lineup, bruins)).toEqual([])
  })

  it('rejects a malformed Lines/Pairings count (roster-size)', () => {
    const lineup = buildNaiveLineup(bruins)
    const broken = { ...lineup, lines: lineup.lines.slice(0, 3) as unknown as typeof lineup.lines }
    expect(rulesOf(validateLineup(broken, bruins))).toContain('roster-size')
  })
})

describe('editing a Lineup by slot', () => {
  let club: Club
  let lineup: Lineup

  beforeAll(async () => {
    const provider = createGeneratedRosterProvider({
      structure: NHL_2026_27,
      seed: 7,
      clubIdentities: new Map(
        NHL_2026_27_CLUB_SEEDS.map((seed) => [seed.id, { code: seed.code, name: seed.name }]),
      ),
    })
    club = (await provider.loadCompetition('nhl')).clubs[0]!
    lineup = buildNaiveLineup(club)
  })

  const firstLeftWing: LineupSlot = { group: 'line', index: 0, key: 'leftWing' }
  const secondLeftWing: LineupSlot = { group: 'line', index: 1, key: 'leftWing' }

  it('swaps two slots and stays valid, leaving the Units as they were', () => {
    const swapped = swapSlots(lineup, firstLeftWing, secondLeftWing)
    expect(playerAt(swapped, firstLeftWing)).toBe(playerAt(lineup, secondLeftWing))
    expect(playerAt(swapped, secondLeftWing)).toBe(playerAt(lineup, firstLeftWing))
    expect(swapped.powerPlayUnits).toEqual(lineup.powerPlayUnits)
    expect(validateLineup(swapped, club)).toEqual([])
  })

  it('reorders a Unit and swaps the Goalies', () => {
    const unit = swapSlots(
      lineup,
      { group: 'powerPlay', index: 0, position: 0 },
      { group: 'powerPlay', index: 0, position: 4 },
    )
    expect(unit.powerPlayUnits[0]!.skaters[0]).toBe(lineup.powerPlayUnits[0]!.skaters[4])
    expect(validateLineup(unit, club)).toEqual([])

    const goalies = swapSlots(
      lineup,
      { group: 'goalie', key: 'starter' },
      { group: 'goalie', key: 'backup' },
    )
    expect(goalies.starter).toBe(lineup.backup)
    expect(validateLineup(goalies, club)).toEqual([])
  })

  it('flags a Skater moved out of position', () => {
    const moved = swapSlots(lineup, firstLeftWing, { group: 'pairing', index: 0, key: 'leftDefence' })
    expect(validateLineup(moved, club).map((v) => v.rule)).toContain('illegal-position')
  })

  it('brings a spare in everywhere the one leaving stood', () => {
    const dressed = JSON.stringify(lineup)
    const spare = club.skaters.find(
      (s) => s.preferredPositions[0] === 'LW' && !dressed.includes(s.id),
    )!
    const leaving = playerAt(lineup, firstLeftWing)
    const changed = bringIn(lineup, firstLeftWing, spare.id)

    expect(playerAt(changed, firstLeftWing)).toBe(spare.id)
    expect(JSON.stringify(changed)).not.toContain(leaving)
    expect(validateLineup(changed, club)).toEqual([])
  })

  it('leaves the Lineup it was given as it was', () => {
    const before = structuredClone(lineup)
    swapSlots(lineup, firstLeftWing, secondLeftWing)
    expect(lineup).toEqual(before)
  })

  it('rejects Tactics out of range', () => {
    const wild = (tactics: Partial<Tactics>) =>
      validateLineup({ ...lineup, tactics: { ...lineup.tactics, ...tactics } }, club).map(
        (v) => v.rule,
      )
    expect(wild({ aggression: 101 })).toContain('tactics-invalid')
    expect(wild({ shotVolume: Number.NaN })).toContain('tactics-invalid')
    expect(wild({ matchup: 'wild' as Tactics['matchup'] })).toContain('tactics-invalid')
    expect(wild({ aggression: 0, shiftLength: 100 })).toEqual([])
  })
})
