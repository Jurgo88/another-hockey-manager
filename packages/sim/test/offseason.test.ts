import { beforeAll, describe, expect, it } from 'vitest'
import { assistantRanking, movesViolations } from '../src/draft/index.js'
import {
  advanceDay,
  draftClock,
  draftNoticesOf,
  draftUntil,
  endNoticesOf,
  endSeason,
  InvalidMovesError,
  isSeasonOver,
  makePick,
  proposedMoves,
  runDraft,
  runReSigning,
  setRosterMoves,
  startNextSeason,
  startNoticesOf,
  startSeason,
  type Offseason,
  type SeasonState,
} from '../src/season/index.js'
import { SMALL_SEASON } from './support/league.js'

/** The draft room and the notices between Seasons (ADR-028 amendment, #92). */

function played(state: SeasonState): SeasonState {
  let current = state
  while (!isSeasonOver(current)) current = advanceDay(current).state
  return current
}

let off: Offseason

beforeAll(async () => {
  off = endSeason(played(await startSeason(31, undefined, SMALL_SEASON)))
})

describe('the draft room', () => {
  it('stops when a Club is on the clock, the picks before it made for the others', () => {
    const clubId = off.order[3]!
    const room = draftUntil(off, clubId)
    expect(draftClock(room)).toMatchObject({ pick: 4, round: 1, clubId })
    expect(room.picks.map((pick) => pick.clubId)).toEqual(off.order.slice(0, 3))
    expect(room.phase).toBe('draft')
    // The drafted are held at once, and leave the class.
    for (const pick of room.picks) {
      expect(room.prospects.some((p) => p.player.id === pick.playerId)).toBe(true)
      expect(room.draftClass.some((p) => p.id === pick.playerId)).toBe(false)
    }
  })

  it('is the same draft pick by pick as at once, with the same choices', () => {
    const clubId = off.order[2]!
    let room = off
    for (;;) {
      room = draftUntil(room, clubId)
      if (!draftClock(room)) break
      room = makePick(room, clubId, assistantRanking(room.draftClass)[0]!.id)
    }
    const done = runDraft(room)
    const atOnce = runDraft(off)
    expect(done.picks).toEqual(atOnce.picks)
    expect(done.prospects).toEqual(atOnce.prospects)
    expect(startNextSeason(done)).toEqual(startNextSeason(off))
  })

  it('takes the prospect a Manager chooses, any Manager alike (D-04)', () => {
    const clubId = off.order[0]!
    const late = assistantRanking(off.draftClass).at(-1)!
    const room = makePick(draftUntil(off, clubId), clubId, late.id)
    expect(room.picks[0]).toMatchObject({ pick: 1, round: 1, clubId, playerId: late.id })
    expect(room.prospects.find((p) => p.player.id === late.id)?.player.clubId).toBe(clubId)
    // The rest of the draft goes on without him.
    expect(runDraft(room).picks.filter((p) => p.playerId === late.id)).toHaveLength(1)
  })

  it('refuses a pick out of turn, or of a prospect not in the class', () => {
    const [first, second] = off.order
    const room = draftUntil(off, first!)
    expect(() => makePick(room, second!, room.draftClass[0]!.id)).toThrow(/not Club/)
    expect(() => makePick(room, first!, 'nobody')).toThrow(/Not in the class/)
    expect(draftClock(runDraft(off))).toBeNull()
  })
})

describe('moves that break the rules, as data', () => {
  it('names the rule and the Player', () => {
    const drafted = runReSigning(runDraft(off))
    const club = drafted.clubs[0]!
    const stranger = drafted.prospects.find((p) => p.player.clubId !== club.id)!.player.id
    expect(
      movesViolations(club, drafted.prospects, { callUps: [stranger], releases: ['nobody'] }),
    ).toEqual([
      { kind: 'notProspect', playerId: stranger },
      { kind: 'notOnRoster', playerId: 'nobody' },
    ])
    const someone = club.skaters[0]!.id
    expect(
      movesViolations(club, drafted.prospects, { callUps: [], releases: [someone, someone] }),
    ).toContainEqual({
      kind: 'releasedTwice',
      playerId: someone,
    })
    try {
      setRosterMoves(drafted, club.id, { callUps: [stranger], releases: [] })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidMovesError)
      expect((error as InvalidMovesError).violations).toEqual([
        { kind: 'notProspect', playerId: stranger },
      ])
    }
  })
})

describe('notices between Seasons', () => {
  it('tell each Club who left it after the Season, and whose rights it lost', () => {
    const all = off.clubs.flatMap((club) => endNoticesOf(off, club.id))
    const left = off.departures.filter((d) => d.reason === 'retired' || d.reason === 'unsigned')
    expect(all.filter((n) => n.kind === 'retired' || n.kind === 'unsigned')).toHaveLength(
      left.length,
    )
    expect(all.filter((n) => n.kind === 'rightsExpired')).toHaveLength(off.undrafted.length)
    expect(left.length).toBeGreaterThan(0)
  })

  it('tell each Club whom it drafted', () => {
    const drafted = runReSigning(runDraft(off))
    for (const club of drafted.clubs) {
      const notices = draftNoticesOf(drafted, club.id)
      expect(notices.map((n) => n.playerId)).toEqual(
        drafted.picks.filter((p) => p.clubId === club.id).map((p) => p.playerId),
      )
    }
  })

  it('name everyone who arrives as the next Season starts, and everyone released', () => {
    const drafted = runReSigning(runDraft(off))
    const next = startNextSeason(drafted)
    let calledUp = 0
    for (const club of next.clubs) {
      const notices = startNoticesOf(drafted, next, club.id)
      // A Player who tested the market and came back did not arrive.
      const ended = drafted.ended.clubs.find((c) => c.id === club.id)!
      const before = new Set([...ended.skaters, ...ended.goalies].map((p) => p.id))
      const arrived = [...club.skaters, ...club.goalies]
        .filter((p) => !before.has(p.id))
        .map((p) => p.id)
      expect(
        notices
          .filter((n) => n.kind === 'calledUp' || n.kind === 'joined')
          .map((n) => n.playerId)
          .sort(),
      ).toEqual(arrived.sort())
      const proposal = proposedMoves(drafted, club.id)
      expect(
        notices
          .filter((n) => n.kind === 'calledUp')
          .map((n) => n.playerId)
          .sort(),
      ).toEqual([...proposal.callUps].sort())
      expect(
        notices
          .filter((n) => n.kind === 'released')
          .map((n) => n.playerId)
          .sort(),
      ).toEqual([...proposal.releases].sort())
      calledUp += proposal.callUps.length
    }
    expect(calledUp).toBeGreaterThan(0)
  })

  it('count a class drafted only as the Season starts as called up, not joined', () => {
    const next = startNextSeason(off)
    const atOnce = runDraft(off)
    for (const club of next.clubs) {
      expect(startNoticesOf(off, next, club.id)).toEqual(startNoticesOf(atOnce, next, club.id))
    }
  })
})
