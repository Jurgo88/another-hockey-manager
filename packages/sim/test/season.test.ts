import { beforeAll, describe, expect, it } from 'vitest'
import type { MatchEvent } from '../src/domain/event.js'
import { DEFAULT_TACTICS, swapSlots, validateLineup } from '../src/engine/lineup.js'
import { plainMatchStats } from '../src/stats/match.js'
import { foldSeason } from '../src/stats/season.js'
import {
  advanceDay,
  advanceToFixtureOf,
  assistantLineup,
  InvalidLineupError,
  noticesOf,
  playsNext,
  replaceInjured,
  setLineup,
  startSeason,
  type PlayedFixture,
  type SeasonState,
} from '../src/season/index.js'

const SEED = 41
const DAYS = 30

let start: SeasonState

beforeAll(async () => {
  start = await startSeason(SEED)
})

const firstClubId = () => start.clubs[0]!.id

/** The event streams of the first `days` days, with `between` applied after each. */
function play(days: number, between: (state: SeasonState) => SeasonState): MatchEvent[][] {
  const streams: MatchEvent[][] = []
  let state = start
  for (let i = 0; i < days; i++) {
    const day = advanceDay(state)
    streams.push(...day.played.map((played) => [...played.events]))
    state = between(day.state)
  }
  return streams
}

describe('startSeason', () => {
  it('opens with a valid Lineup for every Club and no Fixture played', () => {
    expect(start.nextFixture).toBe(0)
    expect(start.fixtures).toHaveLength(1344)
    for (const club of start.clubs) {
      expect(validateLineup(start.lineups[club.id]!, club)).toEqual([])
    }
  })

  it('gives the same Season for the same seed', async () => {
    expect(await startSeason(SEED)).toEqual(start)
  })
})

describe('advanceDay', () => {
  it('plays exactly the Fixtures of the next day that has any', () => {
    const firstDay = start.fixtures[0]!.day
    const { state, day, played } = advanceDay(start)

    expect(day).toBe(firstDay)
    expect(played.length).toBeGreaterThan(0)
    expect(played.every((p) => p.fixture.day === firstDay)).toBe(true)
    expect(state.nextFixture).toBe(played.length)
    expect(state.fixtures[state.nextFixture]!.day).toBeGreaterThan(firstDay)
  })

  it('leaves the state it was given as it was', () => {
    const before = structuredClone(start)
    advanceDay(start)
    expect(start).toEqual(before)
  })

  it('carries fatigue into the next Fixture of a Club', () => {
    let state = start
    const clubId = firstClubId()
    const seen: PlayedFixture[] = []
    while (seen.length < 2) {
      const day = advanceDay(state)
      state = day.state
      seen.push(...day.played.filter((p) => p.input.homeClub.id === clubId))
      seen.push(...day.played.filter((p) => p.input.awayClub.id === clubId))
    }
    const club = (i: number) => {
      const { input } = seen[i]!
      return input.homeClub.id === clubId ? input.homeClub : input.awayClub
    }
    expect(club(0).skaters.every((s) => s.fatigue === 0)).toBe(true)
    expect(club(1).skaters.some((s) => s.fatigue > 0)).toBe(true)
  })

  it('refuses to play past the last Fixture', () => {
    const over = { ...start, fixtures: [] }
    expect(() => advanceDay(over)).toThrow(/no Fixtures left/)
  })
})

describe('advanceToFixtureOf', () => {
  it('stops before the next Fixture of a Club, having played only other days', () => {
    const clubId = start.fixtures.at(-1)!.homeClubId
    const days = advanceToFixtureOf(start, clubId)
    const state = days.at(-1)?.state ?? start

    expect(playsNext(state, clubId)).toBe(true)
    for (const { played } of days) {
      for (const { fixture } of played) {
        expect([fixture.homeClubId, fixture.awayClubId]).not.toContain(clubId)
      }
    }
  })

  it('plays nothing when the Club is already next', () => {
    const { homeClubId } = start.fixtures[0]!
    expect(advanceToFixtureOf(start, homeClubId)).toEqual([])
  })
})

