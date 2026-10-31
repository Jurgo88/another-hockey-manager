import { describe, expect, it } from 'vitest'
import type { Club, Lineup } from '../src/domain/club.js'
import type { MatchEvent, ShiftChangeEvent } from '../src/domain/event.js'
import type { Fixture } from '../src/domain/fixture.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'
import { buildNaiveLineup, DEFAULT_TACTICS } from '../src/engine/lineup.js'
import { simulateFixture } from '../src/engine/simulate.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { foldMatch } from '../src/stats/match.js'
import { skatersAllowed } from './support/events.js'
import { fixtureBetween } from './support/fixtures.js'

const IDENTITIES = new Map(
  NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
)

async function twoClubs(): Promise<[Club, Club]> {
  const provider = createGeneratedRosterProvider({
    structure: NHL_2026_27,
    seed: 2026,
    clubIdentities: IDENTITIES,
  })
  const { clubs } = await provider.loadCompetition('nhl')
  return [clubs[0]!, clubs[1]!]
}

const FIXTURES = 400

function playMany(
  home: Club,
  away: Club,
  overtime: Fixture['overtime'],
  homeLineup: Lineup = buildNaiveLineup(home),
): { fixture: Fixture; events: MatchEvent[] }[] {
  const fixture = { ...fixtureBetween(home.id, away.id), overtime }
  const input = {
    fixture,
    homeClub: home,
    awayClub: away,
    homeLineup,
    awayLineup: buildNaiveLineup(away),
  }
  return Array.from({ length: FIXTURES }, (_, i) => ({
    fixture,
    events: simulateFixture(input, 20_000 + i),
  }))
}

const isShift = (e: MatchEvent): e is ShiftChangeEvent => e.type === 'shift_change'

