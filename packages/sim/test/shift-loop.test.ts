import { describe, expect, it } from 'vitest'
import type { Club, Lineup } from '../src/domain/club.js'
import type { MatchEvent, ShiftChangeEvent } from '../src/domain/event.js'
import type { FixtureInput } from '../src/domain/fixture.js'
import type { PlayerId } from '../src/domain/player.js'
import { buildNaiveLineup, DEFAULT_TACTICS } from '../src/engine/lineup.js'
import { simulateFixture } from '../src/engine/simulate-fixture.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'
import { foldMatch } from '../src/stats/match.js'
import { fixtureBetween } from './support/streams.js'

const REGULATION_SECONDS = 3 * 1200

const IDENTITIES = new Map(
  NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
)

async function twoClubs(seed: number): Promise<[Club, Club]> {
  const provider = createGeneratedRosterProvider({ structure: NHL_2026_27, seed, clubIdentities: IDENTITIES })
  const { clubs } = await provider.loadCompetition('nhl')
  return [clubs[0]!, clubs[1]!]
}

function fixtureInput(home: Club, away: Club, homeLineup: Lineup, awayLineup: Lineup): FixtureInput {
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
    homeLineup,
    awayLineup,
  }
}

function shiftChanges(events: readonly MatchEvent[]): ShiftChangeEvent[] {
  return events.filter((e): e is ShiftChangeEvent => e.type === 'shift_change')
}

function iceTimeByPlayer(home: Club, away: Club, events: readonly MatchEvent[]): Map<PlayerId, number> {
  const stats = foldMatch(fixtureBetween(home.id, away.id), events)
  return new Map([...stats.skaters].map(([id, skater]) => [id, skater.iceTimeSeconds]))
}

const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

describe('shift deployment', () => {
  it('accounts for the whole of regulation across each Club', async () => {
    const [home, away] = await twoClubs(2026)
    const homeLineup = buildNaiveLineup(home)
    const events = simulateFixture(fixtureInput(home, away, homeLineup, buildNaiveLineup(away)), 1)
    const iceTime = iceTimeByPlayer(home, away, events)

    const homeIds = new Set([
      ...homeLineup.lines.flatMap((l) => [l.leftWing, l.centre, l.rightWing]),
      ...homeLineup.pairings.flatMap((p) => [p.leftDefence, p.rightDefence]),
    ])
    const homeTotal = [...iceTime.entries()]
      .filter(([id]) => homeIds.has(id))
      .reduce((sum, [, seconds]) => sum + seconds, 0)

    // Five on-ice slots at every instant of a 3600s Fixture.
    expect(homeTotal).toBeCloseTo(5 * REGULATION_SECONDS, 0)
  })

  it('dresses exactly 5 skaters per shift_change, none of them twice', async () => {
    const [home, away] = await twoClubs(2026)
    const events = simulateFixture(
      fixtureInput(home, away, buildNaiveLineup(home), buildNaiveLineup(away)),
      7,
    )
    for (const event of shiftChanges(events)) {
      expect(event.onIce).toHaveLength(5)
      expect(new Set(event.onIce).size).toBe(5)
    }
  })
})

describe('ice-time distribution (FR-23)', () => {
  const FIXTURE_COUNT = 16

  it('deploys tier-1 Lines for measurably more ice time than tier-4 Lines', async () => {
    const tier1: number[] = []
    const tier4: number[] = []

    for (let i = 0; i < FIXTURE_COUNT; i++) {
      const [home, away] = await twoClubs(1000 + i)
      const homeLineup = buildNaiveLineup(home)
      const awayLineup = buildNaiveLineup(away)
      const events = simulateFixture(fixtureInput(home, away, homeLineup, awayLineup), 5000 + i)
      const iceTime = iceTimeByPlayer(home, away, events)

      for (const lineup of [homeLineup, awayLineup]) {
        const line1 = lineup.lines[0]
        const line4 = lineup.lines[3]
        tier1.push(mean([line1.leftWing, line1.centre, line1.rightWing].map((id) => iceTime.get(id) ?? 0)))
        tier4.push(mean([line4.leftWing, line4.centre, line4.rightWing].map((id) => iceTime.get(id) ?? 0)))
      }
    }

    // FR-23 measures 19:34 (1174s) against 12:03 (723s), a ratio of 1.62. The
    // deployment-weight constants are provisional (#15 calibrates them), so
    // this asserts direction and rough magnitude rather than the exact band.
    const ratio = mean(tier1) / mean(tier4)
    expect(ratio).toBeGreaterThan(1.1)
    expect(ratio).toBeLessThan(2.5)
  })
})

describe('matchup policy (directional effect)', () => {
  async function topLineShare(matchup: 'none' | 'exploit'): Promise<number> {
    const shares: number[] = []
    for (let i = 0; i < 12; i++) {
      const [home, away] = await twoClubs(2000 + i)
      const homeLineup: Lineup = {
        ...buildNaiveLineup(home),
        tactics: { ...DEFAULT_TACTICS, matchup },
      }
      const events = simulateFixture(fixtureInput(home, away, homeLineup, buildNaiveLineup(away)), 3000 + i)
      const iceTime = iceTimeByPlayer(home, away, events)

      const line1 = homeLineup.lines[0]
      const line1Time = [line1.leftWing, line1.centre, line1.rightWing].reduce(
        (sum, id) => sum + (iceTime.get(id) ?? 0),
        0,
      )
      const totalForwardTime = homeLineup.lines
        .flatMap((l) => [l.leftWing, l.centre, l.rightWing])
        .reduce((sum, id) => sum + (iceTime.get(id) ?? 0), 0)
      shares.push(line1Time / totalForwardTime)
    }
    return mean(shares)
  }

  it('exploit increases the home top Line share of ice time versus none', async () => {
    expect(await topLineShare('exploit')).toBeGreaterThan(await topLineShare('none'))
  })
})
