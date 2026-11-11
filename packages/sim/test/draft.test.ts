import { beforeAll, describe, expect, it } from 'vitest'
import { NHL_DRAFT_FORMAT } from '../src/data/nhl-2026-27.js'
import type { Club } from '../src/domain/club.js'
import type { Prospect } from '../src/domain/draft.js'
import {
  isGoalie,
  playerLevel,
  positionGroup,
  type Player,
  type Skater,
} from '../src/domain/player.js'
import { sortStandings } from '../src/domain/standings.js'
import {
  aboveFill,
  applyMoves,
  assistantMoves,
  assistantRanking,
  drawLottery,
  generateClass,
  isReady,
  makePicks,
  movesViolations,
  naturalOf,
} from '../src/draft/index.js'
import { createRng } from '../src/rng/index.js'
import {
  advanceDay,
  endSeason,
  InvalidMovesError,
  isSeasonOver,
  nextSeason,
  proposedMoves,
  runDraft,
  setDraftList,
  setRosterMoves,
  startNextSeason,
  startSeason,
  type Offseason,
  type SeasonState,
} from '../src/season/index.js'
import { draftOutcomes, type SeasonRecord } from '../src/stats/history.js'

/** The entry draft and the phase between Seasons (ADR-024, ADR-028, #89). */

const SEED = 5

function playToChampion(state: SeasonState): SeasonState {
  let current = state
  while (!isSeasonOver(current)) current = advanceDay(current).state
  return current
}

/** Through stored JSON, as the application keeps state between requests (ADR-014). */
const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const everyone = (club: Club): Player[] => [...club.skaters, ...club.goalies]

/** A Player with every attribute at one value, so his level is that value. */
function withLevel<P extends Player>(player: P, level: number): P {
  const attributes = Object.fromEntries(Object.keys(player.attributes).map((k) => [k, level]))
  return { ...player, attributes: attributes as unknown as P['attributes'] }
}

describe('the lottery', () => {
  const clubs = Array.from({ length: 16 }, (_, i) => `c${i}`)
  const lottery = NHL_DRAFT_FORMAT.lottery

  it('moves at most two winners, up by at most 10 places, the rest keeping their order', () => {
    /** The Clubs whose removal leaves the order as it was, at most `draws` of them. */
    const winnersOf = (order: readonly string[]): string[] | null => {
      const same = (without: readonly string[]) => {
        const keep = (club: string) => !without.includes(club)
        return JSON.stringify(order.filter(keep)) === JSON.stringify(clubs.filter(keep))
      }
      if (same([])) return []
      for (const a of clubs) if (same([a])) return [a]
      for (const a of clubs) for (const b of clubs) if (a < b && same([a, b])) return [a, b]
      return null
    }
    for (let seed = 0; seed < 300; seed++) {
      const order = drawLottery(clubs, lottery, createRng(seed))
      expect([...order].sort()).toEqual([...clubs].sort())
      const winners = winnersOf(order)
      expect(winners).not.toBeNull()
      for (const club of order) {
        const up = clubs.indexOf(club) - order.indexOf(club)
        expect(up).toBeLessThanOrEqual(lottery.maxJump)
        expect(-up).toBeLessThanOrEqual(lottery.draws)
      }
    }
  })

  it('gives the worst Club the first pick about as often as its odds and the cap allow', () => {
    let worstFirst = 0
    const draws = 4000
    for (let seed = 0; seed < draws; seed++) {
      if (drawLottery(clubs, lottery, createRng(seed))[0] === 'c0') worstFirst++
    }
    // 18.5% by winning, plus the draws won by Clubs that cannot move up to first: 25.5%.
    expect(worstFirst / draws).toBeGreaterThan(0.22)
    expect(worstFirst / draws).toBeLessThan(0.29)
  })
})

