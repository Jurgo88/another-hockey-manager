import { describe, expect, it } from 'vitest'
import type { Club, Lineup } from '../src/domain/club.js'
import type { MatchEndEvent, MatchEvent } from '../src/domain/event.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'
import { afterRest, afterShift } from '../src/engine/fatigue.js'
import { buildNaiveLineup, DEFAULT_TACTICS } from '../src/engine/lineup.js'
import { simulateFixture } from '../src/engine/simulate.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { foldMatch } from '../src/stats/match.js'
import { fixtureBetween } from './support/fixtures.js'

const FIXTURES = 200

async function twoClubs(): Promise<[Club, Club]> {
  const provider = createGeneratedRosterProvider({
    structure: NHL_2026_27,
    seed: 2026,
    clubIdentities: new Map(
      NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
    ),
  })
  const { clubs } = await provider.loadCompetition('nhl')
  return [clubs[0]!, clubs[1]!]
}

function play(
  home: Club,
  away: Club,
  seed: number,
  homeLineup: Lineup = buildNaiveLineup(home),
): MatchEvent[] {
  return simulateFixture(
    {
      fixture: fixtureBetween(home.id, away.id),
      homeClub: home,
      awayClub: away,
      homeLineup,
      awayLineup: buildNaiveLineup(away),
    },
    seed,
  )
}

const matchEnd = (events: readonly MatchEvent[]) => events.at(-1) as MatchEndEvent

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

describe('the fatigue model (ADR-010)', () => {
  it('rises with ice time and falls with stamina', () => {
    expect(afterShift(10, 45, 10)).toBeGreaterThan(10)
    expect(afterShift(0, 60, 10)).toBeGreaterThan(afterShift(0, 30, 10))
    expect(afterShift(0, 45, 18)).toBeLessThan(afterShift(0, 45, 6))
  })

  it('costs less for the same ice time split into shorter Shifts', () => {
    const oneLong = afterShift(0, 60, 10)
    const twoShort = afterShift(afterShift(0, 30, 10), 30, 10)
    expect(twoShort).toBeLessThan(oneLong)
  })

  it('never exceeds 100', () => {
    expect(afterShift(99.9, 90, 1)).toBe(100)
  })

  it('clears with each day of rest, faster for a fit Skater', () => {
    expect(afterRest(40, 1, 10)).toBeLessThan(40)
    expect(afterRest(40, 2, 10)).toBeLessThan(afterRest(40, 1, 10))
    expect(afterRest(40, 1, 18)).toBeLessThan(afterRest(40, 1, 6))
    expect(afterRest(0, 3, 10)).toBe(0)
  })
})

describe('fatigue in a Fixture (FR-14)', async () => {
  const [home, away] = await twoClubs()

  it('ends every stream with match_end, covering both Rosters', () => {
    const end = matchEnd(play(home, away, 1))
    expect(end.type).toBe('match_end')

    const skaters = [...home.skaters, ...away.skaters].map((s) => s.id).sort()
    expect(Object.keys(end.fatigue).sort()).toEqual(skaters)
  })

  it('tires the Skaters who play and leaves the rest where they started', () => {
    const lineup = buildNaiveLineup(home)
    const dressed = new Set([
      ...lineup.lines.flatMap((l) => [l.leftWing, l.centre, l.rightWing]),
      ...lineup.pairings.flatMap((p) => [p.leftDefence, p.rightDefence]),
    ])
    const { fatigue } = matchEnd(play(home, away, 2))

    expect(home.skaters.some((skater) => !dressed.has(skater.id))).toBe(true)
    for (const skater of home.skaters) {
      if (dressed.has(skater.id)) expect(fatigue[skater.id]).toBeGreaterThan(0)
      else expect(fatigue[skater.id]).toBe(0)
    }
  })

  it('folds into the Match statistics as it stands, never summed', () => {
    const events = play(home, away, 3)
    const stats = foldMatch(fixtureBetween(home.id, away.id), events)
    expect(Object.fromEntries(stats.fatigue)).toEqual(matchEnd(events).fatigue)
  })

  it('starts from the fatigue in the input, and a tired Club scores less', () => {
    const tired = {
      ...home,
      skaters: home.skaters.map((skater) => ({ ...skater, fatigue: 30 })),
    }
    const goalsFor = (club: Club) =>
      mean(
        Array.from({ length: FIXTURES }, (_, i) => {
          const stats = foldMatch(fixtureBetween(home.id, away.id), play(club, away, 30_000 + i))
          return stats.result.homeGoals
        }),
      )

    expect(goalsFor(tired)).toBeLessThan(goalsFor(home))
  })

  it('leaves a Roster less tired with shorter Shifts (Tier 3)', () => {
    const lineup = buildNaiveLineup(home)
    const endFatigue = (shiftLength: number) =>
      mean(
        Array.from({ length: FIXTURES }, (_, i) => {
          const { fatigue } = matchEnd(
            play(home, away, 40_000 + i, {
              ...lineup,
              tactics: { ...DEFAULT_TACTICS, shiftLength },
            }),
          )
          return mean(home.skaters.map((skater) => fatigue[skater.id]!))
        }),
      )

    expect(endFatigue(75)).toBeLessThan(endFatigue(25))
  })
})
