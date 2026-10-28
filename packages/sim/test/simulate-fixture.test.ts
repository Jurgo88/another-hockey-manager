import { beforeAll, describe, expect, it } from 'vitest'
import type { Club, Lineup } from '../src/domain/club.js'
import type { GoalEvent, MatchEvent, SaveEvent, ShotEvent } from '../src/domain/event.js'
import type { FixtureInput } from '../src/domain/fixture.js'
import { buildNaiveLineup, DEFAULT_TACTICS } from '../src/engine/lineup.js'
import { simulateFixture } from '../src/engine/simulate-fixture.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'

const IDENTITIES = new Map(
  NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
)

let league: readonly Club[]

beforeAll(async () => {
  const provider = createGeneratedRosterProvider({
    structure: NHL_2026_27,
    seed: 2026,
    clubIdentities: IDENTITIES,
  })
  league = (await provider.loadCompetition('nhl')).clubs
})

function fixtureInput(home: Club, away: Club, homeLineup?: Lineup, awayLineup?: Lineup): FixtureInput {
  return {
    fixture: {
      id: `${home.id}-${away.id}`,
      competitionId: 'nhl',
      seasonId: '2026-27',
      round: 0,
      homeClubId: home.id,
      awayClubId: away.id,
      allowsTie: true,
    },
    homeClub: home,
    awayClub: away,
    homeLineup: homeLineup ?? buildNaiveLineup(home),
    awayLineup: awayLineup ?? buildNaiveLineup(away),
  }
}

const shots = (events: readonly MatchEvent[]) =>
  events.filter((e): e is ShotEvent => e.type === 'shot')
const goals = (events: readonly MatchEvent[]) =>
  events.filter((e): e is GoalEvent => e.type === 'goal')
const saves = (events: readonly MatchEvent[]) =>
  events.filter((e): e is SaveEvent => e.type === 'save')

/** Simulates a round of Fixtures pairing Clubs off against each other. */
function simulateRound(count: number, seedBase = 900): MatchEvent[][] {
  return Array.from({ length: count }, (_, i) => {
    const home = league[(i * 2) % league.length]!
    const away = league[(i * 2 + 1) % league.length]!
    return simulateFixture(fixtureInput(home, away), seedBase + i)
  })
}

describe('simulateFixture - purity and structure (FR-01, FR-02)', () => {
  it('reproduces the same stream from the same seed', () => {
    const input = fixtureInput(league[0]!, league[1]!)
    expect(simulateFixture(input, 77)).toEqual(simulateFixture(input, 77))
  })

  it('produces a different stream from a different seed', () => {
    const input = fixtureInput(league[0]!, league[1]!)
    expect(simulateFixture(input, 77)).not.toEqual(simulateFixture(input, 78))
  })

  it('opens and closes all three periods', () => {
    const events = simulateFixture(fixtureInput(league[0]!, league[1]!), 5)
    expect(events.filter((e) => e.type === 'period_start').map((e) => e.period)).toEqual([1, 2, 3])
    expect(events.filter((e) => e.type === 'period_end').map((e) => e.period)).toEqual([1, 2, 3])
  })

  it('reports a final score matching the goal events', () => {
    const events = simulateFixture(fixtureInput(league[0]!, league[1]!), 5)
    const final = events.filter((e) => e.type === 'period_end').at(-1)!
    const scored = goals(events)
    expect(final.homeGoals + final.awayGoals).toBe(scored.length)
  })
})

describe('Tier 4 - internal consistency', () => {
  const streams = () => simulateRound(6, 400)

  it('keeps the clock monotonically non-decreasing', () => {
    for (const events of streams()) {
      let previous = -1
      for (const event of events) {
        expect(event.clock).toBeGreaterThanOrEqual(previous)
        previous = event.clock
      }
    }
  })

  it('precedes every goal with a shot resolved as a goal at the same clock', () => {
    for (const events of streams()) {
      for (const [i, event] of events.entries()) {
        if (event.type !== 'goal') continue
        const shot = events[i - 1]
        expect(shot?.type).toBe('shot')
        expect((shot as ShotEvent).result).toBe('goal')
        expect(shot?.clock).toBe(event.clock)
      }
    }
  })

  it('matches every save event to a shot resolved as a save', () => {
    for (const events of streams()) {
      expect(saves(events).length).toBe(shots(events).filter((s) => s.result === 'save').length)
    }
  })

  it('makes shots on goal equal goals plus saves, excluding blocks and misses', () => {
    for (const events of streams()) {
      const onGoal = shots(events).filter((s) => s.result === 'goal' || s.result === 'save')
      expect(onGoal.length).toBe(goals(events).length + saves(events).length)
    }
  })

  it('credits at most two assists per goal, never the scorer', () => {
    for (const events of streams()) {
      for (const goal of goals(events)) {
        expect(goal.assists.length).toBeLessThanOrEqual(2)
        expect(goal.assists).not.toContain(goal.scorer)
        expect(new Set(goal.assists).size).toBe(goal.assists.length)
      }
    }
  })
})

