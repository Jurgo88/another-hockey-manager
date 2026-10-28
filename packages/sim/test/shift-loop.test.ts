import { describe, expect, it } from 'vitest'
import type { Club } from '../src/domain/club.js'
import type { ShiftChangeEvent } from '../src/domain/event.js'
import type { PlayerId } from '../src/domain/player.js'
import { buildNaiveLineup, DEFAULT_TACTICS } from '../src/engine/lineup.js'
import { runShiftLoop } from '../src/engine/shift-loop.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { createRng } from '../src/rng/index.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'
import { foldMatch } from '../src/stats/match.js'
import { fixtureBetween, inRegulationPeriods } from './support/streams.js'

const IDENTITIES = new Map(
  NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
)

async function someClubs(seed: number, count: number): Promise<Club[]> {
  const provider = createGeneratedRosterProvider({ structure: NHL_2026_27, seed, clubIdentities: IDENTITIES })
  const { clubs } = await provider.loadCompetition('nhl')
  return clubs.slice(0, count)
}

function iceTimeByPlayer(
  home: Club,
  away: Club,
  events: readonly ShiftChangeEvent[],
): Map<PlayerId, number> {
  const stats = foldMatch(fixtureBetween(home.id, away.id), inRegulationPeriods(events))
  return new Map([...stats.skaters].map(([id, skater]) => [id, skater.iceTimeSeconds]))
}

describe('runShiftLoop', () => {
  it('advances the match clock to exactly 3600 seconds of regulation', async () => {
    const [home, away] = await someClubs(2026, 2)
    const events = runShiftLoop(
      { club: home!, lineup: buildNaiveLineup(home!) },
      { club: away!, lineup: buildNaiveLineup(away!) },
      createRng(1),
    )
    const iceTime = iceTimeByPlayer(home!, away!, events)
    // Every dressed Skater's ice time across the match should sum, per Club, to 5 * 3600
    // (5 on-ice slots at every instant of a 3600s game).
    const homeIds = new Set([
      ...buildNaiveLineup(home!).lines.flatMap((l) => [l.leftWing, l.centre, l.rightWing]),
      ...buildNaiveLineup(home!).pairings.flatMap((p) => [p.leftDefence, p.rightDefence]),
    ])
    const homeTotal = [...iceTime.entries()]
      .filter(([id]) => homeIds.has(id))
      .reduce((sum, [, seconds]) => sum + seconds, 0)
    expect(homeTotal).toBeCloseTo(5 * 3600, 0)
  })

  it('is deterministic for the same seed', async () => {
    const [home, away] = await someClubs(2026, 2)
    const run = () =>
      runShiftLoop(
        { club: home!, lineup: buildNaiveLineup(home!) },
        { club: away!, lineup: buildNaiveLineup(away!) },
        createRng(42),
      )
    expect(run()).toEqual(run())
  })

  it('only ever reports even strength (special teams are issue #5)', async () => {
    const [home, away] = await someClubs(2026, 2)
    const events = runShiftLoop(
      { club: home!, lineup: buildNaiveLineup(home!) },
      { club: away!, lineup: buildNaiveLineup(away!) },
      createRng(7),
    )
    expect(events.every((e) => e.strength === 'even')).toBe(true)
  })

  it('dresses exactly 5 skaters per shift_change event', async () => {
    const [home, away] = await someClubs(2026, 2)
    const events = runShiftLoop(
      { club: home!, lineup: buildNaiveLineup(home!) },
      { club: away!, lineup: buildNaiveLineup(away!) },
      createRng(7),
    )
    expect(events.every((e) => e.onIce.length === 5)).toBe(true)
  })
})

describe('ice-time distribution (FR-23)', () => {
  // Averaged across many independent Fixtures, each Club's Line 1 and Line 4 (per
  // buildNaiveLineup's quality ordering) stand in for the measured NHL forward tiers.
  const FIXTURE_COUNT = 24

  async function simulateMany(matchup: 'none' | 'exploit' | 'shutdown' = 'none') {
    const tier1: number[] = []
    const tier4: number[] = []

    for (let i = 0; i < FIXTURE_COUNT; i++) {
      const [home, away] = await someClubs(1000 + i, 2)
      const homeLineup = {
        ...buildNaiveLineup(home!),
        tactics: { ...DEFAULT_TACTICS, matchup },
      }
      const awayLineup = buildNaiveLineup(away!)
      const events = runShiftLoop(
        { club: home!, lineup: homeLineup },
        { club: away!, lineup: awayLineup },
        createRng(5000 + i),
      )
      const iceTime = iceTimeByPlayer(home!, away!, events)

      for (const lineup of [homeLineup, awayLineup]) {
        const line1 = lineup.lines[0]
        const line4 = lineup.lines[3]
        tier1.push(mean([line1.leftWing, line1.centre, line1.rightWing].map((id) => iceTime.get(id) ?? 0)))
        tier4.push(mean([line4.leftWing, line4.centre, line4.rightWing].map((id) => iceTime.get(id) ?? 0)))
      }
    }

    return { tier1, tier4 }
  }

  function mean(values: readonly number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  it('deploys tier-1 Lines for measurably more ice time than tier-4 Lines', async () => {
    const { tier1, tier4 } = await simulateMany()
    const tier1Mean = mean(tier1)
    const tier4Mean = mean(tier4)

    // FR-23: measured means are 19:34 (1174s) and 12:03 (723s), ratio 1.62.
    // This is issue #3's shift loop alone, with no possession resolution yet
    // and provisional deployment-weight constants (#15 calibrates the shape),
    // so this checks direction and rough magnitude, not the exact bands.
    expect(tier1Mean).toBeGreaterThan(tier4Mean)
    const ratio = tier1Mean / tier4Mean
    expect(ratio).toBeGreaterThan(1.1)
    expect(ratio).toBeLessThan(2.5)
  })
})

describe('matchup policy (directional effect)', () => {
  it('exploit increases the home top Line share of ice time versus none', async () => {
    async function topLineShare(matchup: 'none' | 'exploit'): Promise<number> {
      const shares: number[] = []
      for (let i = 0; i < 16; i++) {
        const [home, away] = await someClubs(2000 + i, 2)
        const homeLineup = { ...buildNaiveLineup(home!), tactics: { ...DEFAULT_TACTICS, matchup } }
        const awayLineup = buildNaiveLineup(away!)
        const events = runShiftLoop(
          { club: home!, lineup: homeLineup },
          { club: away!, lineup: awayLineup },
          createRng(3000 + i),
        )
        const iceTime = iceTimeByPlayer(home!, away!, events)
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
      return shares.reduce((sum, s) => sum + s, 0) / shares.length
    }

    const noneShare = await topLineShare('none')
    const exploitShare = await topLineShare('exploit')
    expect(exploitShare).toBeGreaterThan(noneShare)
  })
})
