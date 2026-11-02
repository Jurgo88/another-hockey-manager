import { describe, expect, it } from 'vitest'
import { assignPositions, fillPositions, type PositionedPlayer } from '../src/positions.js'
import { adjustedForZoneStarts, percentiles } from '../src/scale.js'

const player = (
  id: number,
  listed: PositionedPlayer['listed'],
  shoots: 'L' | 'R' = 'L',
  faceoffsTaken = 0,
  clubToi = 1000 - id,
): PositionedPlayer => ({ id, listed, shoots, faceoffsTaken, clubToi })

describe('natural positions (ADR-021)', () => {
  it('moves as few as needed to dress four of each forward position', () => {
    const forwards = [
      ...[1, 2, 3, 4, 5, 6, 7].map((id) => player(id, 'C', 'L', 1000 - id * 100)),
      ...[8, 9, 10, 11, 12, 13].map((id) => player(id, 'L')),
      ...[14, 15, 16].map((id) => player(id, 'R', 'R')),
    ]
    const positions = assignPositions(forwards)
    const natural = [...positions.values()].map((p) => p[0])
    for (const position of ['LW', 'C', 'RW']) {
      expect(natural.filter((p) => p === position).length).toBeGreaterThanOrEqual(4)
    }
    // A winger crosses before a centre leaves the middle, and keeps his side as his second.
    expect(positions.get(13)).toEqual(['RW', 'LW'])
    expect(positions.get(1)).toEqual(['C', 'LW'])
  })

  it('sends to the wing the centre who takes the fewest draws', () => {
    const forwards = [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => player(id, 'C', 'L', 1000 - id * 100)),
      ...[10, 11, 12].map((id) => player(id, 'L')),
      ...[13, 14, 15, 16].map((id) => player(id, 'R', 'R')),
    ]
    expect(assignPositions(forwards).get(9)).toEqual(['LW', 'C'])
  })

  it('sends to centre the winger who takes the most draws', () => {
    const forwards = [
      ...[1, 2, 3].map((id) => player(id, 'C')),
      ...[4, 5, 6, 7, 8, 9].map((id) => player(id, 'L', 'L', id === 6 ? 300 : 0)),
      ...[10, 11, 12, 13, 14, 15, 16].map((id) => player(id, 'R', 'R')),
    ]
    expect(assignPositions(forwards).get(6)).toEqual(['C', 'LW'])
  })

  it('puts a defenceman on the side of his hand, then evens the sides', () => {
    const defence = [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((id) => player(id, 'D', 'L')),
      ...[9, 10].map((id) => player(id, 'D', 'R')),
    ]
    const positions = assignPositions(defence)
    expect(positions.get(9)![0]).toBe('RD')
    const right = [...positions.values()].filter((p) => p[0] === 'RD')
    expect(right).toHaveLength(3)
    // The least-used left shot crosses over.
    expect(positions.get(8)).toEqual(['RD', 'LD'])
  })

  it('counts generated fill towards the minimum', () => {
    const fill = fillPositions(['C', 'C', 'C', 'C', 'LW', 'LW', 'LW', 'LW', 'RW', 'RW', 'RW'], 'forwards', 2)
    expect(fill[0]).toBe('RW')
  })
})

describe('ranking', () => {
  it('breaks ties by id, so order does not matter', () => {
    const a = percentiles([
      { id: 2, value: 1, weight: 1 },
      { id: 1, value: 1, weight: 1 },
    ])
    expect([a.get(1), a.get(2)]).toEqual([0.25, 0.75])
  })

  it('removes what zone starts explain', () => {
    const zone = new Map([
      [1, 0.3],
      [2, 0.5],
      [3, 0.7],
    ])
    const adjusted = adjustedForZoneStarts(
      [
        { id: 1, value: 1.3, weight: 100 },
        { id: 2, value: 1.5, weight: 100 },
        { id: 3, value: 1.7, weight: 100 },
      ],
      zone,
    )
    for (const sample of adjusted) expect(sample.value).toBeCloseTo(1.5)
  })
})
