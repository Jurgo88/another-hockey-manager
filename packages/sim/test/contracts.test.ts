import { beforeAll, describe, expect, it } from 'vitest'
import { NHL_CAP_RULES } from '../src/data/nhl-2026-27.js'
import type { Club } from '../src/domain/club.js'
import type { Contract } from '../src/domain/contract.js'
import type { Player } from '../src/domain/player.js'
import {
  askingContract,
  entryLevelContract,
  minimumContract,
  openingContracts,
  payroll,
  withinCap,
} from '../src/generate/contracts.js'
import { createRng } from '../src/rng/index.js'
import {
  advanceDay,
  contractedSeason,
  isSeasonOver,
  nextSeason,
  startSeason,
  type SeasonState,
  type UncontractedSeason,
} from '../src/season/index.js'
import { SMALL_SEASON } from './support/league.js'

/** Contracts in the domain (ADR-030, #125). */

const rules = NHL_CAP_RULES
const rng = () => createRng(7).fork('test')
const playersOf = (club: Club): Player[] => [...club.skaters, ...club.goalies]

/** A Player as a Roster without contracts holds him. */
function unsigned<P extends Player>(player: P): P {
  const copy = { ...player }
  delete copy.contract
  return copy
}

const unsignedClub = (club: Club): Club => ({
  ...club,
  skaters: club.skaters.map(unsigned),
  goalies: club.goalies.map(unsigned),
})

describe('a league opens under contract', () => {
  let start: SeasonState

  beforeAll(async () => {
    start = await startSeason(1)
  })

  it('gives every Player a contract the rules allow', () => {
    for (const player of start.clubs.flatMap(playersOf)) {
      const contract = player.contract!
      expect(contract.capHit).toBeGreaterThanOrEqual(rules.minimum)
      expect(contract.capHit).toBeLessThanOrEqual(rules.maximum)
      expect(contract.years).toBeGreaterThanOrEqual(1)
      expect(contract.years).toBeLessThanOrEqual(rules.maxTerm.ownClub)
    }
  })

  it('opens no Club over the cap, and keeps the rules with the Season', () => {
    for (const club of start.clubs) expect(payroll(club)).toBeLessThanOrEqual(1 + 1e-9)
    expect(start.capRules).toBe(rules)
  })

  it('keeps a contract a roster file gives', () => {
    const given: Contract = { capHit: 0.05, years: 4, kind: 'standard', onExpiry: 'unrestricted' }
    const clubs = start.clubs.map((club, i) =>
      i === 0
        ? {
            ...club,
            skaters: club.skaters.map((s, j) => (j === 0 ? { ...s, contract: given } : s)),
          }
        : club,
    )
    const loaded = clubs.map((club) => ({
      ...club,
      skaters: club.skaters.map((s) => (s.contract === given ? s : unsigned(s))),
      goalies: club.goalies.map(unsigned),
    }))
    const opened = openingContracts(rules, loaded, rng())
    expect(opened[0]!.skaters[0]!.contract).toEqual(given)
  })
})

describe('the ask', () => {
  let player: Player

  beforeAll(async () => {
    player = (await startSeason(1)).clubs[0]!.skaters[0]!
  })

  it('pays a better place more', () => {
    const veteran = { ...player, age: 30 }
    const at = (rank: number) =>
      askingContract(rules, veteran, { rank, regulars: 468 }, rng()).capHit
    expect(at(0)).toBeGreaterThan(at(150))
    expect(at(150)).toBeGreaterThan(at(400))
  })

  it('pays a contract that leaves its Player restricted less', () => {
    const place = { rank: 20, regulars: 468 }
    const young = askingContract(rules, { ...player, age: 20 }, place, rng())
    const old = askingContract(rules, { ...player, age: 30 }, place, rng())
    expect(young.onExpiry).toBe('restricted')
    expect(old.onExpiry).toBe('unrestricted')
    expect(young.capHit).toBeLessThan(old.capHit * 0.7)
  })

  it('is the minimum for a year beyond the regulars', () => {
    const contract = askingContract(rules, player, { rank: 470, regulars: 468 }, rng())
    expect(contract).toEqual(minimumContract(rules, player))
    expect(contract.years).toBe(1)
  })

  it('makes an entry-level contract as long as the age at signing allows', () => {
    const years = (age: number) => entryLevelContract(rules, { ...player, age }).years
    expect([years(18), years(21), years(22), years(23), years(24), years(30)]).toEqual([
      3, 3, 2, 2, 1, 1,
    ])
    expect(entryLevelContract(rules, player).capHit).toBe(rules.entryLevel.capHit)
  })
})

