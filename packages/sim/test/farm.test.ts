import { beforeAll, describe, expect, it } from 'vitest'
import { NHL_FARM_RULES } from '../src/data/nhl-2026-27.js'
import type { Club } from '../src/domain/club.js'
import { playerLevel, positionGroup, type Player, type PlayerId } from '../src/domain/player.js'
import { ACTIVE_SHAPE, ACTIVE_SIZE, ROSTER_SHAPE } from '../src/domain/roster.js'
import {
  afterFarmMoves,
  assignedClub,
  claimOrder,
  contractedOf,
  DRESSING_MINIMUM,
  farmMoves,
  openingService,
  serviceAfter,
  waiverExempt,
  type FarmDay,
} from '../src/farm/index.js'
import {
  advanceDay,
  contractedSeason,
  goesDownFree,
  isSeasonOver,
  nextSeason,
  noticesOf,
  replaceInjured,
  setClaims,
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
  const none: FarmDay = { out: () => false, injuredReserve: () => false, free: () => true }
  const day = (out: readonly PlayerId[], reserve: readonly PlayerId[] = []): FarmDay => ({
    out: (id) => out.includes(id),
    injuredReserve: (id) => reserve.includes(id),
    free: () => true,
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

describe('the exemption from waivers (CBA 13.4)', () => {
  const skater = (signedAt: number, seasons: number, games: number, shortenedIn?: number) =>
    ({
      ...start.clubs[0]!.skaters[0]!,
      service: { signedAt, seasons, games, ...(shortenedIn ? { shortenedIn } : {}) },
    }) as Player
  const goalie = (signedAt: number, seasons: number, games: number) =>
    ({ ...start.clubs[0]!.goalies[0]!, service: { signedAt, seasons, games } }) as Player
  const exemption = rules.waivers.exemption
  /** Exempt in each Season from the first, playing `games` NHL games a Season. */
  const seasonsExempt = (first: Player, games: number): boolean[] => {
    let player = first
    const out: boolean[] = []
    for (let i = 0; i < 7; i++) {
      out.push(waiverExempt(player, rules, games))
      player = { ...player, service: serviceAfter(player.service!, games, exemption) }
    }
    return out
  }

  it('example (a): signed at 18 and played 11 NHL games in his first Season, exempt for three', () => {
    // Fewer than 160 games in all, so the Seasons end it.
    expect(seasonsExempt(skater(18, 0, 0), 12)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ])
  })

  it('example (b): signed at 19, 11 games in his first Season, exempt for three', () => {
    expect(seasonsExempt(skater(19, 0, 0), 11)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ])
  })

  it('example (c): signed at 20, exempt for three Seasons', () => {
    expect(seasonsExempt(skater(20, 0, 0), 5)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ])
  })

  it('example (d): signed at 25 or older, exempt for the Season he signs in only', () => {
    expect(seasonsExempt(skater(27, 0, 0), 30).slice(0, 2)).toEqual([true, false])
  })

  it('keeps an 18-year-old who stays on the farm exempt for five Seasons', () => {
    expect(seasonsExempt(skater(18, 0, 0), 0)).toEqual([true, true, true, true, true, false, false])
  })

  it('ends the exemption the day his games reach the limit, playoffs included', () => {
    expect(waiverExempt(skater(21, 1, 70), rules, 9)).toBe(true)
    expect(waiverExempt(skater(21, 1, 70), rules, 10)).toBe(false)
    expect(waiverExempt(skater(22, 0, 0), rules, 70)).toBe(false)
  })

  it('reads the Goalies’ own table', () => {
    // A Goalie signed at 20: four Seasons or 80 games.
    expect(seasonsExempt(goalie(20, 0, 0), 10)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ])
    expect(waiverExempt(goalie(20, 0, 79), rules, 1)).toBe(false)
    // An 18-year-old Goalie's shortened exemption is four Seasons.
    const young = { ...goalie(18, 0, 0) }
    expect(seasonsExempt(young, 11).filter(Boolean)).toHaveLength(4)
  })

  it('counts a young Player’s shortened exemption from the Season of his eleventh game', () => {
    // Five Seasons at 18; the 11 games come in his third, so three from there: the fifth.
    const third = skater(18, 2, 6)
    expect(waiverExempt(third, rules, 11)).toBe(true)
    const after = serviceAfter(third.service!, 11, exemption)
    expect(after.shortenedIn).toBe(3)
    expect(after).toEqual({ signedAt: 18, seasons: 3, games: 17, shortenedIn: 3 })
  })

  it('exempts a Player who has not signed', () => {
    const unsigned: Player = { ...skater(20, 0, 0) }
    delete unsigned.service
    expect(waiverExempt(unsigned, rules, 0)).toBe(true)
  })
})