describe('a class', () => {
  const size = 192
  const draftClass = generateClass(createRng(1).fork('class:y2'), 2, size)

  it('has the size asked for, the shares by position and age, and ids of its year', () => {
    expect(draftClass).toHaveLength(size)
    const goalies = draftClass.filter(isGoalie).length
    const defence = draftClass.filter((p) => positionGroup(p) === 'defence').length
    expect(goalies).toBe(Math.round(size * 0.1))
    expect(defence).toBe(Math.round(size * 0.32))
    expect(draftClass.every((p) => p.age === 18 || p.age === 19)).toBe(true)
    const nineteen = draftClass.filter((p) => p.age === 19).length / size
    expect(nineteen).toBeGreaterThan(0.1)
    expect(nineteen).toBeLessThan(0.3)
    expect(new Set(draftClass.map((p) => p.id)).size).toBe(size)
    expect(draftClass.every((p) => p.id.startsWith('draft-y2-') && p.clubId === '')).toBe(true)
  })

  it('is seen as ranges: generated values at confidence 0.25 (D-11)', () => {
    for (const player of draftClass) {
      for (const entry of Object.values(player.provenance!)) {
        expect(entry.source).toBe('generated')
        expect(entry.confidence).toBe(0.25)
      }
    }
  })

  it('runs from prospects about ready to join to ones far below, Skaters and Goalies alike', () => {
    for (const group of ['forward', 'defence', 'goalie'] as const) {
      const above = draftClass
        .filter((p) => positionGroup(p) === group)
        .map((p) => aboveFill(playerLevel(p), group))
      expect(Math.max(...above)).toBeGreaterThan(0)
      expect(Math.min(...above)).toBeLessThan(-1)
    }
  })

  it('is the same class from the same stream', () => {
    expect(generateClass(createRng(1).fork('class:y2'), 2, size)).toEqual(draftClass)
  })
})

