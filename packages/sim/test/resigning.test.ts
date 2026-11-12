import { beforeAll, describe, expect, it } from 'vitest'
import { NHL_CAP_RULES } from '../src/data/nhl-2026-27.js'
import type { Club } from '../src/domain/club.js'
import { playerLevel, type Player } from '../src/domain/player.js'
import { askingContract, payroll } from '../src/generate/contracts.js'
import { createRng } from '../src/rng/index.js'
import {
  advanceDay,
  askOf,
  endSeason,
  expiringPlayers,
  InvalidReSigningsError,
  isSeasonOver,
  proposedReSignings,
  reSigningNoticesOf,
  runDraft,
  runReSigning,
  setReSignings,
  setRosterMoves,
  startNextSeason,
  startSeason,
  type Offseason,
  type SeasonState,
} from '../src/season/index.js'
import { SMALL_SEASON } from './support/league.js'

/** The ask by role, the term, and the re-signing window (ADR-030, ADR-032, #127). */

const rules = NHL_CAP_RULES
const playersOf = (club: Club): Player[] => [...club.skaters, ...club.goalies]

describe('the term of a new contract', () => {
  let player: Player

  beforeAll(async () => {
    player = (await startSeason(1, undefined, SMALL_SEASON)).clubs[0]!.skaters[0]!
  })

  const terms = (age: number, rank: number) =>
    Array.from(
      { length: 400 },
      (_, i) =>
        askingContract(rules, { ...player, age }, { rank, regulars: 100 }, createRng(i).fork('t'))
          .years,
    )
  const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length

  it('runs as the measured terms do: longer for a larger role, within the rules', () => {
    const top = terms(27, 5)
    const bottom = terms(27, 90)
    for (const years of [...top, ...bottom]) {
      expect(years).toBeGreaterThanOrEqual(1)
      expect(years).toBeLessThanOrEqual(rules.maxTerm.ownClub)
    }
    expect(mean(top)).toBeGreaterThan(mean(bottom) + 1.5)
  })

  it('is shorter for an older Player of the same role', () => {
    expect(mean(terms(33, 5))).toBeLessThan(mean(terms(27, 5)))
  })

  it('takes the term a Club names, and prices it by the status it leaves', () => {
    const place = { rank: 5, regulars: 100 }
    const short = askingContract(rules, { ...player, age: 23 }, place, createRng(1), 2)
    const long = askingContract(rules, { ...player, age: 23 }, place, createRng(1), 6)
    expect([short.years, short.onExpiry]).toEqual([2, 'restricted'])
    expect([long.years, long.onExpiry]).toEqual([6, 'unrestricted'])
    expect(long.capHit).toBeGreaterThan(short.capHit)
  })
})

