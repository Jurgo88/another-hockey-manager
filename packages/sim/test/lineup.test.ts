import { beforeAll, describe, expect, it } from 'vitest'
import { SKATER_ATTRIBUTE_KEYS } from '../src/domain/attributes.js'
import type { Club, Lineup } from '../src/domain/club.js'
import { buildNaiveLineup, validateLineup, type LineupRule } from '../src/engine/lineup.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'

const IDENTITIES = new Map(
  NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
)

const provider = createGeneratedRosterProvider({ structure: NHL_2026_27, seed: 2026, clubIdentities: IDENTITIES })

let clubs: readonly Club[]
let bruins: Club

beforeAll(async () => {
  const result = await provider.loadCompetition('nhl')
  clubs = result.clubs
  bruins = clubs.find((c) => c.id === 'bos')!
})

const rulesOf = (violations: readonly { rule: LineupRule }[]) => violations.map((v) => v.rule)

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
    const forcedIntoCentre = rightDefenceOnly ?? bruins.skaters.find((s) => s.preferredPositions[0] === 'RD')!
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
    const fivePenaltyKillers = { ...lineup, penaltyKillUnits: [{ skaters: lineup.powerPlayUnits[0]!.skaters }] }
    const fourOnThePowerPlay = { ...lineup, powerPlayUnits: [{ skaters: lineup.penaltyKillUnits[0]!.skaters }] }
    expect(rulesOf(validateLineup(fivePenaltyKillers, bruins))).toContain('special-teams-unit-invalid')
    expect(rulesOf(validateLineup(fourOnThePowerPlay, bruins))).toContain('special-teams-unit-invalid')
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
