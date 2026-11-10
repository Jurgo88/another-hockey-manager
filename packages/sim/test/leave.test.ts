import { beforeAll, describe, expect, it } from 'vitest'
import type { Club } from '../src/domain/club.js'
import { isGoalie, isSkater, playerLevel, positionGroup, type Player } from '../src/domain/player.js'
import {
  departures,
  filledRoster,
  leavingChance,
  retirementChance,
  roles,
  unsignedChance,
  type SeasonUsage,
} from '../src/leave/index.js'
import { createRng } from '../src/rng/index.js'
import { startSeason } from '../src/season/index.js'

/** Leaving the league between Seasons (ADR-023, ADR-027, #88). */

let clubs: readonly Club[]

beforeAll(async () => {
  clubs = (await startSeason(88)).clubs
})

const everyone = () => clubs.flatMap((club) => [...club.skaters, ...club.goalies])
const streamOf = (label: string) => (player: Player) => createRng(88).fork(`${label}:${player.id}`)

describe('the chances', () => {
  it('make retirement rare before 30 and likely past 40', () => {
    expect(retirementChance(25)).toBeLessThan(0.005)
    expect(retirementChance(29)).toBeLessThan(0.01)
    expect(retirementChance(35)).toBeGreaterThan(0.05)
    expect(retirementChance(41)).toBeGreaterThan(0.5)
    for (let age = 19; age < 45; age++) {
      expect(retirementChance(age + 1)).toBeGreaterThan(retirementChance(age))
    }
  })

  it('leave a regular signed and a Player who barely played often not', () => {
    expect(unsignedChance(26, 1)).toBeLessThan(0.01)
    expect(unsignedChance(26, 0.5)).toBeLessThan(0.05)
    expect(unsignedChance(26, 0)).toBeGreaterThan(0.25)
    expect(unsignedChance(33, 0)).toBeGreaterThan(unsignedChance(23, 0))
  })

  it('combine both ways as one is drawn after the other', () => {
    const [age, role] = [36, 0.3]
    const expected = 1 - (1 - retirementChance(age)) * (1 - unsignedChance(age, role))
    expect(leavingChance(age, role)).toBeCloseTo(expected, 12)
  })
})

describe('roles', () => {
  const usageBy =
    (score: (player: Player) => number) =>
    (player: Player): SeasonUsage => ({
      fixtures: score(player) > 0 ? 40 : 0,
      secondsPerFixture: score(player),
      injured: false,
    })

  it('rank each position group apart, from 0 to 1', () => {
    const roleOf = roles(clubs, usageBy(playerLevel))
    for (const group of ['forward', 'defence', 'goalie'] as const) {
      const values = everyone()
        .filter((player) => positionGroup(player) === group)
        .map((player) => roleOf.get(player.id)!)
      expect(Math.min(...values)).toBe(0)
      expect(Math.max(...values)).toBe(1)
    }
  })

  it('rank Skaters by ice time per Fixture and Goalies by Fixtures', () => {
    const skater = clubs[0]!.skaters[0]!
    const goalie = clubs[0]!.goalies[0]!
    const roleOf = roles(clubs, (player) => ({
      fixtures: player.id === goalie.id ? 82 : 20,
      secondsPerFixture: player.id === skater.id ? 3000 : isGoalie(player) ? 3600 : 600,
      injured: false,
    }))
    expect(roleOf.get(skater.id)).toBe(1)
    expect(roleOf.get(goalie.id)).toBe(1)
  })

  it('give no role to a Player who did not play, unless he was injured', () => {
    const [idle, hurt] = clubs[0]!.skaters
    const roleOf = roles(clubs, (player) => ({
      fixtures: player === idle || player === hurt ? 0 : 50,
      secondsPerFixture: player === idle || player === hurt ? 0 : 900,
      injured: player === hurt,
    }))
    expect(roleOf.get(idle!.id)).toBe(0)
    const byLevel = roles(clubs, usageBy(playerLevel))
    expect(roleOf.get(hurt!.id)).toBe(byLevel.get(hurt!.id))
  })
})

describe('departures', () => {
  const fullRoles = () => new Map(everyone().map((player) => [player.id, 0.5]))

  it('are deterministic for the streams (D-08)', () => {
    expect(departures(clubs, fullRoles(), streamOf('a'))).toEqual(
      departures(clubs, fullRoles(), streamOf('a')),
    )
  })

  it('send the old into retirement and the unused out unsigned', () => {
    const old = clubs.map((club) => ({
      ...club,
      skaters: club.skaters.map((skater) => ({ ...skater, age: 42 })),
      goalies: club.goalies.map((goalie) => ({ ...goalie, age: 42 })),
    }))
    const retired = departures(old, fullRoles(), streamOf('b'))
    expect(retired.length).toBeGreaterThan(everyone().length * 0.6)
    expect(retired.filter((d) => d.reason === 'retired').length).toBeGreaterThan(
      retired.length * 0.9,
    )

    const young = clubs.map((club) => ({
      ...club,
      skaters: club.skaters.map((skater) => ({ ...skater, age: 24 })),
      goalies: club.goalies.map((goalie) => ({ ...goalie, age: 24 })),
    }))
    const unused = new Map(everyone().map((player) => [player.id, 0]))
    const gone = departures(young, unused, streamOf('c'))
    expect(gone.length).toBeGreaterThan(everyone().length * 0.2)
    expect(gone.every((d) => d.reason === 'unsigned')).toBe(true)
  })

  it('record who left, from where and at what age', () => {
    const gone = departures(clubs, fullRoles(), streamOf('d'))
    const byId = new Map(everyone().map((player) => [player.id, player]))
    for (const departure of gone) {
      const player = byId.get(departure.playerId)!
      expect(departure.clubId).toBe(player.clubId)
      expect(departure.age).toBe(player.age)
    }
  })
})

describe('filledRoster', () => {
  it('leaves a full Club as it is', () => {
    const club = clubs[0]!
    expect(filledRoster(club, [], createRng(1), 2)).toBe(club)
  })

  it('fills each gap at the natural position of whoever left, at the depth of a call-up', () => {
    const club = clubs[0]!
    const left = [club.skaters[0]!, club.skaters[20]!, club.goalies[0]!]
    const kept = {
      ...club,
      skaters: club.skaters.filter((s) => !left.includes(s)),
      goalies: club.goalies.slice(1),
    }
    const filled = filledRoster(kept, left, createRng(1).fork('fill'), 2)
    expect(filled.skaters).toHaveLength(club.skaters.length)
    expect(filled.goalies).toHaveLength(club.goalies.length)

    const added = [...filled.skaters, ...filled.goalies].filter(
      (player) => ![...kept.skaters, ...kept.goalies].includes(player as never),
    )
    expect(added.map((player) => player.id)).toEqual([
      `${club.id}-y2-u0`,
      `${club.id}-y2-u1`,
      `${club.id}-y2-u2`,
    ])
    const naturals = added.filter(isSkater).map((p) => p.preferredPositions[0])
    expect(naturals).toEqual([
      club.skaters[0]!.preferredPositions[0],
      club.skaters[20]!.preferredPositions[0],
    ])

    const weakest = (group: 'forward' | 'defence' | 'goalie') =>
      Math.min(
        ...everyone()
          .filter((p) => positionGroup(p) === group)
          .map(playerLevel),
      )
    for (const player of added) {
      // A call-up: near the bottom of the league at his position, never a star.
      expect(playerLevel(player)).toBeLessThan(weakest(positionGroup(player)) + 4)
      expect(player.clubId).toBe(club.id)
    }
  })
})
