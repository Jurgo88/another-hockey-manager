import { describe, expect, it } from 'vitest'
import type { Club, Lineup } from '../src/domain/club.js'
import type { GoalEvent, MatchEvent, ShiftChangeEvent, ShotEvent } from '../src/domain/event.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'
import { buildNaiveLineup, DEFAULT_TACTICS } from '../src/engine/lineup.js'
import { fixtureSeed, simulateFixture } from '../src/engine/simulate.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { createRng } from '../src/rng/index.js'
import { foldMatch } from '../src/stats/match.js'
import { endOfPlay, skatersAllowed } from './support/events.js'
import { fixtureBetween } from './support/fixtures.js'

const IDENTITIES = new Map(
  NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
)

async function twoClubs(seed = 2026): Promise<[Club, Club]> {
  const provider = createGeneratedRosterProvider({
    structure: NHL_2026_27,
    seed,
    clubIdentities: IDENTITIES,
  })
  const { clubs } = await provider.loadCompetition('nhl')
  return [clubs[0]!, clubs[1]!]
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

/** Many Fixtures between the same two Clubs, concatenated with the seed of each. */
function playMany(count: number, run: (seed: number) => MatchEvent[]): MatchEvent[][] {
  return Array.from({ length: count }, (_, i) => run(10_000 + i))
}

describe('simulateFixture', () => {
  it('is deterministic for the same seed and varies with it (D-01)', async () => {
    const [home, away] = await twoClubs()
    expect(play(home, away, 42)).toEqual(play(home, away, 42))
    expect(play(home, away, 42)).not.toEqual(play(home, away, 43))
  })

  it('does not mutate its input', async () => {
    const [home, away] = await twoClubs()
    const before = structuredClone([home, away])
    play(home, away, 42)
    expect([home, away]).toEqual(before)
  })

  it('plays three Periods of whole-second, non-decreasing clock', async () => {
    const [home, away] = await twoClubs()
    const events = play(home, away, 3)

    expect(events[0]).toMatchObject({ type: 'period_start', period: 1, clock: 0 })
    expect(events.at(-1)).toMatchObject({ type: 'period_end', period: 3, clock: 3600 })
    expect(events.filter((e) => e.type === 'period_start').map((e) => e.clock)).toEqual([
      0, 1200, 2400,
    ])
    for (let i = 1; i < events.length; i++) {
      expect(Number.isInteger(events[i]!.clock)).toBe(true)
      expect(events[i]!.clock).toBeGreaterThanOrEqual(events[i - 1]!.clock)
    }
  })

  it('pairs every goal and save with the shot that produced it (Tier 4)', async () => {
    const [home, away] = await twoClubs()
    for (const events of playMany(20, (seed) => play(home, away, seed))) {
      events.forEach((event, i) => {
        if (event.type !== 'goal' && event.type !== 'save') return
        const shot = events[i - 1] as ShotEvent
        expect(shot.type).toBe('shot')
        expect(shot.clock).toBe(event.clock)
        expect(shot.result).toBe(event.type)
        expect(shot.shooter).toBe(event.type === 'goal' ? event.scorer : event.shooter)
        if (event.type === 'save') expect(shot.goalie).toBe(event.goalie)
      })

      // Shootout attempts produce no goal or save events (event.ts).
      const shotsOnGoal = events.filter(
        (e) =>
          e.type === 'shot' && e.period !== 'SO' && (e.result === 'goal' || e.result === 'save'),
      )
      const goalsAndSaves = events.filter((e) => e.type === 'goal' || e.type === 'save')
      expect(shotsOnGoal).toHaveLength(goalsAndSaves.length)
    }
  })

  it('credits assists to distinct teammates on the ice, never the scorer', async () => {
    const [home, away] = await twoClubs()
    for (const events of playMany(20, (seed) => play(home, away, seed))) {
      const onIce = new Map<string, readonly string[]>()
      for (const event of events) {
        if (event.type === 'shift_change') onIce.set(event.clubId, event.onIce)
        if (event.type !== 'goal') continue
        const goal: GoalEvent = event
        expect(goal.assists.length).toBeLessThanOrEqual(2)
        expect(new Set(goal.assists).size).toBe(goal.assists.length)
        expect(goal.assists).not.toContain(goal.scorer)
        for (const id of [goal.scorer, ...goal.assists])
          expect(onIce.get(goal.clubId)).toContain(id)
      }
    }
  })

  it('restarts play with a faceoff after every goal', async () => {
    const [home, away] = await twoClubs()
    for (const events of playMany(20, (seed) => play(home, away, seed))) {
      events.forEach((event, i) => {
        if (event.type !== 'goal') return
        const between = new Set([
          'shift_change',
          'period_start',
          'powerplay_start',
          'powerplay_end',
        ])
        const next = events.slice(i + 1).find((e) => !between.has(e.type))
        if (next && next.type !== 'period_end') expect(next.type).toBe('faceoff')
      })
    }
  })

  it('never puts a Player in two places in one shift_change', async () => {
    const [home, away] = await twoClubs()
    const events = play(home, away, 9)
    const byClock = new Map<number, string[]>()
    for (const event of events) {
      if (event.type !== 'shift_change') continue
      byClock.set(event.clock, [...(byClock.get(event.clock) ?? []), ...event.onIce])
    }
    for (const ids of byClock.values()) expect(new Set(ids).size).toBe(ids.length)
  })

  it('reports the same running score in period_end as the fold derives', async () => {
    const [home, away] = await twoClubs()
    for (const events of playMany(20, (seed) => play(home, away, seed))) {
      const result = foldMatch(fixtureBetween(home.id, away.id), events).result
      expect(events.at(-1)).toMatchObject({
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
      })
    }
  })
})

describe('fixtureSeed', () => {
  it('depends on the Fixture id, not on the order Fixtures are drawn in (D-08)', () => {
    const a = fixtureBetween('h', 'a', 'f1')
    const b = fixtureBetween('h', 'a', 'f2')
    const forward = [fixtureSeed(createRng(1), a), fixtureSeed(createRng(1), b)]
    const seasonRng = createRng(1)
    const reversed = [fixtureSeed(seasonRng, b), fixtureSeed(seasonRng, a)].reverse()
    expect(reversed).toEqual(forward)
    expect(forward[0]).not.toBe(forward[1])
  })
})

describe('attributes and tactics move the outcome (directional)', () => {
  const FIXTURES = 300

  function shotsBy(clubId: string, runs: MatchEvent[][]): ShotEvent[] {
    return runs.flat().filter((e): e is ShotEvent => e.type === 'shot' && e.clubId === clubId)
  }

  it('a better goalie stops a larger share of shots', async () => {
    const [home, away] = await twoClubs()
    const best = buildNaiveLineup(home)
    const worstGoalie = [...home.goalies].sort(
      (a, b) => a.attributes.reflexes - b.attributes.reflexes,
    )[0]!
    const worst = { ...best, starter: worstGoalie.id, backup: best.starter }

    const savePct = (lineup: Lineup) => {
      const shots = shotsBy(
        away.id,
        playMany(FIXTURES, (seed) => play(home, away, seed, lineup)),
      )
      const onGoal = shots.filter((s) => s.result === 'goal' || s.result === 'save')
      return onGoal.filter((s) => s.result === 'save').length / onGoal.length
    }

    expect(savePct(best)).toBeGreaterThan(savePct(worst))
  })

  it('shotVolume raises attempts and lowers their mean danger', async () => {
    const [home, away] = await twoClubs()
    const lineup = (shotVolume: number) => ({
      ...buildNaiveLineup(home),
      tactics: { ...DEFAULT_TACTICS, shotVolume },
    })
    const shots = (shotVolume: number) =>
      shotsBy(
        home.id,
        playMany(FIXTURES, (seed) => play(home, away, seed, lineup(shotVolume))),
      )
    const meanDanger = (list: readonly ShotEvent[]) =>
      list.reduce((sum, s) => sum + s.danger, 0) / list.length

    const low = shots(25)
    const high = shots(75)
    expect(high.length).toBeGreaterThan(low.length)
    expect(meanDanger(high)).toBeLessThan(meanDanger(low))
  })

  it('aggression raises both shots for and shots against', async () => {
    const [home, away] = await twoClubs()
    const lineup = (aggression: number) => ({
      ...buildNaiveLineup(home),
      tactics: { ...DEFAULT_TACTICS, aggression },
    })
    const runs = (aggression: number) =>
      playMany(FIXTURES, (seed) => play(home, away, seed, lineup(aggression)))

    const passive = runs(25)
    const aggressive = runs(75)
    expect(shotsBy(home.id, aggressive).length).toBeGreaterThan(shotsBy(home.id, passive).length)
    expect(shotsBy(away.id, aggressive).length).toBeGreaterThan(shotsBy(away.id, passive).length)
  })
})

describe('penalties and special teams', () => {
  const runs = async () => {
    const [home, away] = await twoClubs()
    return { home, away, matches: playMany(40, (seed) => play(home, away, seed)) }
  }

  it('keeps a penalised Player off the ice until the penalty can have ended', async () => {
    const { matches } = await runs()
    let penalties = 0
    for (const events of matches) {
      events.forEach((event, i) => {
        if (event.type !== 'penalty') return
        penalties++
        // Nothing shorter than a minor exists, and only a goal against can end one early.
        for (const later of events.slice(i + 1)) {
          if (later.clock >= event.clock + 120) break
          if (later.type === 'goal' && later.clubId !== event.clubId) break
          if (later.type === 'shift_change' && later.clubId === event.clubId) {
            expect(later.onIce).not.toContain(event.player)
          }
        }
      })
    }
    expect(penalties).toBeGreaterThan(0)
  })

  it('closes every powerplay_start with a powerplay_end (Tier 4)', async () => {
    const { matches } = await runs()
    for (const events of matches) {
      const open = new Map<string, number>()
      for (const event of events) {
        if (event.type === 'powerplay_start')
          open.set(event.clubId, (open.get(event.clubId) ?? 0) + 1)
        if (event.type === 'powerplay_end') {
          const depth = open.get(event.clubId) ?? 0
          expect(depth).toBeGreaterThan(0)
          open.set(event.clubId, depth - 1)
        }
      }
      for (const depth of open.values()) expect(depth).toBe(0)
    }
  })

  it('times the power play as exactly the time one Club had more Skaters (Tier 4, ADR-009)', async () => {
    const { home, away, matches } = await runs()
    for (const events of matches) {
      const stats = foldMatch(fixtureBetween(home.id, away.id), events)
      const changes = events.filter((e): e is ShiftChangeEvent => e.type === 'shift_change')
      const advantage = { [home.id]: 0, [away.id]: 0 }
      for (let i = 0; i < changes.length; i += 2) {
        const [a, b] = [changes[i]!, changes[i + 1]!]
        const seconds = (changes[i + 2]?.clock ?? endOfPlay(events)) - a.clock
        if (skatersAllowed(a) > skatersAllowed(b)) advantage[a.clubId]! += seconds
        if (skatersAllowed(b) > skatersAllowed(a)) advantage[b.clubId]! += seconds
      }
      expect(stats.clubs.get(home.id)!.powerPlaySeconds).toBe(advantage[home.id])
      expect(stats.clubs.get(away.id)!.powerPlaySeconds).toBe(advantage[away.id])
    }
  })

  it('counts a goal as a power-play goal only with more Skaters on the ice', async () => {
    const { matches } = await runs()
    for (const events of matches) {
      const onIce = new Map<string, number>()
      for (const event of events) {
        if (event.type === 'shift_change') onIce.set(event.clubId, skatersAllowed(event))
        if (event.type !== 'goal') continue
        const own = onIce.get(event.clubId)!
        const other = [...onIce.entries()].find(([id]) => id !== event.clubId)![1]
        expect(event.strength).toBe(
          own > other ? 'powerplay' : own < other ? 'penaltykill' : 'even',
        )
      }
    }
  })
})

describe('penalties respond to discipline and aggression (directional)', () => {
  const FIXTURES = 300

  function penaltiesBy(clubId: string, runs: MatchEvent[][]): number {
    return runs.flat().filter((e) => e.type === 'penalty' && e.clubId === clubId).length
  }

  it('a less disciplined Roster takes more penalties', async () => {
    const [home, away] = await twoClubs()
    const withDiscipline = (discipline: number): Club => ({
      ...home,
      skaters: home.skaters.map((s) => ({ ...s, attributes: { ...s.attributes, discipline } })),
    })
    const count = (discipline: number) => {
      const club = withDiscipline(discipline)
      return penaltiesBy(
        club.id,
        playMany(FIXTURES, (seed) => play(club, away, seed)),
      )
    }
    expect(count(5)).toBeGreaterThan(count(16))
  })

  it('aggression raises penalties taken (Tier 3)', async () => {
    const [home, away] = await twoClubs()
    const lineup = (aggression: number) => ({
      ...buildNaiveLineup(home),
      tactics: { ...DEFAULT_TACTICS, aggression },
    })
    const count = (aggression: number) =>
      penaltiesBy(
        home.id,
        playMany(FIXTURES, (seed) => play(home, away, seed, lineup(aggression))),
      )
    expect(count(75)).toBeGreaterThan(count(25))
  })
})