describe('service through a run (D-03)', () => {
  it('opens a league with service estimated from age, and folds each Season’s games into it', () => {
    for (const club of start.clubs) {
      for (const player of contractedOf(club)) {
        expect(player.service).toEqual(openingService(player))
      }
    }
  })
})

describe('service a Season on', () => {
  it('adds the Season and the NHL games played in it, playoffs included, and starts a new signing at nothing', () => {
    let ended = start
    while (!isSeasonOver(ended)) ended = advanceDay(ended).state
    const next = nextSeason(ended)
    const before = new Map(ended.clubs.flatMap(contractedOf).map((p) => [p.id, p]))
    const games = (id: PlayerId) =>
      [ended.totals.regular, ended.totals.playoffs].reduce(
        (sum, t) => sum + ((t.skaters[id] ?? t.goalies[id])?.gamesPlayed ?? 0),
        0,
      )
    let checked = 0
    for (const player of next.clubs.flatMap(contractedOf)) {
      const was = before.get(player.id)
      if (!was) {
        // A first contract signed between the Seasons, or a Player who had one before.
        expect(player.service).toBeDefined()
        continue
      }
      expect(player.service!.seasons).toBe(was.service!.seasons + 1)
      expect(player.service!.games).toBe(was.service!.games + games(player.id))
      checked++
    }
    expect(checked).toBeGreaterThan(100)
    const called = next.clubs
      .flatMap(contractedOf)
      .filter((p) => p.contract?.kind === 'entry-level' && !before.has(p.id))
    for (const player of called)
      expect(player.service).toEqual({ signedAt: player.age, seasons: 0, games: 0 })
  })
})

