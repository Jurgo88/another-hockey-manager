import { beforeAll, describe, expect, it } from 'vitest'
import { pickKey, type Trade } from '../src/domain/trade.js'
import { contractedOf } from '../src/farm/index.js'
import { deadCharge } from '../src/generate/contracts.js'
import {
  advanceDay,
  countedPayroll,
  deadlineOf,
  draftClock,
  endSeason,
  isRegularSeasonOver,
  isSeasonOver,
  proposeOffseasonTrade,
  proposeTrade,
  retainable,
  runDraft,
  setManagesTrades,
  startSeason,
  tradeMarketOf,
  tradeNotices,
  tradeViolations,
  type SeasonState,
} from '../src/season/index.js'
import { playoffChance } from '../src/trade/index.js'
import { SMALL_SEASON } from './support/league.js'

/** Trades (ADR-033, #138). */

/** The small league's Season is shorter than the NHL's 40 days from its deadline to its end. */
const FORMAT = {
  ...SMALL_SEASON,
  farm: { ...SMALL_SEASON.farm, deadline: { ...SMALL_SEASON.farm.deadline, daysBeforeEnd: 10 } },
}

const side = (clubId: string, more: Partial<Trade['sides'][0]> = {}) => ({
  clubId,
  players: [],
  prospects: [],
  picks: [],
  ...more,
})

describe('the chance of the playoffs', () => {
  it('is even on the line, and sharper as Fixtures run out', () => {
    expect(playoffChance(0, 40)).toBeCloseTo(0.5)
    expect(playoffChance(5, 40)).toBeGreaterThan(0.5)
    expect(playoffChance(5, 4)).toBeGreaterThan(playoffChance(5, 40))
    expect(playoffChance(-5, 4)).toBeLessThan(playoffChance(-5, 40))
    expect(playoffChance(-1, 0)).toBe(0)
  })
})

