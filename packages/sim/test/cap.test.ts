import { beforeAll, describe, expect, it } from 'vitest'
import { NHL_CAP_RULES } from '../src/data/nhl-2026-27.js'
import type { Club } from '../src/domain/club.js'
import type { Player } from '../src/domain/player.js'
import { atFloor, buyout, payroll, tickedDeadMoney } from '../src/generate/contracts.js'
import {
  advanceDay,
  assistantLineup,
  endSeason,
  InvalidLineupError,
  InvalidMovesError,
  isRegularSeasonOver,
  isSeasonOver,
  playoffCapCharge,
  proposedMoves,
  runReSigning,
  setLineup,
  setRosterMoves,
  startNextSeason,
  startSeason,
  type Offseason,
  type SeasonState,
} from '../src/season/index.js'
import { SMALL_SEASON } from './support/league.js'

/** The cap, its floor, buyouts and the playoff cap (ADR-031, #129). */

const rules = NHL_CAP_RULES
const playersOf = (club: Club): Player[] => [...club.skaters, ...club.goalies]

let start: SeasonState

beforeAll(async () => {
  start = await startSeason(5, undefined, SMALL_SEASON)
})

describe('a buyout', () => {
  it('leaves two thirds of what is left, one third under 26, over twice the Seasons left', () => {
    const player = start.clubs[0]!.skaters[0]!
    const contract = { capHit: 0.06, years: 3, kind: 'standard', onExpiry: 'unrestricted' } as const
    const old = buyout(rules, { ...player, age: 30, contract })!
    const young = buyout(rules, { ...player, age: 24, contract })!
    expect(old.years).toBe(6)
    expect(old.capHit * old.years).toBeCloseTo(0.06 * 3 * (2 / 3), 6)
    expect(young.capHit * young.years).toBeCloseTo(0.06 * 3 * (1 / 3), 6)
  })

  it('runs out a Season at a time', () => {
    const dead = {
      a: [{ playerId: 'x', capHit: 0.01, years: 2 }],
      b: [{ playerId: 'y', capHit: 0.02, years: 1 }],
    }
    expect(tickedDeadMoney(dead)).toEqual({ a: [{ playerId: 'x', capHit: 0.01, years: 1 }], b: [] })
  })
})

describe('the floor', () => {
  it('raises the lowest contracts together until the payroll reaches it', () => {
    const club = start.clubs[0]!
    const low: Club = {
      ...club,
      skaters: club.skaters.map((s) => ({
        ...s,
        contract: { ...s.contract!, capHit: rules.minimum },
      })),
      goalies: club.goalies.map((g) => ({ ...g, contract: { ...g.contract!, capHit: 0.03 } })),
    }
    const raised = atFloor(rules, low, 0.05)
    expect(payroll(raised) + 0.05).toBeGreaterThanOrEqual(rules.lowerLimit)
    expect(payroll(raised) + 0.05).toBeLessThan(rules.lowerLimit + 0.001)
    // Those paid more than the level are left as they were.
    expect(raised.goalies.map((g) => g.contract!.capHit)).toEqual([0.03, 0.03, 0.03])
    const skaterHits = new Set(raised.skaters.map((s) => s.contract!.capHit))
    expect(skaterHits.size).toBe(1)
  })

  it('binds when a league opens', () => {
    for (const club of start.clubs) expect(payroll(club)).toBeGreaterThanOrEqual(rules.lowerLimit)
  })
})

describe('between Seasons', () => {
  let ended: SeasonState
  let roster: Offseason

  beforeAll(() => {
    let state = start
    while (!isSeasonOver(state)) state = advanceDay(state).state
    ended = state
    roster = runReSigning(endSeason(ended))
  })

  it('turns a release into dead money the next Season carries', () => {
    const club = roster.clubs[0]!
    const released = club.skaters
      .filter((s) => s.contract!.capHit > rules.minimum)
      .sort((a, b) => b.contract!.capHit - a.contract!.capHit)[0]!
    const next = startNextSeason(
      setRosterMoves(roster, club.id, { callUps: [], releases: [released.id] }),
    )
    expect(next.deadMoney[club.id]).toContainEqual(buyout(rules, released))
    expect(
      playersOf(next.clubs.find((c) => c.id === club.id)!).some((p) => p.id === released.id),
    ).toBe(false)
  })

  it('refuses moves that add cap hit over the cap, and the assistant keeps within it', () => {
    const club = roster.clubs.find((c) =>
      roster.prospects.some(
        (p) =>
          p.player.clubId === c.id && proposedMoves(roster, c.id).callUps.includes(p.player.id),
      ),
    )
    const target = club ?? roster.clubs[0]!
    const prospect = roster.prospects.find((p) => p.player.clubId === target.id)!.player
    const running = target.skaters[0]!
    const full: Offseason = {
      ...roster,
      clubs: roster.clubs.map((c) =>
        c.id !== target.id
          ? c
          : {
              ...c,
              skaters: c.skaters.map((p) =>
                p.id === running.id
                  ? {
                      ...p,
                      contract: { ...p.contract!, capHit: 1 - payroll(c) + p.contract!.capHit },
                    }
                  : p,
              ),
            },
      ),
    }
    expect(() => setRosterMoves(full, target.id, { callUps: [prospect.id], releases: [] })).toThrow(
      InvalidMovesError,
    )
    expect(() => setRosterMoves(full, target.id, proposedMoves(full, target.id))).not.toThrow()
  })

  it('starts every Club of the next Season at or above the floor', () => {
    const next = startNextSeason(roster)
    for (const club of next.clubs) {
      const dead = (next.deadMoney[club.id] ?? []).reduce((sum, d) => sum + d.capHit, 0)
      expect(payroll(club) + dead).toBeGreaterThanOrEqual(rules.lowerLimit - 1e-9)
    }
  })
})

describe('the playoff cap', () => {
  let playoffs: SeasonState

  beforeAll(() => {
    let state = start
    while (!isRegularSeasonOver(state)) state = advanceDay(state).state
    playoffs = state
  })

  it('has the assistant dress what fits, and refuses a Lineup above it', () => {
    const clubId = playoffs.fixtures[playoffs.nextFixture]!.homeClubId
    const club = playoffs.clubs.find((c) => c.id === clubId)!
    // The dressed Players paid enough that the Lineup no longer fits.
    const lineup = playoffs.lineups[clubId]!
    const dressed = new Set([
      lineup.starter,
      lineup.backup,
      ...lineup.lines.flatMap((l) => [l.leftWing, l.centre, l.rightWing]),
      ...lineup.pairings.flatMap((p) => [p.leftDefence, p.rightDefence]),
    ])
    const dear: Club = {
      ...club,
      skaters: club.skaters.map((s) =>
        dressed.has(s.id) ? { ...s, contract: { ...s.contract!, capHit: 0.055 } } : s,
      ),
    }
    const state = { ...playoffs, clubs: playoffs.clubs.map((c) => (c.id === clubId ? dear : c)) }
    expect(playoffCapCharge(state, clubId, lineup)).toBeGreaterThan(1)
    expect(() => setLineup(state, clubId, lineup)).toThrow(InvalidLineupError)
    const fitted = assistantLineup(state, clubId, lineup.tactics)
    expect(playoffCapCharge(state, clubId, fitted)).toBeLessThanOrEqual(1 + 1e-9)
    expect(playersOf(dear).length).toBe(29)
  })
})
