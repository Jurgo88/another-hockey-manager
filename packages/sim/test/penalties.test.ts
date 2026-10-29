import { describe, expect, it } from 'vitest'
import type { MatchEvent } from '../src/domain/event.js'
import { createPenaltyBox } from '../src/engine/penalties.js'

const box = () => createPenaltyBox({ home: 'h', away: 'a' })

/** Power-play events only, as `type:club[:reason]` - enough to read a sequence at a glance. */
function powerPlays(events: readonly MatchEvent[]): string[] {
  return events.flatMap((e) => {
    if (e.type === 'powerplay_start')
      return [`start:${e.clubId}:${e.skatersFor}v${e.skatersAgainst}`]
    if (e.type === 'powerplay_end') return [`end:${e.clubId}:${e.reason}`]
    return []
  })
}

describe('penalty box', () => {
  it('runs a minor for two minutes and brackets the advantage', () => {
    const b = box()
    const events: MatchEvent[] = []
    b.call('home', 'h7', 'tripping', 2, 100, 1, events)

    expect(events[0]).toMatchObject({
      type: 'penalty',
      clubId: 'h',
      player: 'h7',
      minutes: 2,
      strength: 'even',
    })
    expect(b.skaters('home')).toBe(4)
    expect(b.strength('away')).toBe('powerplay')
    expect(b.boxed('home')).toEqual(new Set(['h7']))
    expect(b.nextExpiry()).toBe(220)

    b.expire(219, 1, events)
    expect(b.skaters('home')).toBe(4)
    b.expire(220, 1, events)
    expect(b.skaters('home')).toBe(5)
    expect(b.boxed('home').size).toBe(0)
    expect(b.nextExpiry()).toBe(Infinity)
    expect(powerPlays(events)).toEqual(['start:a:5v4', 'end:a:expired'])
  })

  it('ends the minor on a power-play goal, but not on a short-handed one', () => {
    const b = box()
    const events: MatchEvent[] = []
    b.call('home', 'h7', 'hooking', 2, 100, 1, events)

    b.goal('home', 130, 1, events)
    expect(b.skaters('home')).toBe(4)

    b.goal('away', 150, 1, events)
    expect(b.skaters('home')).toBe(5)
    expect(powerPlays(events)).toEqual(['start:a:5v4', 'end:a:goal'])
  })

  it('derives 5-on-3 from the queue as two nested advantages', () => {
    const b = box()
    const events: MatchEvent[] = []
    b.call('home', 'h7', 'tripping', 2, 100, 1, events)
    b.call('home', 'h8', 'holding', 2, 130, 1, events)
    expect(b.skaters('home')).toBe(3)

    // The goal ends the minor with the least time left - h7's.
    b.goal('away', 140, 1, events)
    expect(b.boxed('home')).toEqual(new Set(['h8']))
    expect(powerPlays(events)).toEqual(['start:a:5v4', 'start:a:5v3', 'end:a:goal'])
  })

  it('makes a third penalty wait until a slot frees, then serve in full', () => {
    const b = box()
    const events: MatchEvent[] = []
    b.call('home', 'h7', 'tripping', 2, 100, 1, events)
    b.call('home', 'h8', 'holding', 2, 110, 1, events)
    b.call('home', 'h9', 'slashing', 2, 120, 1, events)

    expect(b.skaters('home')).toBe(3)
    expect(b.boxed('home').size).toBe(3)

    b.expire(220, 1, events)
    expect(b.skaters('home')).toBe(3)
    expect(b.boxed('home')).toEqual(new Set(['h8', 'h9']))
    expect(b.nextExpiry()).toBe(230)

    b.expire(230, 1, events)
    b.expire(340, 1, events)
    expect(b.skaters('home')).toBe(5)
    expect(powerPlays(events)).toEqual([
      'start:a:5v4',
      'start:a:5v3',
      'end:a:expired',
      'end:a:expired',
    ])
  })

  it('ends an advantage when the advantaged Club is penalised, and 4-on-4 is even', () => {
    const b = box()
    const events: MatchEvent[] = []
    b.call('home', 'h7', 'tripping', 2, 100, 1, events)
    b.call('away', 'a3', 'roughing', 2, 130, 1, events)

    expect(b.strength('home')).toBe('even')
    expect(b.strength('away')).toBe('even')
    expect(b.skaters('home')).toBe(4)

    // Home's minor ends first: 5-on-4 the other way, for the rest of away's.
    b.expire(220, 1, events)
    expect(b.strength('home')).toBe('powerplay')
    b.expire(250, 1, events)
    expect(powerPlays(events)).toEqual([
      'start:a:5v4',
      'end:a:penalty',
      'start:h:5v4',
      'end:h:expired',
    ])
  })

  it('serves a double minor as two minors, a goal ending only the first', () => {
    const b = box()
    const events: MatchEvent[] = []
    b.call('home', 'h7', 'highsticking', 4, 100, 1, events)
    expect(b.nextExpiry()).toBe(220)

    b.goal('away', 150, 1, events)
    expect(b.skaters('home')).toBe(4)
    expect(b.nextExpiry()).toBe(270)

    b.goal('away', 200, 1, events)
    expect(b.skaters('home')).toBe(5)
    expect(powerPlays(events)).toEqual(['start:a:5v4', 'end:a:goal'])
  })

  it('runs a major for five minutes whatever is scored', () => {
    const b = box()
    const events: MatchEvent[] = []
    b.call('home', 'h7', 'boarding', 5, 100, 1, events)
    b.goal('away', 150, 1, events)
    b.goal('away', 200, 1, events)

    expect(b.skaters('home')).toBe(4)
    expect(b.nextExpiry()).toBe(400)
  })

  it('carries a penalty across a Period break and closes what is open at the end', () => {
    const b = box()
    const events: MatchEvent[] = []
    b.call('away', 'a3', 'tripping', 2, 1150, 1, events)

    b.expire(1200, 2, events)
    expect(b.skaters('away')).toBe(4)

    b.close(1220, 2, events)
    expect(powerPlays(events)).toEqual(['start:h:5v4', 'end:h:period_end'])
    expect(events.at(-1)).toMatchObject({ period: 2, clock: 1220 })
  })
})

describe('penalty box at 3-on-3 (FR-09)', () => {
  it('adds a Skater to the advantaged Club instead of removing one, keeping the margin', () => {
    const b = box()
    const events: MatchEvent[] = []
    b.call('home', 'h7', 'tripping', 2, 3550, 3, events)
    expect([b.skaters('home'), b.skaters('away')]).toEqual([4, 5])

    b.startThreeOnThree()
    expect([b.skaters('home'), b.skaters('away')]).toEqual([3, 4])
    expect(b.strength('away')).toBe('powerplay')

    b.call('home', 'h8', 'holding', 2, 3610, 'OT', events)
    expect([b.skaters('home'), b.skaters('away')]).toEqual([3, 5])

    b.call('away', 'a3', 'hooking', 2, 3620, 'OT', events)
    expect([b.skaters('home'), b.skaters('away')]).toEqual([3, 4])
    expect(powerPlays(events)).toEqual(['start:a:5v4', 'start:a:5v3', 'end:a:penalty'])
  })

  it('plays 3-on-3 when both Clubs are a man short', () => {
    const b = box()
    const events: MatchEvent[] = []
    b.startThreeOnThree()
    b.call('home', 'h7', 'tripping', 2, 3610, 'OT', events)
    b.call('away', 'a3', 'hooking', 2, 3620, 'OT', events)
    expect([b.skaters('home'), b.skaters('away')]).toEqual([3, 3])
    expect(b.strength('home')).toBe('even')
  })
})
