import { beforeAll, describe, expect, it } from 'vitest'
import { NHL_FARM_RULES } from '../src/data/nhl-2026-27.js'
import type { Club } from '../src/domain/club.js'
import { playerLevel, positionGroup, type Player, type PlayerId } from '../src/domain/player.js'
import { ACTIVE_SHAPE, ACTIVE_SIZE, ROSTER_SHAPE } from '../src/domain/roster.js'
import {
  afterFarmMoves,
  assignedClub,
  contractedOf,
  DRESSING_MINIMUM,
  farmMoves,
  type FarmDay,
} from '../src/farm/index.js'
import {
  advanceDay,
  contractedSeason,
  isSeasonOver,
  noticesOf,
  replaceInjured,
  startSeason,
  type SeasonState,
  type UncontractedSeason,
} from '../src/season/index.js'
import { SMALL_SEASON } from './support/league.js'

/** The farm (ADR-036, #133): the active Roster, call-ups and send-downs for injuries. */

const rules = NHL_FARM_RULES
const groupCount = (players: readonly Player[], group: string) =>
  players.filter((p) => positionGroup(p) === group).length
const activeOf = (club: Club): Player[] => [...club.skaters, ...club.goalies]

let start: SeasonState

beforeAll(async () => {
  start = await startSeason(7, undefined, SMALL_SEASON)
})

describe('the active Roster', () => {
  it('opens every Club with 14-7-2 active and the rest of 20-10-4 on its farm', () => {
    for (const club of start.clubs) {
      const active = activeOf(club)
      expect(active).toHaveLength(ACTIVE_SIZE)
      expect(groupCount(active, 'forward')).toBe(ACTIVE_SHAPE.forwards)
      expect(groupCount(active, 'defence')).toBe(ACTIVE_SHAPE.defence)
      expect(groupCount(active, 'goalie')).toBe(ACTIVE_SHAPE.goalies)
      const all = contractedOf(club)
      expect(groupCount(all, 'forward')).toBe(ROSTER_SHAPE.forwards)
      expect(groupCount(all, 'defence')).toBe(ROSTER_SHAPE.defence)
      expect(groupCount(all, 'goalie')).toBe(ROSTER_SHAPE.goalies)
      expect(all.every((p) => p.contract !== undefined)).toBe(true)
    }
  })

  it('takes the best by level, at each natural position until a Lineup can dress', () => {
    for (const club of start.clubs) {
      const active = activeOf(club)
      for (const [natural, least] of Object.entries(DRESSING_MINIMUM)) {
        const at = active.filter(
          (p) => (p.kind === 'goalie' ? 'G' : p.preferredPositions[0]) === natural,
        )
        expect(at.length).toBeGreaterThanOrEqual(least)
      }
      // Nobody on the farm is better than the weakest active Player of his group
      // who is not there for his natural position.
      for (const player of club.farm ?? []) {
        const group = active.filter((p) => positionGroup(p) === positionGroup(player))
        const better = group.filter((p) => playerLevel(p) > playerLevel(player)).length
        expect(better).toBeGreaterThanOrEqual(group.length - Object.keys(DRESSING_MINIMUM).length)
      }
    }
  })

  it('assigns a Club the same way however its Players are held', () => {
    const club = start.clubs[0]!
    const pooled: Club = {
      ...club,
      skaters: [
        ...club.skaters,
        ...(club.farm ?? []).filter((p) => p.kind === 'skater'),
      ] as Club['skaters'],
      goalies: [
        ...club.goalies,
        ...(club.farm ?? []).filter((p) => p.kind === 'goalie'),
      ] as Club['goalies'],
      farm: [],
    }
    const ids = (c: Club) =>
      activeOf(c)
        .map((p) => p.id)
        .sort()
    expect(ids(assignedClub(pooled))).toEqual(ids(club))
  })
})

