import { createRng, generateClass, playerLevel } from '@ahm/sim'
import { describe, expect, it } from 'vitest'
import { byGroup, prospectView, rosterView } from '../server/utils/prospects'

/** Prospects as ranges in every league (ADR-028 amendment, FR-36). */
describe('a prospect as a Manager sees him', () => {
  const draftClass = generateClass(createRng(4).fork('class:y2'), 2, 40)

  it('shows his level and potential as ranges about them, never as figures', () => {
    for (const player of draftClass) {
      const view = prospectView(player)
      for (const [shown, value] of [
        [view.level, Math.round(playerLevel(player))],
        [view.potential, Math.round(player.potential)],
      ] as const) {
        expect(Object.keys(shown)).toEqual(['low', 'high'])
        expect(shown.low).toBeLessThanOrEqual(value)
        expect(shown.high).toBeGreaterThanOrEqual(value)
      }
    }
  })

  it('is wide, as a class is generated at low confidence', () => {
    const widths = draftClass.map((player) => {
      const { low, high } = prospectView(player).potential
      return high - low
    })
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(6)
  })
})

describe('a Player on a Roster between Seasons', () => {
  const [player] = generateClass(createRng(5), 1, 1)

  it('shows his level as a figure in a generated league, and as a range on a roster file', () => {
    const level = Math.round(playerLevel(player!))
    expect(rosterView(player!, false).level).toEqual({ low: level, high: level })
    const ranged = rosterView(player!, true).level
    expect(ranged.high - ranged.low).toBeGreaterThan(0)
  })
})

describe('ranges as wide as a group is spread (#92)', () => {
  const draftClass = generateClass(createRng(6).fork('class:y2'), 2, 192)

  it('gives a Goalie a narrower range than a Skater at the same confidence', () => {
    const width = (group: string) =>
      Math.max(
        ...draftClass
          .map(prospectView)
          .filter((p) => p.group === group)
          .map((p) => p.potential.high - p.potential.low),
      )
    expect(width('goalie')).toBeLessThan(width('forward'))
    expect(width('goalie')).toBeLessThanOrEqual(4)
  })

  it('sorts each group apart', () => {
    const groups = byGroup(draftClass.map(prospectView))
    expect(groups.goalie.every((p) => p.group === 'goalie')).toBe(true)
    expect(groups.forward.length + groups.defence.length + groups.goalie.length).toBe(192)
  })
})