describe('totals', () => {
  it('sum the same as folding the Matches', () => {
    const days = [advanceDay(start)]
    for (let i = 0; i < 4; i++) days.push(advanceDay(days.at(-1)!.state))
    const matches = days.flatMap((day) => day.played.map((p) => p.match))
    const { regular } = days.at(-1)!.state.totals

    expect(regular.matches).toBe(matches.length)
    expect(new Map(Object.entries(regular.skaters))).toEqual(foldSeason(matches).skaters)
    expect(new Map(Object.entries(regular.goalies))).toEqual(foldSeason(matches).goalies)
  })

  it('survive JSON, and a box score is plain JSON too', () => {
    const { state, played } = advanceDay(start)
    expect(JSON.parse(JSON.stringify(state.totals))).toEqual(state.totals)
    const plain = plainMatchStats(played[0]!.match)
    expect(JSON.parse(JSON.stringify(plain))).toEqual(plain)
    expect(plain).not.toHaveProperty('fatigue')
  })
})

describe('saved state (ADR-014)', () => {
  it('gives the same Fixtures when stored as JSON between every two days', () => {
    const saved = play(DAYS, (state) => JSON.parse(JSON.stringify(state)) as SeasonState)
    expect(saved).toEqual(play(DAYS, (state) => state))
  })
})

describe('assistantLineup', () => {
  const clubId = () => start.clubs[0]!.id
  const club = () => start.clubs[0]!

  it('picks a valid Lineup and keeps the Tactics', () => {
    const tactics = { ...DEFAULT_TACTICS, aggression: 77 }
    const lineup = assistantLineup(start, clubId(), tactics)
    expect(validateLineup(lineup, club())).toEqual([])
    expect(lineup.tactics).toEqual(tactics)
  })

  it('undoes a poor Lineup', () => {
    const lineup = start.lineups[clubId()]!
    const poor = swapSlots(
      lineup,
      { group: 'line', index: 0, key: 'leftWing' },
      { group: 'line', index: 3, key: 'leftWing' },
    )
    const state = setLineup(start, clubId(), poor)
    expect(assistantLineup(state, clubId(), poor.tactics).lines).toEqual(lineup.lines)
  })

  it('leaves out everyone who is hurt', () => {
    const lineup = start.lineups[clubId()]!
    const out = [lineup.lines[0].leftWing, lineup.pairings[0].leftDefence, lineup.starter]
    const state = { ...start, absent: Object.fromEntries(out.map((id) => [id, 4])) }
    const picked = JSON.stringify(assistantLineup(state, clubId(), lineup.tactics))
    for (const id of out) expect(picked).not.toContain(id)
  })

  it('still gives a Lineup that can be saved when a position runs out', () => {
    const centres = club().skaters.filter((s) => s.preferredPositions[0] === 'C')
    const state = { ...start, absent: Object.fromEntries(centres.map((s) => [s.id, 5])) }
    const picked = assistantLineup(state, clubId(), DEFAULT_TACTICS)
    expect(() => setLineup(state, clubId(), picked)).not.toThrow()
  })
})

describe('noticesOf', () => {
  /** Plays on until a day on which `clubId` has news of this kind. */
  function firstNotice(kind: 'injury' | 'recovered', days = 80) {
    let state = start
    for (let i = 0; i < days; i++) {
      const day = advanceDay(state)
      for (const club of start.clubs) {
        const found = noticesOf(state, day, club.id).filter((notice) => notice.kind === kind)
        if (found.length > 0) return { before: state, day, club, found }
      }
      state = day.state
    }
    throw new Error(`no ${kind} notice`)
  }

  it('tells a Club who was hurt, and for how long', () => {
    const { day, club, found } = firstNotice('injury')
    const injuries = day.played.flatMap((p) => p.match.injuries)
    for (const notice of found) {
      expect(notice).toMatchObject({ kind: 'injury', day: day.day })
      expect(injuries).toContainEqual(
        expect.objectContaining({ playerId: notice.playerId, clubId: club.id }),
      )
    }
  })

  it('tells a Club who is back, once they no longer count as out', () => {
    const { before, day, found } = firstNotice('recovered')
    for (const notice of found) {
      expect(before.absent[notice.playerId]).toBeDefined()
      expect(day.state.absent[notice.playerId]).toBeUndefined()
    }
  })

  it('says nothing to a Club about the Players of another', () => {
    const { before, day, club } = firstNotice('injury')
    const others = start.clubs.find((candidate) => candidate.id !== club.id)!
    const ids = new Set(club.skaters.map((s) => s.id))
    for (const notice of noticesOf(before, day, others.id)) {
      expect(ids.has(notice.playerId)).toBe(false)
    }
  })
})

