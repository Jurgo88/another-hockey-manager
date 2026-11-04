import { beforeAll, describe, expect, it } from 'vitest'
import type { Club, Lineup } from '../src/domain/club.js'
import type { InjuryEvent, MatchEvent, ShiftChangeEvent } from '../src/domain/event.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'
import { absenceDays } from '../src/engine/injury.js'
import {
  buildNaiveLineup,
  movedToBottom,
  validateLineup,
  withoutInjured,
} from '../src/engine/lineup.js'
import { simulateFixture } from '../src/engine/simulate.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { createRng } from '../src/rng/index.js'
import { foldMatch } from '../src/stats/match.js'
import { fixtureBetween } from './support/fixtures.js'

const FIXTURES = 400

let home: Club
let away: Club
let lineup: Lineup

beforeAll(async () => {
  const provider = createGeneratedRosterProvider({
    structure: NHL_2026_27,
    seed: 2026,
    clubIdentities: new Map(
      NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
    ),
  })
  const { clubs } = await provider.loadCompetition('nhl')
  home = clubs[0]!
  away = clubs[1]!
  lineup = buildNaiveLineup(home)
})

const play = (seed: number): MatchEvent[] =>
  simulateFixture(
    {
      fixture: fixtureBetween(home.id, away.id),
      homeClub: home,
      awayClub: away,
      homeLineup: lineup,
      awayLineup: buildNaiveLineup(away),
    },
    seed,
  )

const isInjury = (e: MatchEvent): e is InjuryEvent => e.type === 'injury'
const isShift = (e: MatchEvent): e is ShiftChangeEvent => e.type === 'shift_change'

describe('absenceDays', () => {
  it('stays within the measured table in days and is short more often than long', () => {
    const rng = createRng(5)
    const lengths = Array.from({ length: 2000 }, () => absenceDays(rng))
    // One Fixture missed is three days, sixty about four months.
    expect(Math.min(...lengths)).toBe(3)
    expect(Math.max(...lengths)).toBeLessThanOrEqual(127)
    expect(lengths.filter((n) => n === 3).length).toBeGreaterThan(
      lengths.filter((n) => n >= 18).length,
    )
    // Off the ice the first Fixture missed is this one.
    expect(Math.min(...Array.from({ length: 2000 }, () => absenceDays(rng, true)))).toBe(1)
  })
})

describe('movedToBottom (ADR-012)', () => {
  it('moves everyone below up a Line in the same position', () => {
    const star = lineup.lines[0].centre
    const moved = movedToBottom(lineup, star)

    expect(moved.lines[0].centre).toBe(lineup.lines[1].centre)
    expect(moved.lines[1].centre).toBe(lineup.lines[2].centre)
    expect(moved.lines[2].centre).toBe(lineup.lines[3].centre)
    expect(moved.lines[3].centre).toBe(star)
    expect(moved.lines[0].leftWing).toBe(lineup.lines[0].leftWing)
  })

  it('does the same for a Pairing, and nothing for a Skater not dressed', () => {
    const moved = movedToBottom(lineup, lineup.pairings[0].leftDefence)
    expect(moved.pairings[0].leftDefence).toBe(lineup.pairings[1].leftDefence)
    expect(moved.pairings[2].leftDefence).toBe(lineup.pairings[0].leftDefence)

    expect(movedToBottom(lineup, 'nobody')).toEqual(lineup)
  })
})

describe('withoutInjured (ADR-012)', () => {
  it('leaves a Lineup with nobody out as it was', () => {
    expect(withoutInjured(home, lineup, new Set())).toEqual(lineup)
  })

  it('takes the Skater out of everything, and stays a valid Lineup', () => {
    const star = lineup.lines[0].leftWing
    const healthy = withoutInjured(home, lineup, new Set([star]))

    expect(JSON.stringify(healthy)).not.toContain(star)
    expect(validateLineup(healthy, home)).toEqual([])
    expect(healthy.lines[0].leftWing).toBe(lineup.lines[1].leftWing)
  })

  it('stays valid with a Skater out of every Line', () => {
    const out = new Set(lineup.lines.map((line) => line.rightWing))
    const healthy = withoutInjured(home, lineup, out)
    for (const id of out) expect(JSON.stringify(healthy)).not.toContain(id)
    expect(validateLineup(healthy, home)).toEqual([])
  })

  it('moves the backup into net and dresses the third Goalie', () => {
    const third = home.goalies.find((g) => g.id !== lineup.starter && g.id !== lineup.backup)!
    const healthy = withoutInjured(home, lineup, new Set([lineup.starter]))

    expect(healthy.starter).toBe(lineup.backup)
    expect(healthy.backup).toBe(third.id)
  })

  it('keeps the injured Player when the Roster has nobody else', () => {
    const everyone = new Set(home.goalies.map((g) => g.id))
    const healthy = withoutInjured(home, lineup, everyone)
    expect(healthy.starter).toBe(lineup.starter)
  })
})

describe('injuries in a Fixture (FR-26)', () => {
  const runs = () => Array.from({ length: FIXTURES }, (_, i) => play(50_000 + i))

  it('keeps a Skater hurt in a Match off the ice for the rest of it', () => {
    for (const events of runs()) {
      for (const injury of events.filter(isInjury)) {
        const later = events.slice(events.indexOf(injury) + 1).filter(isShift)
        expect(later.some((shift) => shift.onIce.includes(injury.player))).toBe(false)
      }
    }
  })

  it('brings the backup in when the Goalie in net is hurt', () => {
    const relieved = runs().flatMap((events) => {
      const injury = events.filter(isInjury).find((e) => e.player === lineup.starter && !e.offIce)
      return injury ? [{ events, injury }] : []
    })
    expect(relieved.length).toBeGreaterThan(0)

    for (const { events, injury } of relieved) {
      const later = events.slice(events.indexOf(injury) + 1).filter(isShift)
      const ours = later.filter((shift) => shift.clubId === home.id)
      expect(ours.every((shift) => shift.goalie !== lineup.starter)).toBe(true)
    }
  })

  it('replaces a Player hurt before the opening faceoff, who never takes the ice', () => {
    const hurt = runs().flatMap((events) =>
      events
        .filter(isInjury)
        .filter((e) => e.offIce)
        .map((injury) => ({ events, injury })),
    )
    expect(hurt.length).toBeGreaterThan(0)

    for (const { events, injury } of hurt) {
      expect(injury.clock).toBe(0)
      const seen = events
        .filter(isShift)
        .some((s) => s.onIce.includes(injury.player) || s.goalie === injury.player)
      expect(seen).toBe(false)
    }
  })

  it('comes up in most Fixtures, far more in a Match than off the ice', () => {
    const injuries = runs().flatMap((events) => events.filter(isInjury))
    const offIce = injuries.filter((e) => e.offIce).length
    expect(offIce).toBeGreaterThan(0)
    expect(offIce).toBeLessThan(injuries.length / 2)
  })

  it('folds into the Match statistics', () => {
    const events = runs().find((stream) => stream.some(isInjury))!
    const stats = foldMatch(fixtureBetween(home.id, away.id), events)
    expect(stats.injuries).toHaveLength(events.filter(isInjury).length)
  })
})