describe('call-ups for injuries (CBA 13.12, 16.11)', () => {
  const none: FarmDay = { out: () => false, injuredReserve: () => false }
  const day = (out: readonly PlayerId[], reserve: readonly PlayerId[] = []): FarmDay => ({
    out: (id) => out.includes(id),
    injuredReserve: (id) => reserve.includes(id),
  })

  it('moves nobody when everyone is fit', () => {
    for (const club of start.clubs) expect(farmMoves(club, rules, none)).toEqual([])
  })

  it('calls up a Goalie at once when one is hurt, the active Roster full or not', () => {
    const club = start.clubs[0]!
    const hurt = club.goalies[0]!.id
    const moves = farmMoves(club, rules, day([hurt]))
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({ kind: 'calledUp' })
    const called = (club.farm ?? []).find((p) => p.id === moves[0]!.playerId)!
    expect(called.kind).toBe('goalie')
    // The best of the farm's Goalies.
    const farmGoalies = (club.farm ?? []).filter((p) => p.kind === 'goalie')
    expect(playerLevel(called)).toBe(Math.max(...farmGoalies.map(playerLevel)))
  })

  it('keeps a full Roster when a forward is out a few days, and calls one up when he goes on Injured Reserve', () => {
    const club = start.clubs[0]!
    const hurt = club.skaters.find((s) => positionGroup(s) === 'forward')!.id
    expect(farmMoves(club, rules, day([hurt]))).toEqual([])
    const moves = farmMoves(club, rules, day([hurt], [hurt]))
    expect(moves).toHaveLength(1)
    expect(moves[0]!.kind).toBe('calledUp')
    expect(positionGroup(contractedOf(club).find((p) => p.id === moves[0]!.playerId)!)).toBe(
      'forward',
    )
  })

  it('calls up below the emergency line even with the Roster full (CBA 13.12(m))', () => {
    const club = start.clubs[0]!
    const forwards = club.skaters.filter((s) => positionGroup(s) === 'forward').map((s) => s.id)
    // Three out for a day or two: 11 fit forwards, below the 12 a Lineup dresses.
    const moves = farmMoves(club, rules, day(forwards.slice(0, 3)))
    // Up to the line, no further: the Roster is full.
    expect(moves.filter((m) => m.kind === 'calledUp')).toHaveLength(rules.emergency.forward - 11)
  })

  it('sends the weakest down when a Player back from Injured Reserve leaves the Roster above its limit', () => {
    const club = start.clubs[0]!
    const hurt = club.skaters.find((s) => positionGroup(s) === 'forward')!.id
    const up = afterFarmMoves(club, farmMoves(club, rules, day([hurt], [hurt])))
    expect(activeOf(up)).toHaveLength(ACTIVE_SIZE + 1)
    const back = farmMoves(up, rules, none)
    expect(back).toHaveLength(1)
    expect(back[0]!.kind).toBe('sentDown')
    const forwards = up.skaters.filter((s) => positionGroup(s) === 'forward')
    const weakest = Math.min(...forwards.map(playerLevel))
    expect(playerLevel(forwards.find((s) => s.id === back[0]!.playerId)!)).toBe(weakest)
    expect(activeOf(afterFarmMoves(up, back))).toHaveLength(ACTIVE_SIZE)
  })
})