describe('Tier 1 - aggregate rates (even strength only)', () => {
  // Power plays are issue #5, so the measured league targets are reduced by
  // their power-play share: 6.16 goals per Fixture less 1.22 from the power
  // play leaves ~4.94, and 27.8 shots per Club less its power-play share
  // leaves ~24. Full Tier 1 bands only become reachable once #5 lands.
  const FIXTURES = 40
  let streams: MatchEvent[][]

  beforeAll(() => {
    streams = simulateRound(FIXTURES)
  })

  it('scores about 4.9 goals per Fixture across both Clubs', () => {
    const perFixture = streams.map((events) => goals(events).length)
    const average = perFixture.reduce((sum, n) => sum + n, 0) / perFixture.length
    expect(average).toBeGreaterThan(4.1)
    expect(average).toBeLessThan(5.8)
  })

  it('puts about 24 shots on goal per Club per Fixture', () => {
    const perClub = streams.map((events) => {
      const onGoal = shots(events).filter((s) => s.result === 'goal' || s.result === 'save')
      return onGoal.length / 2
    })
    const average = perClub.reduce((sum, n) => sum + n, 0) / perClub.length
    expect(average).toBeGreaterThan(21)
    expect(average).toBeLessThan(27)
  })

  it('converts about 10.3% of shots on goal', () => {
    const allShots = streams.flatMap(shots)
    const onGoal = allShots.filter((s) => s.result === 'goal' || s.result === 'save')
    const percentage = (onGoal.filter((s) => s.result === 'goal').length / onGoal.length) * 100
    expect(percentage).toBeGreaterThan(8.8)
    expect(percentage).toBeLessThan(11.8)
  })

  it('leaves league save percentage near 0.897', () => {
    const allShots = streams.flatMap(shots)
    const onGoal = allShots.filter((s) => s.result === 'goal' || s.result === 'save')
    const savePct = onGoal.filter((s) => s.result === 'save').length / onGoal.length
    expect(savePct).toBeGreaterThan(0.882)
    expect(savePct).toBeLessThan(0.912)
  })

  it('splits faceoffs close to evenly league-wide', () => {
    const faceoffs = streams.flatMap((events) => events.filter((e) => e.type === 'faceoff'))
    const homeWins = streams.flatMap((events) =>
      events
        .filter((e) => e.type === 'faceoff')
        .filter((e) => e.wonBy === events.find((x) => x.type === 'shift_change')!.clubId),
    )
    const rate = homeWins.length / faceoffs.length
    expect(rate).toBeGreaterThan(0.44)
    expect(rate).toBeLessThan(0.56)
  })
})

describe('Tier 3 - shotVolume is not the aggression dial', () => {
  it('raises attempt count and lowers mean danger', () => {
    function run(shotVolume: number) {
      const attempts: number[] = []
      const dangers: number[] = []
      for (let i = 0; i < 12; i++) {
        const home = league[i * 2]!
        const away = league[i * 2 + 1]!
        const homeLineup: Lineup = {
          ...buildNaiveLineup(home),
          tactics: { ...DEFAULT_TACTICS, shotVolume },
        }
        const events = simulateFixture(fixtureInput(home, away, homeLineup), 700 + i)
        const homeShots = shots(events).filter((s) => s.clubId === home.id)
        attempts.push(homeShots.length)
        dangers.push(homeShots.reduce((sum, s) => sum + s.danger, 0) / homeShots.length)
      }
      const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length
      return { attempts: mean(attempts), danger: mean(dangers) }
    }

    const low = run(25)
    const high = run(75)
    expect(high.attempts).toBeGreaterThan(low.attempts)
    expect(high.danger).toBeLessThan(low.danger)
  })
})