describe('waivers during a Season (CBA 13.2-13.19)', () => {
  const firstDay = () => start.fixtures[0]!.day
  /** A Club's best forward, made a veteran who needs waivers, put on them by his Club. */
  const onWaivers = (strength: number): { state: SeasonState; player: Player; from: string } => {
    const club = start.clubs[0]!
    const base = club.skaters.find((s) => positionGroup(s) === 'forward')!
    const player: Player = {
      ...base,
      attributes: Object.fromEntries(
        Object.keys(base.attributes).map((k) => [k, strength]),
      ) as unknown as typeof base.attributes,
      service: { signedAt: 22, seasons: 6, games: 300 },
    }
    const state: SeasonState = {
      ...start,
      clubs: start.clubs.map((c) =>
        c.id === club.id ? { ...c, skaters: c.skaters.filter((s) => s.id !== base.id) } : c,
      ),
      waivers: [{ player, clubId: club.id, until: firstDay() }],
    }
    return { state, player, from: club.id }
  }

  it('gives a Player worth having to the first Club in the order of claims', () => {
    const { state, player, from } = onWaivers(20)
    const played = advanceDay(state)
    const claim = played.moves.find((m) => m.kind === 'claimed')!
    expect(claim).toMatchObject({ playerId: player.id, fromClubId: from })
    const order = claimOrder(
      state.standings,
      state.clubs.map((c) => c.id).filter((id) => id !== from),
    )
    expect(claim.clubId).toBe(order[0])
    const claimer = played.state.clubs.find((c) => c.id === claim.clubId)!
    const taken = contractedOf(claimer).find((p) => p.id === player.id)!
    expect(taken.clubId).toBe(claimer.id)
    expect(taken.contract).toEqual(player.contract)
    expect(played.state.waivers).toEqual([])
    // Both Clubs are told.
    expect(noticesOf(state, played, claimer.id)).toContainEqual({
      kind: 'claimed',
      day: played.day,
      playerId: player.id,
      fromClubId: from,
    })
    expect(noticesOf(state, played, from)).toContainEqual({
      kind: 'claimedBy',
      day: played.day,
      playerId: player.id,
      clubId: claimer.id,
    })
  })

  it('sends a Player nobody claims to his farm, cleared', () => {
    const { state, player, from } = onWaivers(1)
    const played = advanceDay(state)
    expect(played.moves).toContainEqual({ kind: 'cleared', clubId: from, playerId: player.id })
    const club = played.state.clubs.find((c) => c.id === from)!
    expect((club.farm ?? []).some((p) => p.id === player.id)).toBe(true)
    expect(played.state.cleared[player.id]).toEqual({ gamesAt: 0, days: 0, upSince: null })
  })

  it('takes a Manager’s declared claims instead of the assistant’s (D-04)', () => {
    const { state, player, from } = onWaivers(20)
    const order = claimOrder(
      state.standings,
      state.clubs.map((c) => c.id).filter((id) => id !== from),
    )
    // The first in the order declares it claims nobody; the next would.
    const declined = setClaims(state, order[0]!, [])
    const claim = advanceDay(declined).moves.find((m) => m.kind === 'claimed')!
    expect(claim.clubId).toBe(order[1])
    expect(() => setClaims(state, from, [player.id])).toThrow(/itself/)
    expect(() => setClaims(state, order[0]!, ['nobody'])).toThrow(/not on waivers/)
  })

  it('lets a cleared Player go down again without waivers until 30 days up or 10 games', () => {
    const { player } = onWaivers(10)
    const day = firstDay()
    const base: SeasonState = {
      ...start,
      cleared: { [player.id]: { gamesAt: 0, days: 25, upSince: null } },
    }
    expect(goesDownFree(base, player, day)).toBe(true)
    const up = { ...base, cleared: { [player.id]: { gamesAt: 0, days: 25, upSince: day } } }
    expect(goesDownFree(up, player, day + 4)).toBe(true)
    expect(goesDownFree(up, player, day + 5)).toBe(false)
    const unlisted = { ...start, cleared: {} }
    expect(goesDownFree(unlisted, player, day)).toBe(false)
  })

  it('orders claims by the share of points, the lower in the table first', () => {
    const table = [
      { clubId: 'a', points: 10, gamesPlayed: 6 },
      { clubId: 'b', points: 6, gamesPlayed: 6 },
      { clubId: 'c', points: 6, gamesPlayed: 6 },
      { clubId: 'd', points: 4, gamesPlayed: 4 },
    ]
    // b, c and d tie at half the points possible: the lowest in the table first, and a Club with no row after them.
    expect(claimOrder(table, ['a', 'b', 'c', 'd', 'e'])).toEqual(['d', 'c', 'b', 'e', 'a'])
  })
})

describe('camp, as the next Season starts', () => {
  it('sends everyone who needs waivers through them: each on a farm has cleared them', () => {
    let ended = start
    while (!isSeasonOver(ended)) ended = advanceDay(ended).state
    const next = nextSeason(ended)
    for (const club of next.clubs) {
      for (const player of club.farm ?? []) {
        if (!waiverExempt(player, next.farmRules, 0)) expect(next.cleared[player.id]).toBeDefined()
      }
      expect(contractedOf(club).length).toBeLessThanOrEqual(next.farmRules.contractsMax)
    }
    expect(next.waivers).toEqual([])
    expect(next.priorStandings).toEqual(ended.standings)
  })
})