describe('the picks', () => {
  const draftClass = generateClass(createRng(2), 3, 30)
  const order = ['a', 'b', 'c', 'd', 'e']
  const format = { ...NHL_DRAFT_FORMAT, rounds: 4 }

  it('go round by round in the order of the first, to the assistant where nothing was declared', () => {
    const { picks, prospects } = makePicks(format, 3, order, draftClass, {})
    expect(picks).toHaveLength(20)
    expect(picks.map((p) => p.clubId)).toEqual([...order, ...order, ...order, ...order])
    expect(picks.map((p) => p.pick)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(picks.map((p) => p.round)).toEqual([1, 2, 3, 4].flatMap((r) => [r, r, r, r, r]))
    expect(picks.map((p) => p.playerId)).toEqual(
      assistantRanking(draftClass)
        .slice(0, 20)
        .map((p) => p.id),
    )
    for (const prospect of prospects) {
      const pick = picks.find((p) => p.playerId === prospect.player.id)!
      expect(prospect.player.clubId).toBe(pick.clubId)
      expect(prospect).toMatchObject({ year: 3, round: pick.round, pick: pick.pick })
    }
  })

  it('take the first prospect on a Club’s list still available, as for every Manager (D-04)', () => {
    const ranked = assistantRanking(draftClass)
    const wanted = ranked[0]!.id
    const later = ranked[25]!.id
    const { picks } = makePicks(format, 3, order, draftClass, {
      a: [ranked[5]!.id, later],
      b: [ranked[5]!.id, wanted],
    })
    expect(picks[0]).toMatchObject({ clubId: 'a', playerId: ranked[5]!.id })
    expect(picks[1]).toMatchObject({ clubId: 'b', playerId: wanted })
    expect(picks[5]).toMatchObject({ clubId: 'a', playerId: later })
  })

  it('rank prospects of every group by how far their potential sits above a fill', () => {
    const ranked = assistantRanking(draftClass)
    const tops = ranked.map((p) => aboveFill(p.potential, positionGroup(p)))
    expect(tops).toEqual([...tops].sort((a, b) => b - a))
  })
})

describe('the phase between Seasons', () => {
  let ended: SeasonState
  let off: Offseason
  let drafted: Offseason

  beforeAll(async () => {
    ended = playToChampion(await startSeason(SEED))
    off = endSeason(ended)
    drafted = runDraft(off)
  })

  it('refuses a Season without a champion', async () => {
    const unplayed = await startSeason(SEED)
    expect(() => endSeason(unplayed)).toThrow(/no champion/)
  })

  it('opens with the draft: an order of every Club and a class of 1.5 prospects a pick', () => {
    expect(off.phase).toBe('draft')
    expect(off.year).toBe(2)
    expect([...off.order].sort()).toEqual(ended.clubs.map((c) => c.id).sort())
    expect(off.draftClass).toHaveLength(Math.round(32 * 4 * 1.5))
    expect(off.picks).toEqual([])
  })

  it('puts the playoff Clubs after those who missed, and the champion last', () => {
    const qualified = new Set(ended.playoffs!.bracket.seeds.map((s) => s.clubId))
    const missed = off.order.slice(0, 32 - qualified.size)
    expect(missed.every((club) => !qualified.has(club))).toBe(true)
    expect(off.order[off.order.length - 1]).toBe(ended.playoffs!.champion)
    // After the lottery, the Clubs that missed keep their order but for two winners.
    const worstFirst = sortStandings(ended.standings)
      .reverse()
      .map((row) => row.clubId)
      .filter((club) => !qualified.has(club))
    const winners = missed.filter((club, place) => worstFirst.indexOf(club) > place)
    expect(winners.length).toBeLessThanOrEqual(2)
  })

  it('develops prospects and Players, removes those who left, and makes everyone a year older', () => {
    const before = new Map(ended.clubs.flatMap(everyone).map((p) => [p.id, p]))
    const gone = new Set(off.departures.map((d) => d.playerId))
    for (const club of off.clubs) {
      for (const player of everyone(club)) {
        expect(gone.has(player.id)).toBe(false)
        expect(player.age).toBe(before.get(player.id)!.age + 1)
      }
    }
    expect(off.clubs.flatMap(everyone).length + gone.size).toBe(before.size)
  })

  it('takes a declared list, from the class only, and only while the draft is open', () => {
    const club = off.order[0]!
    const pick = off.draftClass[100]!.id
    const listed = setDraftList(off, club, [pick])
    expect(runDraft(listed).picks[0]).toMatchObject({ clubId: club, playerId: pick, round: 1 })
    expect(() => setDraftList(off, club, ['nobody'])).toThrow(/Not in the class/)
    expect(() => setDraftList(drafted, club, [pick])).toThrow(/has been made/)
  })

  it('gives each Club 4 prospects, one a round, held off its Roster', () => {
    expect(drafted.phase).toBe('roster')
    expect(drafted.picks).toHaveLength(128)
    for (const club of drafted.clubs) {
      const held = drafted.prospects.filter((p) => p.player.clubId === club.id)
      expect(held.map((p) => p.round).sort()).toEqual([1, 2, 3, 4])
      const ids = new Set(everyone(club).map((p) => p.id))
      expect(held.some((p) => ids.has(p.player.id))).toBe(false)
    }
  })

  it('fills gaps at the leavers’ positions, and releases the weakest at a position for a better prospect', () => {
    const before = new Map(ended.clubs.flatMap(everyone).map((p) => [p.id, p]))
    let callUps = 0
    let releases = 0
    for (const club of drafted.clubs) {
      const moves = proposedMoves(drafted, club.id)
      expect(movesViolations(club, drafted.prospects, moves)).toEqual([])
      const { joined, released } = applyMoves(club, drafted.prospects, moves)
      callUps += joined.length
      releases += released.length
      // Every release makes room for a prospect at least as good, at the same natural position.
      const unmatched = [...joined]
      for (const player of released) {
        const at = unmatched.findIndex(
          (p) => naturalOf(p) === naturalOf(player) && playerLevel(p) >= playerLevel(player),
        )
        expect(at).toBeGreaterThanOrEqual(0)
        unmatched.splice(at, 1)
      }
      // The rest fill gaps, each at the natural position of someone who left.
      const gaps = off.departures
        .filter((d) => d.clubId === club.id)
        .map((d) => naturalOf(before.get(d.playerId)!))
      for (const player of unmatched) {
        const at = gaps.indexOf(naturalOf(player))
        expect(at).toBeGreaterThanOrEqual(0)
        gaps.splice(at, 1)
      }
    }
    expect(callUps).toBeGreaterThan(5)
    expect(releases).toBeGreaterThan(0)
  })

  it('never proposes a prospect below the weakest at his position', () => {
    for (const club of drafted.clubs) {
      const { callUps, releases } = proposedMoves(drafted, club.id)
      if (releases.length > 0 || callUps.length > 0) continue
      for (const prospect of drafted.prospects.filter((p) => p.player.clubId === club.id)) {
        const gapAtHisPosition = off.departures.some(
          (d) => d.clubId === club.id && naturalOf(ended.clubs.flatMap(everyone).find((p) => p.id === d.playerId)!) === naturalOf(prospect.player),
        )
        if (!gapAtHisPosition) expect(isReady(club, prospect.player)).toBe(false)
      }
    }
  })

  it('refuses moves that break the shape or name a stranger, before the draft too', () => {
    const club = drafted.clubs[0]!
    const theirs = drafted.prospects.filter((p) => p.player.clubId === club.id).map((p) => p.player)
    const others = drafted.prospects.find((p) => p.player.clubId !== club.id)!.player
    const full = theirs.filter((p) => positionGroup(p) === 'forward')
    const gapsAtForward = 16 - club.skaters.filter((p) => positionGroup(p) === 'forward').length
    expect(() => setRosterMoves(off, club.id, { callUps: [], releases: [] })).toThrow(/not been made/)
    expect(() =>
      setRosterMoves(drafted, club.id, { callUps: [others.id], releases: [] }),
    ).toThrow(InvalidMovesError)
    expect(() =>
      setRosterMoves(drafted, club.id, { callUps: [], releases: ['nobody'] }),
    ).toThrow(InvalidMovesError)
    if (full.length > gapsAtForward) {
      expect(() =>
        setRosterMoves(drafted, club.id, { callUps: full.map((p) => p.id), releases: [] }),
      ).toThrow(/above the shape/)
    }
  })

  it('makes a Manager’s own moves: an early call-up, and a release of his choosing (D-04)', () => {
    const club = drafted.clubs[0]!
    const prospect = drafted.prospects.find(
      (p) => p.player.clubId === club.id && !isGoalie(p.player),
    )!.player as Skater
    const sameNatural = club.skaters
      .filter((s) => naturalOf(s) === naturalOf(prospect))
      .sort((a, b) => playerLevel(b) - playerLevel(a))[0]!
    const moves = { callUps: [prospect.id], releases: [sameNatural.id] }
    const next = startNextSeason(setRosterMoves(drafted, club.id, moves))
    const roster = next.clubs.find((c) => c.id === club.id)!
    const ids = new Set(everyone(roster).map((p) => p.id))
    expect(ids.has(prospect.id)).toBe(true)
    expect(ids.has(sameNatural.id)).toBe(false)
    expect(next.departures).toContainEqual({
      playerId: sameNatural.id,
      clubId: club.id,
      age: sameNatural.age - 1,
      reason: 'released',
    })
    expect(next.prospects.some((p) => p.player.id === prospect.id)).toBe(false)
  })

  it('keeps every Club at 16-10-3, able to dress, its prospects off the Lineup', () => {
    const next = startNextSeason(drafted)
    const held = new Set(next.prospects.map((p) => p.player.id))
    for (const club of next.clubs) {
      const forwards = club.skaters.filter((s) => positionGroup(s) === 'forward').length
      expect([forwards, club.skaters.length - forwards, club.goalies.length]).toEqual([16, 10, 3])
      expect(everyone(club).some((p) => held.has(p.id))).toBe(false)
      const lineup = next.lineups[club.id]!
      const dressed = [
        ...lineup.lines.flatMap((l) => [l.leftWing, l.centre, l.rightWing]),
        ...lineup.pairings.flatMap((p) => [p.leftDefence, p.rightDefence]),
      ]
      expect(dressed.some((id) => held.has(id))).toBe(false)
    }
    expect(next.draft).toEqual(drafted.picks)
  })

  it('is what nextSeason does with nothing declared', () => {
    expect(startNextSeason(drafted)).toEqual(nextSeason(ended))
    expect(startNextSeason(off)).toEqual(nextSeason(ended))
  })

  it('ends rights after 4 Seasons: a good Player fills a gap, one too weak leaves', () => {
    const [weak, good] = generateClass(createRng(9), ended.year - 3, 40).filter(
      (p) => naturalOf(p) === 'C',
    ) as [Player, Player]
    const holder = ended.clubs[0]!.id
    const expiring = (player: Player, pick: number): Prospect => ({
      player: { ...player, clubId: holder },
      year: ended.year - 3,
      round: 4,
      pick,
    })
    const withRights: SeasonState = {
      ...ended,
      prospects: [expiring(withLevel(weak, 1), 1), expiring(withLevel(good, 20), 2)],
    }
    const between = endSeason(withRights)
    expect(between.prospects).toEqual([])
    expect(between.undrafted.map((p) => p.id).sort()).toEqual([weak.id, good.id].sort())
    const next = startNextSeason(between)
    const onRoster = new Map(next.clubs.flatMap((c) => everyone(c).map((p) => [p.id, c.id])))
    expect(onRoster.has(good.id)).toBe(true)
    expect(onRoster.has(weak.id)).toBe(false)
    expect(next.departures).toContainEqual(
      expect.objectContaining({ playerId: weak.id, clubId: holder, reason: 'rights-expired' }),
    )
  })

  it('changes nothing when stored and reloaded at any step (ADR-014)', () => {
    expect(startNextSeason(stored(runDraft(stored(endSeason(stored(ended))))))).toEqual(
      nextSeason(ended),
    )
  })
})

describe('the assistant’s moves', () => {
  it('fill a gap only with a ready prospect, and swap only for a better one', () => {
    const [a, b, c] = generateClass(createRng(4), 2, 40).filter(
      (p): p is Skater => !isGoalie(p) && naturalOf(p) === 'C',
    ) as [Skater, Skater, Skater]
    const at = (player: Skater, level: number): Skater => ({ ...withLevel(player, level), clubId: 'x' })
    const club: Club = { id: 'x', code: 'X', name: 'X', skaters: [at(a, 8)], goalies: [] }
    const prospect = (player: Skater): Prospect => ({ player, year: 2, round: 1, pick: 1 })
    expect(assistantMoves(club, [prospect(at(b, 6))], ['C'])).toEqual({ callUps: [], releases: [] })
    expect(assistantMoves(club, [prospect(at(b, 9))], ['C'])).toEqual({ callUps: [b.id], releases: [] })
    expect(assistantMoves(club, [prospect(at(b, 9))], [])).toEqual({
      callUps: [b.id],
      releases: [a.id],
    })
    expect(assistantMoves(club, [prospect(at(c, 7))], [])).toEqual({ callUps: [], releases: [] })
  })
})

describe('the draft table', () => {
  it('reads each round’s picks, debuts and regulars from the records', () => {
    const record = (year: number, games: Record<string, number>): SeasonRecord => ({
      seasonId: `s-${year}`,
      year,
      champion: 'a',
      standings: [],
      playoffs: { bracket: { formatId: 'x', seeds: [], rounds: [] }, wins: {}, champion: 'a' },
      totals: {
        regular: {
          matches: 0,
          skaters: Object.fromEntries(
            Object.entries(games).map(([id, gamesPlayed]) => [id, { gamesPlayed } as never]),
          ),
          goalies: {},
        },
        playoffs: { matches: 0, skaters: {}, goalies: {} },
      },
      departures: [],
      roster: [],
      draft:
        year === 2
          ? [
              { year: 2, round: 1, pick: 1, clubId: 'a', playerId: 'p1' },
              { year: 2, round: 1, pick: 2, clubId: 'b', playerId: 'p2' },
              { year: 2, round: 2, pick: 3, clubId: 'a', playerId: 'p3' },
            ]
          : [],
    })
    const records = [
      record(2, { p1: 84 }),
      record(3, { p1: 84, p2: 10 }),
      record(4, { p1: 84, p2: 84 }),
    ]
    expect(draftOutcomes(records, [2])).toEqual([
      { round: 1, picks: 2, reached: 1, regulars: 0.5, seasonsToDebut: 0.5 },
      { round: 2, picks: 1, reached: 0, regulars: 0, seasonsToDebut: 0 },
    ])
  })
})