describe('the cap at opening', () => {
  it('brings a Club over the cap down to it, the minimum untouched', async () => {
    const club = (await startSeason(1)).clubs[0]!
    const doubled = {
      ...club,
      skaters: club.skaters.map((s) =>
        s.contract!.capHit > rules.minimum
          ? { ...s, contract: { ...s.contract!, capHit: s.contract!.capHit * 3 } }
          : s,
      ),
    }
    expect(payroll(doubled)).toBeGreaterThan(1)
    const brought = withinCap(rules, doubled)
    expect(payroll(brought)).toBeCloseTo(1, 4)
    const minimums = (c: Club) =>
      playersOf(c).filter((p) => p.contract!.capHit === rules.minimum).length
    expect(minimums(brought)).toBe(minimums(doubled))
  })
})

describe('contracts from one Season to the next', () => {
  let ended: SeasonState
  let next: SeasonState

  beforeAll(async () => {
    let state = await startSeason(5, undefined, SMALL_SEASON)
    while (!isSeasonOver(state)) state = advanceDay(state).state
    ended = state
    next = nextSeason(ended)
  })

  it('keeps every Player on a Roster under contract', () => {
    for (const player of next.clubs.flatMap(playersOf)) {
      expect(player.contract!.years).toBeGreaterThanOrEqual(1)
    }
  })

  it('takes a Season off a running contract, and renews one that ran out', () => {
    const before = new Map(ended.clubs.flatMap(playersOf).map((p) => [p.id, p.contract!]))
    let ran = 0
    let renewed = 0
    for (const player of next.clubs.flatMap(playersOf)) {
      const was = before.get(player.id)
      if (!was) continue
      if (was.years > 1) {
        ran++
        expect(player.contract).toEqual({ ...was, years: was.years - 1 })
      } else {
        renewed++
        expect(player.contract!.kind).toBe('standard')
      }
    }
    expect(ran).toBeGreaterThan(0)
    expect(renewed).toBeGreaterThan(0)
  })

  it('signs a called-up prospect to an entry-level contract, and the rest who join at the minimum', () => {
    const before = new Set(ended.clubs.flatMap(playersOf).map((p) => p.id))
    // A former prospect whose rights expired joins as the fill does.
    const held = (year: number) => year + SMALL_SEASON.draft.rightsSeasons > next.year
    const prospects = new Set([
      ...ended.prospects.filter((p) => held(p.year)).map((p) => p.player.id),
      ...next.draft.map((pick) => pick.playerId),
    ])
    const joined = next.clubs.flatMap(playersOf).filter((p) => !before.has(p.id))
    expect(joined.length).toBeGreaterThan(0)
    for (const player of joined) {
      expect(player.contract).toEqual(
        prospects.has(player.id)
          ? entryLevelContract(rules, player)
          : minimumContract(rules, player),
      )
    }
  })

  it('leaves prospects without a contract', () => {
    for (const prospect of next.prospects) expect(prospect.player.contract).toBeUndefined()
  })
})

describe('a Season stored before contracts', () => {
  it('gets the contracts and rules it would have opened with, the same each time', async () => {
    const start = await startSeason(3, undefined, SMALL_SEASON)
    const stored: UncontractedSeason = { ...start, clubs: start.clubs.map(unsignedClub) }
    delete stored.capRules
    expect(contractedSeason(stored)).toEqual(start)
    expect(contractedSeason(start)).toBe(start)
  })
})