describe('regular-season overtime (FR-09)', async () => {
  const [home, away] = await twoClubs()
  const runs = playMany(home, away, 'regular-3on3-then-shootout')
  const results = runs.map(({ fixture, events }) => ({
    events,
    result: foldMatch(fixture, events).result,
  }))

  it('never leaves a Fixture level', () => {
    expect(results.every(({ result }) => result.winner !== null)).toBe(true)
    expect(results.some(({ result }) => result.decidedIn === 'overtime')).toBe(true)
    expect(results.some(({ result }) => result.decidedIn === 'shootout')).toBe(true)
  })

  it('plays at most five minutes of overtime, from the end of regulation', () => {
    for (const { events } of results) {
      const start = events.find((e) => e.type === 'period_start' && e.period === 'OT')
      const end = events.find((e) => e.type === 'period_end' && e.period === 'OT')
      if (!start) continue
      expect(start.clock).toBe(3600)
      expect(end!.clock - start.clock).toBeLessThanOrEqual(300)
    }
  })

  it('plays level overtime 3-on-3 with the overtime trios', () => {
    const trioPlayers = new Set(buildNaiveLineup(home).overtimeRotation.flatMap((t) => t.players))
    let checked = 0
    // An injury changes who is dressed, and so who makes up the trios.
    for (const { events } of results.filter((r) => !r.events.some((e) => e.type === 'injury'))) {
      for (const shift of events.filter(isShift)) {
        if (shift.period !== 'OT' || shift.strength !== 'even' || shift.clubId !== home.id) continue
        expect(shift.onIce).toHaveLength(3)
        for (const id of shift.onIce) expect(trioPlayers).toContain(id)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('ends overtime on the first goal', () => {
    for (const { events } of results) {
      const goals = events.filter((e) => e.type === 'goal' && e.period === 'OT')
      expect(goals.length).toBeLessThanOrEqual(1)
      if (goals.length === 1) {
        const end = events.find((e) => e.type === 'period_end' && e.period === 'OT')!
        expect(end.clock).toBe(goals[0]!.clock)
        expect(events.some((e) => e.period === 'SO')).toBe(false)
      }
    }
  })

  it('stops a shootout as soon as one side cannot catch up', () => {
    for (const { events, result } of results) {
      if (result.decidedIn !== 'shootout') continue
      const attempts = events.filter((e) => e.type === 'shot' && e.period === 'SO')
      const tally = { [home.id]: { scored: 0, taken: 0 }, [away.id]: { scored: 0, taken: 0 } }
      attempts.forEach((attempt, i) => {
        if (attempt.type !== 'shot') return
        const side = tally[attempt.clubId]!
        side.taken++
        if (attempt.result === 'goal') side.scored++
        if (i === attempts.length - 1) return
        // Before the last attempt the shootout was still open: within three
        // rounds neither side was out of reach.
        const [a, b] = [tally[home.id]!, tally[away.id]!]
        if (a.taken <= 3 && b.taken <= 3) {
          expect(a.scored + (3 - a.taken)).toBeGreaterThanOrEqual(b.scored)
          expect(b.scored + (3 - b.taken)).toBeGreaterThanOrEqual(a.scored)
        }
      })
      expect(result.shootout!.homeGoals).not.toBe(result.shootout!.awayGoals)
      expect(events.at(-2)).toMatchObject({ type: 'period_end', period: 'SO' })
    }
  })
})

describe('playoff overtime (FR-09a)', async () => {
  const [home, away] = await twoClubs()
  const runs = playMany(home, away, 'sudden-death-5on5')
  const results = runs.map(({ fixture, events }) => ({
    events,
    result: foldMatch(fixture, events).result,
  }))

  it('always produces a winner and never a shootout', () => {
    expect(results.every(({ result }) => result.winner !== null)).toBe(true)
    expect(results.every(({ result }) => result.decidedIn !== 'shootout')).toBe(true)
    expect(results.every(({ events }) => events.every((e) => e.period !== 'SO'))).toBe(true)
  })

  it('plays full twenty-minute 5-on-5 Periods until a goal', () => {
    let overtimes = 0
    let longest = 0
    let fiveASide = 0
    let levelShifts = 0
    for (const { events, result } of results) {
      if (result.decidedIn !== 'overtime') continue
      overtimes++
      const starts = events.filter((e) => e.type === 'period_start' && e.period === 'OT')
      starts.forEach((start, i) => expect(start.clock).toBe(3600 + 1200 * i))
      longest = Math.max(longest, starts.length)

      // 5-on-5 - never the 3-on-3 trios; 4-on-4 only when both Clubs are a man short.
      const level = events.filter(
        (e): e is ShiftChangeEvent => isShift(e) && e.period === 'OT' && e.strength === 'even',
      )
      for (const shift of level) expect(skatersAllowed(shift)).toBeGreaterThanOrEqual(4)
      fiveASide += level.filter((shift) => skatersAllowed(shift) === 5).length
      levelShifts += level.length

      const goal = events.filter((e) => e.type === 'goal' && e.period === 'OT')
      expect(goal).toHaveLength(1)
      expect(events.at(-2)).toMatchObject({
        type: 'period_end',
        period: 'OT',
        clock: goal[0]!.clock,
      })
    }
    expect(overtimes).toBeGreaterThan(0)
    expect(longest).toBeGreaterThanOrEqual(1)
    expect(fiveASide / levelShifts).toBeGreaterThan(0.9)
  })

  it('never pulls a Goalie in overtime', () => {
    for (const { events } of results) {
      expect(events.some((e) => isShift(e) && e.period === 'OT' && e.goalie === null)).toBe(false)
    }
  })
})

describe('a Fixture whose level score stands', async () => {
  const [home, away] = await twoClubs()

  it('ends after regulation, level if need be', () => {
    const results = playMany(home, away, null).map(
      ({ fixture, events }) => foldMatch(fixture, events).result,
    )
    expect(results.some((r) => r.winner === null)).toBe(true)
    expect(results.every((r) => r.decidedIn === 'regulation')).toBe(true)
  })
})

describe('pulling the Goalie (FR-22)', async () => {
  const [home, away] = await twoClubs()

  it('pulls only in the third Period, only when one of the rules matches', () => {
    const pullsByDeficit = new Map<number, number>()
    for (const { events } of playMany(home, away, 'regular-3on3-then-shootout')) {
      const score = { [home.id]: 0, [away.id]: 0 }
      for (const event of events) {
        if (event.type === 'goal') score[event.clubId]!++
        if (!isShift(event) || event.goalie !== null) continue
        const other = event.clubId === home.id ? away.id : home.id
        const deficit = score[other]! - score[event.clubId]!
        pullsByDeficit.set(deficit, (pullsByDeficit.get(deficit) ?? 0) + 1)

        expect(event.period).toBe(3)
        const matching = DEFAULT_TACTICS.pullGoalie.filter(
          (rule) =>
            rule.deficit === deficit &&
            3600 - event.clock <= rule.secondsRemaining &&
            (!rule.powerPlayOnly || event.strength === 'powerplay'),
        )
        expect(matching.length).toBeGreaterThan(0)
      }
    }
    // The default rules pull one goal down and two goals down alike.
    expect(pullsByDeficit.get(1)).toBeGreaterThan(0)
    expect(pullsByDeficit.get(2)).toBeGreaterThan(0)
  })

  it('pulls three goals down only on a power play, for a 6-on-4', () => {
    const threeDown = { deficit: 3, secondsRemaining: 1200, powerPlayOnly: true }
    const chasing = {
      ...buildNaiveLineup(home),
      tactics: { ...DEFAULT_TACTICS, pullGoalie: [threeDown] },
    }
    let pulls = 0
    for (const { events } of playMany(home, away, 'regular-3on3-then-shootout', chasing)) {
      for (const shift of events.filter(isShift)) {
        if (shift.clubId !== home.id || shift.goalie !== null) continue
        pulls++
        expect(shift.strength).toBe('powerplay')
        expect(shift.onIce).toHaveLength(skatersAllowed(shift) + 1)
      }
    }
    expect(pulls).toBeGreaterThan(0)
  })

  it('scores empty-net goals only into a net the stream says is empty', () => {
    let emptyNetGoals = 0
    for (const { events } of playMany(home, away, 'regular-3on3-then-shootout')) {
      const goalieOut = new Map<string, boolean>()
      for (const event of events) {
        if (isShift(event)) goalieOut.set(event.clubId, event.goalie === null)
        if (event.type !== 'goal') continue
        const conceding = event.clubId === home.id ? away.id : home.id
        expect(event.emptyNet).toBe(goalieOut.get(conceding) ?? false)
        if (event.emptyNet) {
          emptyNetGoals++
          expect(event.goalieBeaten).toBeUndefined()
        }
      }
    }
    expect(emptyNetGoals).toBeGreaterThan(0)
  })

  it('never empties the net when the Manager never pulls', () => {
    const neverPull = {
      ...buildNaiveLineup(home),
      tactics: { ...DEFAULT_TACTICS, pullGoalie: [] },
    }
    for (const { events } of playMany(home, away, 'regular-3on3-then-shootout', neverPull)) {
      expect(events.some((e) => isShift(e) && e.clubId === home.id && e.goalie === null)).toBe(
        false,
      )
      expect(events.some((e) => e.type === 'goal' && e.clubId === away.id && e.emptyNet)).toBe(
        false,
      )
    }
  })
})