describe('the farm through a Season', () => {
  let days: ReturnType<typeof advanceDay>[]
  let ended: SeasonState

  beforeAll(() => {
    days = []
    let state = start
    while (!isSeasonOver(state)) {
      const played = advanceDay(state)
      days.push(played)
      state = played.state
    }
    ended = state
  })

  it('answers injuries with call-ups and returns, as notices', () => {
    const moves = days.flatMap((d) => d.moves)
    expect(moves.some((m) => m.kind === 'calledUp')).toBe(true)
    expect(moves.some((m) => m.kind === 'sentDown')).toBe(true)
    const club = start.clubs[0]!.id
    let before = start
    const notices = days.flatMap((d) => {
      const told = noticesOf(before, d, club)
      before = d.state
      return told
    })
    const ofClub = moves.filter((m) => m.clubId === club)
    expect(notices.filter((n) => n.kind === 'calledUp' || n.kind === 'sentDown')).toHaveLength(
      ofClub.length,
    )
  })

  it('keeps the active Roster within its limit but for emergencies, and never short of Goalies', () => {
    for (const { state } of days) {
      for (const club of state.clubs) {
        const counted = activeOf(club).filter((p) => !(p.id in state.injuredReserve))
        // An emergency call-up may take it one or two above for a few days.
        expect(counted.length).toBeLessThanOrEqual(rules.activeMax + 3)
        expect(club.goalies.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('puts a long injury on Injured Reserve, and takes him off it when he is back', () => {
    const reserved = new Set(days.flatMap((d) => Object.keys(d.state.injuredReserve)))
    expect(reserved.size).toBeGreaterThan(0)
    const long = days
      .flatMap((d) => d.played.flatMap((p) => p.match.injuries))
      .filter((i) => i.days >= rules.injuredReserveDays)
      .map((i) => i.playerId)
    for (const id of long) expect(reserved.has(id)).toBe(true)
    for (const id of Object.keys(ended.injuredReserve)) expect(ended.absent[id]).toBeDefined()
  })

  it('never dresses a Player off the active Roster', () => {
    for (const { state, played } of days) {
      for (const { input } of played) {
        for (const [club, lineup] of [
          [input.homeClub, input.homeLineup],
          [input.awayClub, input.awayLineup],
        ] as const) {
          const active = new Set(activeOf(club).map((p) => p.id))
          const dressed = [
            lineup.starter,
            lineup.backup,
            ...lineup.lines.flatMap((l) => [l.leftWing, l.centre, l.rightWing]),
            ...lineup.pairings.flatMap((p) => [p.leftDefence, p.rightDefence]),
          ]
          expect(dressed.every((id) => active.has(id))).toBe(true)
        }
      }
      expect(state.clubs.length).toBe(start.clubs.length)
    }
  })

  it('replaces a declared Player sent down since, as an injured one is', () => {
    const club = start.clubs[0]!
    const lineup = start.lineups[club.id]!
    const centre = lineup.lines[0].centre
    const down: SeasonState = {
      ...start,
      clubs: start.clubs.map((c) =>
        c.id === club.id
          ? {
              ...c,
              skaters: c.skaters.filter((s) => s.id !== centre),
              farm: [...(c.farm ?? []), c.skaters.find((s) => s.id === centre)!],
            }
          : c,
      ),
    }
    expect(JSON.stringify(replaceInjured(down, club.id, lineup))).not.toContain(`"${centre}"`)
  })
})

describe('a Season stored before the farm', () => {
  it('gets the farm rules and a farm for every Club, the same each time it is read', () => {
    const stored = JSON.parse(JSON.stringify(start)) as UncontractedSeason
    delete stored.farmRules
    delete stored.injuredReserve
    // A Club as it was held before #133: everyone on one Roster.
    stored.clubs = stored.clubs.map((club) => {
      const all = contractedOf(club)
      const copy = {
        ...club,
        skaters: all.filter((p) => p.kind === 'skater'),
        goalies: all.filter((p) => p.kind === 'goalie'),
      } as Club
      delete copy.farm
      return copy
    })
    const upgraded = contractedSeason(stored)
    expect(upgraded.farmRules).toEqual(rules)
    expect(upgraded.injuredReserve).toEqual({})
    expect(upgraded.clubs.map((c) => activeOf(c).length)).toEqual(
      start.clubs.map(() => ACTIVE_SIZE),
    )
    expect(contractedSeason(stored)).toEqual(upgraded)
    expect(contractedSeason(upgraded)).toBe(upgraded)
  })
})