describe('a trade during a Season', () => {
  let start: SeasonState
  let mid: SeasonState
  beforeAll(async () => {
    start = await startSeason(7, undefined, FORMAT)
    mid = start
    // Into the Season, a few days before the deadline.
    while (mid.fixtures[mid.nextFixture]!.day < deadlineOf(mid) - 6) mid = advanceDay(mid).state
  })

  const clubs = () => [mid.clubs[0]!, mid.clubs[1]!] as const
  const someone = (index: number) => {
    const club = clubs()[index]!
    // The cheapest Skater of its active Roster: a trade of him fits under any cap.
    return [...club.skaters]
      .filter((p) => p.contract && p.contract.years >= 1)
      .sort((p, q) => p.contract!.capHit - q.contract!.capHit)[0]!
  }

  it('is refused for what a Club does not hold, and for picks it does not own', () => {
    const [x, y] = clubs()
    const theirs = someone(1)
    expect(
      tradeViolations(mid, { sides: [side(x.id, { players: [theirs.id] }), side(y.id)] }),
    ).toContainEqual({ kind: 'notHeld', clubId: x.id, id: theirs.id })
    const pick = { year: mid.year + 1, round: 1, clubId: y.id }
    expect(
      tradeViolations(mid, { sides: [side(x.id, { picks: [pick] }), side(y.id)] }),
    ).toContainEqual({
      kind: 'pickNotOwned',
      clubId: x.id,
      pick,
    })
    const far = { year: mid.year + 4, round: 1, clubId: x.id }
    expect(
      tradeViolations(mid, { sides: [side(x.id, { picks: [far] }), side(y.id)] }),
    ).toContainEqual({
      kind: 'pickOutOfRange',
      pick: far,
    })
  })

  it('keeps at most half a cap hit, and never takes it below the minimum', () => {
    const [x, y] = clubs()
    const dearest = [...x.skaters].sort((p, q) => q.contract!.capHit - p.contract!.capHit)[0]!
    const over: Trade = {
      sides: [side(x.id, { players: [dearest.id], retained: { [dearest.id]: 0.6 } }), side(y.id)],
    }
    expect(tradeViolations(mid, over)).toContainEqual({
      kind: 'retainedTooMuch',
      playerId: dearest.id,
      share: 0.6,
      max: 0.5,
    })
    expect(retainable(mid.capRules, dearest)).toBe(0.5)
    // The cheapest is paid the minimum: nothing of it can be kept.
    expect(retainable(mid.capRules, someone(0))).toBeCloseTo(0)
  })

  it('is closed from the deadline', () => {
    const [x, y] = clubs()
    const trade: Trade = { sides: [side(x.id, { players: [someone(0).id] }), side(y.id)] }
    expect(tradeViolations(mid, trade, deadlineOf(mid))).toEqual([{ kind: 'closed' }])
  })

  it('moves a Player with his contract, less what is kept, which his old Club pays as dead money', () => {
    // To the Club with the most room under the cap.
    const x = mid.clubs[0]!
    const y = [...mid.clubs.slice(1)].sort(
      (p, q) => countedPayroll(mid, p) - countedPayroll(mid, q),
    )[0]!
    // The cheapest paid at least twice the minimum, so that half can be kept.
    const player = [...x.skaters]
      .filter((p) => p.contract!.capHit >= 2 * mid.capRules.minimum)
      .sort((p, q) => p.contract!.capHit - q.contract!.capHit)[0]!
    const pick = { year: mid.year + 1, round: 1, clubId: y.id }
    const trade: Trade = {
      sides: [
        side(x.id, { players: [player.id], retained: { [player.id]: 0.5 } }),
        side(y.id, { picks: [pick] }),
      ],
    }
    expect(tradeViolations(mid, trade)).toEqual([])
    // Declared by both: a Manager answering for his Club.
    const managed = setManagesTrades(mid, y.id, true)
    const { state, made } = proposeTrade(managed, trade, true)
    expect(made).toBe(true)
    const moved = contractedOf(state.clubs.find((c) => c.id === y.id)!).find(
      (p) => p.id === player.id,
    )!
    expect(moved.clubId).toBe(y.id)
    expect(moved.contract!.capHit).toBeCloseTo(player.contract!.capHit / 2)
    expect(moved.contract!.retained).toBe(true)
    expect(deadCharge(state.deadMoney[x.id])).toBeCloseTo(
      deadCharge(mid.deadMoney[x.id]) + player.contract!.capHit / 2,
    )
    expect(state.pickOwners[pickKey(pick)]).toBe(x.id)
    expect(state.transfers.at(-1)).toMatchObject({
      playerId: player.id,
      fromClubId: x.id,
      toClubId: y.id,
      kind: 'trade',
    })
    // A contract retained once is not retained again.
    const again: Trade = {
      sides: [side(y.id, { players: [player.id], retained: { [player.id]: 0.5 } }), side(x.id)],
    }
    expect(tradeViolations(state, again)).toContainEqual({
      kind: 'retainedTwice',
      playerId: player.id,
    })
  })

  it("is answered by the other Club's assistant, or by its Manager when he trades himself", () => {
    const [x, y] = clubs()
    // Nothing for a Player: no assistant gains by it.
    const gift: Trade = { sides: [side(x.id), side(y.id, { players: [someone(1).id] })] }
    expect(proposeTrade(mid, gift).made).toBe(false)
    expect(tradeMarketOf(mid).accepts(gift, y.id)).toBe(false)
    // A Manager who trades himself declares his answer; the assistant's does not count for him.
    const managed = setManagesTrades(mid, y.id, true)
    expect(proposeTrade(managed, gift).made).toBe(false)
    expect(proposeTrade(managed, gift, true).made).toBe(true)
  })

  it('tells both Clubs who left and who joined', () => {
    const [x, y] = clubs()
    const trade: Trade = {
      sides: [side(x.id, { players: ['p1'] }), side(y.id, { players: ['p2'] })],
    }
    expect(tradeNotices([trade], x.id, 9)).toEqual([
      { kind: 'traded', day: 9, playerId: 'p1', clubId: y.id },
      { kind: 'acquired', day: 9, playerId: 'p2', fromClubId: y.id },
    ])
    expect(tradeNotices([trade], 'other', 9)).toEqual([])
  })

  it('never has the assistant trade a Club whose Manager trades himself', () => {
    const managed = setManagesTrades(start, start.clubs[0]!.id, true)
    let state = managed
    while (!isRegularSeasonOver(state)) state = advanceDay(state).state
    const id = start.clubs[0]!.id
    expect(
      state.transfers.filter(
        (t) => t.kind === 'trade' && (t.fromClubId === id || t.toClubId === id),
      ),
    ).toEqual([])
  })
})

describe('trades between Seasons', () => {
  it('lets the owner of a traded pick use it in the draft', async () => {
    let state = await startSeason(7, undefined, FORMAT)
    while (!isSeasonOver(state)) state = advanceDay(state).state
    const off = endSeason(state)
    const [x, y] = [off.clubs[0]!.id, off.clubs[1]!.id]
    const pick = { year: off.year, round: 1, clubId: y }
    const owner = off.pickOwners[pickKey(pick)] ?? y
    // Whoever owns it, it goes to another Club, by its Manager's declaration.
    const to = owner === x ? off.clubs[2]!.id : x
    const managed = { ...off, ended: setManagesTrades(off.ended, to, true) }
    const {
      off: traded,
      made,
      violations,
    } = proposeOffseasonTrade(managed, { sides: [side(owner, { picks: [pick] }), side(to)] }, true)
    expect(violations).toEqual([])
    expect(made).toBe(true)
    expect(traded.pickOwners[pickKey(pick)]).toBe(to)
    const drafted = runDraft(traded)
    const used = drafted.picks.find((p) => p.round === 1 && (p.fromClubId ?? p.clubId) === y)!
    expect(used.clubId).toBe(to)
    expect(used.fromClubId).toBe(y)
    expect(draftClock(drafted)).toBeNull()
  })
})
