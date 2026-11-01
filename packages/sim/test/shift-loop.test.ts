import { describe, expect, it } from 'vitest'
import type { Club, Lineup } from '../src/domain/club.js'
import type { MatchEvent, ShiftChangeEvent } from '../src/domain/event.js'
import type { PlayerId } from '../src/domain/player.js'
import { buildNaiveLineup, DEFAULT_TACTICS } from '../src/engine/lineup.js'
import { simulateFixture } from '../src/engine/simulate.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'
import { foldMatch } from '../src/stats/match.js'
import { endOfPlay, skatersAllowed } from './support/events.js'
import { fixtureBetween } from './support/fixtures.js'

const IDENTITIES = new Map(
  NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
)

async function someClubs(seed: number, count: number): Promise<Club[]> {
  const provider = createGeneratedRosterProvider({ structure: NHL_2026_27, seed, clubIdentities: IDENTITIES })
  const { clubs } = await provider.loadCompetition('nhl')
  return clubs.slice(0, count)
}

function play(
  home: Club,
  away: Club,
  seed: number,
  homeLineup: Lineup = buildNaiveLineup(home),
  awayLineup: Lineup = buildNaiveLineup(away),
): MatchEvent[] {
  const fixture = fixtureBetween(home.id, away.id)
  return simulateFixture({ fixture, homeClub: home, awayClub: away, homeLineup, awayLineup }, seed)
}

function shiftChanges(events: readonly MatchEvent[]): ShiftChangeEvent[] {
  return events.filter((e): e is ShiftChangeEvent => e.type === 'shift_change')
}

function iceTimeByPlayer(home: Club, away: Club, events: readonly MatchEvent[]): Map<PlayerId, number> {
  const stats = foldMatch(fixtureBetween(home.id, away.id), events)
  return new Map([...stats.skaters].map(([id, skater]) => [id, skater.iceTimeSeconds]))
}

describe('shift loop', () => {
  it('fills the whole of play with Shifts, every on-ice slot accounted for', async () => {
    const [home, away] = await someClubs(2026, 2)
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const events = play(home!, away!, seed)
      const end = endOfPlay(events)
      const iceTime = iceTimeByPlayer(home!, away!, events)
      const homeShifts = shiftChanges(events).filter((e) => e.clubId === home!.id)

      // Shifts tile the clock with no gap, and the fold credits each one's
      // seconds to everybody it put on the ice - five a side, fewer when
      // short, six with the Goalie pulled.
      let covered = 0
      let slotSeconds = 0
      homeShifts.forEach((shift, i) => {
        const seconds = (homeShifts[i + 1]?.clock ?? end) - shift.clock
        covered += seconds
        slotSeconds += seconds * shift.onIce.length
      })
      const homeTotal = home!.skaters.reduce((sum, s) => sum + (iceTime.get(s.id) ?? 0), 0)

      expect(homeShifts[0]!.clock).toBe(0)
      expect(end).toBeGreaterThanOrEqual(3600)
      expect(covered).toBe(end)
      expect(homeTotal).toBe(slotSeconds)
    }
  })

  it('starts a Shift at the opening of every Period', async () => {
    const [home, away] = await someClubs(2026, 2)
    const clocks = new Set(shiftChanges(play(home!, away!, 1)).map((e) => e.clock))
    for (const start of [0, 1200, 2400]) expect(clocks.has(start)).toBe(true)
  })

  it('dresses as many Skaters as the strength says, never fewer than three', async () => {
    const [home, away] = await someClubs(2026, 2)
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const changes = shiftChanges(play(home!, away!, seed))
      for (let i = 0; i < changes.length; i += 2) {
        const [a, b] = [changes[i]!, changes[i + 1]!]
        expect(a.clock).toBe(b.clock)
        for (const shift of [a, b]) expect(skatersAllowed(shift)).toBeGreaterThanOrEqual(3)

        const margin = skatersAllowed(a) - skatersAllowed(b)
        expect(a.strength).toBe(margin > 0 ? 'powerplay' : margin < 0 ? 'penaltykill' : 'even')
        expect(b.strength).toBe(margin < 0 ? 'powerplay' : margin > 0 ? 'penaltykill' : 'even')
      }
    }
  })

  it('sends the special-teams Units out when the strength changes', async () => {
    const [home, away] = await someClubs(2026, 2)
    const lineup = buildNaiveLineup(home!)
    const powerPlayers = new Set(lineup.powerPlayUnits.flatMap((u) => u.skaters))
    const killers = new Set(lineup.penaltyKillUnits.flatMap((u) => u.skaters))

    let checked = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const events = play(home!, away!, seed)
      for (const shift of shiftChanges(events)) {
        if (shift.clubId !== home!.id || shift.strength === 'even') continue
        const unit = shift.strength === 'powerplay' ? powerPlayers : killers
        // Members in the box or hurt are replaced from the bench: one for the box, and each injury.
        const hurt = events
          .slice(0, events.indexOf(shift))
          .filter((e) => e.type === 'injury' && e.clubId === home!.id).length
        expect(shift.onIce.filter((id) => !unit.has(id)).length).toBeLessThanOrEqual(1 + hurt)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('ice-time distribution (FR-23)', () => {
  // Averaged across many independent Fixtures, each Club's Line 1 and Line 4 (per
  // buildNaiveLineup's quality ordering) stand in for the measured NHL forward tiers.
  // The measured bands are held by test/realism/ice-time.test.ts.
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
      const events = play(home!, away!, 5000 + i, homeLineup, awayLineup)
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
        const events = play(home!, away!, 3000 + i, homeLineup)
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