describe('injured Players in a Lineup', () => {
  const clubId = () => start.clubs[0]!.id
  const lineup = () => start.lineups[clubId()]!

  it('replaces them, and leaves everyone else where they were', () => {
    const out = lineup().lines[0].leftWing
    const state = { ...start, absent: { [out]: 3 } }
    const healthy = replaceInjured(state, clubId(), lineup())

    expect(JSON.stringify(healthy)).not.toContain(out)
    expect(healthy.lines[0].centre).toBe(lineup().lines[0].centre)
    expect(setLineup(state, clubId(), healthy).lineups[clubId()]).toEqual(healthy)
  })

  it('leaves a Lineup with nobody out as it was', () => {
    expect(replaceInjured(start, clubId(), lineup())).toEqual(lineup())
  })

  it('accepts a Skater out of position when no natural replacement is left', () => {
    const club = start.clubs[0]!
    const centres = club.skaters.filter((skater) => skater.preferredPositions.includes('C'))
    const state = { ...start, absent: Object.fromEntries(centres.map((s) => [s.id, 5])) }
    const healthy = replaceInjured(state, clubId(), lineup())

    expect(validateLineup(healthy, club).map((v) => v.rule)).toContain('illegal-position')
    expect(() => setLineup(state, clubId(), healthy)).not.toThrow()
  })

  it('still refuses a Skater out of position with a healthy Roster', () => {
    const moved = swapSlots(
      lineup(),
      { group: 'line', index: 0, key: 'leftWing' },
      { group: 'pairing', index: 0, key: 'leftDefence' },
    )
    expect(() => setLineup(start, clubId(), moved)).toThrow(InvalidLineupError)
  })
})

describe('setLineup', () => {
  it('changes the Fixtures to come for any Club, and not the state it was given', () => {
    const clubId = firstClubId()
    const lineup = {
      ...start.lineups[clubId]!,
      tactics: { ...DEFAULT_TACTICS, aggression: 90 },
    }
    const changed = setLineup(start, clubId, lineup)

    expect(start.lineups[clubId]!.tactics.aggression).not.toBe(90)
    let state = changed
    for (;;) {
      const day = advanceDay(state)
      state = day.state
      const ours = day.played.find(
        (p) => p.fixture.homeClubId === clubId || p.fixture.awayClubId === clubId,
      )
      if (!ours) continue
      const { homeLineup, awayLineup } = ours.input
      const used = ours.fixture.homeClubId === clubId ? homeLineup : awayLineup
      expect(used.tactics.aggression).toBe(90)
      return
    }
  })

  it('rejects a Lineup that breaks the rules, naming them', () => {
    const clubId = firstClubId()
    const lineup = { ...start.lineups[clubId]!, starter: 'nobody' }
    expect(() => setLineup(start, clubId, lineup)).toThrow(InvalidLineupError)
    try {
      setLineup(start, clubId, lineup)
    } catch (error) {
      expect((error as InvalidLineupError).violations.length).toBeGreaterThan(0)
    }
  })

  it('rejects a Club outside the Season', () => {
    expect(() => setLineup(start, 'nobody', start.lineups[firstClubId()]!)).toThrow(/No Club/)
  })
})