describe('the re-signing window', () => {
  let ended: SeasonState
  let off: Offseason
  let window: Offseason

  beforeAll(async () => {
    let state = await startSeason(5, undefined, SMALL_SEASON)
    while (!isSeasonOver(state)) state = advanceDay(state).state
    ended = state
    off = endSeason(ended)
    window = runDraft(off)
  })

  it('opens after the draft, with every contract that ran out waiting on it', () => {
    expect(window.phase).toBe('resign')
    const expiring = window.clubs.flatMap(playersOf).filter((p) => p.contract!.years === 0)
    expect(expiring.length).toBeGreaterThan(0)
    expect(new Set(expiring.map((p) => p.id))).toEqual(new Set(Object.keys(window.expiring)))
  })

  it('prices the ask by the role in the Season just played', () => {
    const regular = ended.totals.regular.skaters
    const skaters = window.clubs
      .flatMap((club) => club.skaters)
      .filter((p) => p.id in window.expiring && regular[p.id])
    const perFixture = (id: string) => regular[id]!.iceTimeSeconds / regular[id]!.gamesPlayed
    const [most, least] = [...skaters]
      .filter((p) => p.preferredPositions[0] !== 'LD' && p.preferredPositions[0] !== 'RD')
      .sort((a, b) => perFixture(b.id) - perFixture(a.id))
      .filter((_, i, all) => i === 0 || i === all.length - 1)
    expect(window.expiring[most!.id]!.rank).toBeLessThan(window.expiring[least!.id]!.rank)
  })

  it('has the assistant re-sign the best by level while they fit under the cap (D-04)', () => {
    const closed = runReSigning(window)
    expect(closed.phase).toBe('roster')
    for (const club of window.clubs) {
      const proposal = proposedReSignings(window, club.id)
      const expiring = expiringPlayers(window, club.id)
      const level = new Map(expiring.map((p) => [p.id, playerLevel(p)]))
      const levels = proposal.map((r) => level.get(r.playerId)!)
      expect(levels).toEqual([...levels].sort((x, y) => y - x))
      const after = closed.clubs.find((c) => c.id === club.id)!
      for (const { playerId, years } of proposal) {
        const player = playersOf(after).find((p) => p.id === playerId)!
        expect(player.contract).toEqual(askOf(window, playerId, years))
      }
      const kept = new Set(proposal.map((r) => r.playerId))
      for (const player of expiring.filter((p) => !kept.has(p.id))) {
        expect(closed.departures).toContainEqual(
          expect.objectContaining({ playerId: player.id, reason: 'unsigned' }),
        )
      }
      const open = 29 - playersOf(after).length
      expect(payroll(after) + open * rules.minimum).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('refuses re-signings that take a Club over the cap', () => {
    const club = window.clubs.find((c) =>
      expiringPlayers(window, c.id).some((p) => askOf(window, p.id).capHit > rules.minimum),
    )!
    const dear = expiringPlayers(window, club.id).find(
      (p) => askOf(window, p.id).capHit > rules.minimum,
    )!
    const running = club.skaters.find((p) => !(p.id in window.expiring))!
    const full: Offseason = {
      ...window,
      clubs: window.clubs.map((c) =>
        c.id !== club.id
          ? c
          : {
              ...c,
              skaters: c.skaters.map((p) =>
                p.id === running.id ? { ...p, contract: { ...p.contract!, capHit: 0.85 } } : p,
              ),
            },
      ),
    }
    expect(() => setReSignings(full, club.id, [{ playerId: dear.id, years: 2 }])).toThrow(
      InvalidReSigningsError,
    )
    expect(proposedReSignings(full, club.id).some((r) => r.playerId === dear.id)).toBe(false)
  })

  it('makes a Manager’s choice: a term of his own, and a Player let go (D-04)', () => {
    const club = window.clubs.find((c) => expiringPlayers(window, c.id).length >= 2)!
    const [kept, gone] = expiringPlayers(window, club.id)
    const decided = setReSignings(window, club.id, [{ playerId: kept!.id, years: 3 }])
    const closed = runReSigning(decided)
    const after = closed.clubs.find((c) => c.id === club.id)!
    expect(playersOf(after).find((p) => p.id === kept!.id)!.contract!.years).toBe(3)
    expect(playersOf(after).some((p) => p.id === gone!.id)).toBe(false)
    expect(closed.departures).toContainEqual({
      playerId: gone!.id,
      clubId: club.id,
      age: gone!.age - 1,
      reason: 'unsigned',
    })
    const notices = reSigningNoticesOf(closed, club.id)
    expect(notices).toContainEqual(
      expect.objectContaining({ kind: 'reSigned', playerId: kept!.id, years: 3 }),
    )
    expect(notices).toContainEqual(expect.objectContaining({ kind: 'letGo', playerId: gone!.id }))

    // His place is a gap the next Season fills.
    const next = startNextSeason(closed)
    expect(playersOf(next.clubs.find((c) => c.id === club.id)!)).toHaveLength(29)
  })

  it('refuses re-signings that break the rules, as data', () => {
    const club = window.clubs.find((c) => expiringPlayers(window, c.id).length > 0)!
    const [one] = expiringPlayers(window, club.id)
    const stranger = club.skaters.find((p) => !(p.id in window.expiring))!.id
    try {
      setReSignings(window, club.id, [
        { playerId: one!.id, years: 2 },
        { playerId: one!.id, years: 9 },
        { playerId: stranger, years: 1 },
      ])
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidReSigningsError)
      expect((error as InvalidReSigningsError).violations).toEqual([
        { kind: 'reSignedTwice', playerId: one!.id },
        { kind: 'termOutOfRange', playerId: one!.id, years: 9, max: 7 },
        { kind: 'notExpiring', playerId: stranger },
      ])
    }
  })

  it('comes between the draft and the Roster window', () => {
    const club = window.clubs[0]!.id
    expect(() => setReSignings(off, club, [])).toThrow(/not open/)
    expect(() => setRosterMoves(window, club, { callUps: [], releases: [] })).toThrow(
      /not been made/,
    )
    expect(() => setReSignings(runReSigning(window), club, [])).toThrow(/not open/)
  })
})
