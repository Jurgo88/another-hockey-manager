import { beforeAll, describe, expect, it } from 'vitest'
import {
  changeAt,
  ICE_TIME,
  PHYSICAL_CURVE,
  READING_CURVE,
  SKILL_CURVE,
  stepAt,
  TOP_SPEED,
} from '../src/develop/curves.js'
import { develop, withinPotential } from '../src/develop/index.js'
import {
  isGoalie,
  isSkater,
  playerLevel,
  type Goalie,
  type Player,
  type Skater,
} from '../src/domain/player.js'
import { createRng } from '../src/rng/index.js'
import { startSeason } from '../src/season/index.js'

/** Ageing and development against `potential` (ADR-022, ADR-026, #87). */

let players: Player[]

beforeAll(async () => {
  const state = await startSeason(87)
  players = state.clubs.flatMap((club) => [...club.skaters, ...club.goalies])
})

const skaters = () => players.filter(isSkater)
const goalies = () => players.filter(isGoalie)
/** A Player without what development changes. */
const identity = (player: Player) => ({ ...player, attributes: null, provenance: null })
const streamOf = (player: Player, label = 'd') => createRng(87).fork(`${label}:${player.id}`)

/** The mean change of level over `draws` Seasons from the same start, each on its own stream. */
function meanGrowth(player: Player, regular: boolean, draws = 200): number {
  let sum = 0
  for (let i = 0; i < draws; i++) {
    sum += playerLevel(develop(player, streamOf(player, `m${i}`), { regular })) - playerLevel(player)
  }
  return sum / draws
}

describe('the curves (ADR-026)', () => {
  const ages = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

  it('rise in youth and fall in old age, in every group', () => {
    for (const curve of [SKILL_CURVE, READING_CURVE, PHYSICAL_CURVE]) {
      expect(changeAt(curve, 20)).toBeGreaterThan(0)
      expect(changeAt(curve, 36)).toBeLessThan(0)
    }
  })

  it('grow skill to about 28 and reading the game to about 31', () => {
    expect(changeAt(SKILL_CURVE, 27)).toBeGreaterThan(0)
    expect(changeAt(SKILL_CURVE, 32)).toBeLessThan(0)
    expect(changeAt(READING_CURVE, 30)).toBeGreaterThan(0)
    expect(changeAt(READING_CURVE, 31)).toBeGreaterThan(0)
    expect(changeAt(READING_CURVE, 34)).toBeLessThan(0)
  })

  it('never grow speed after 30', () => {
    for (const age of ages(30, 42)) expect(changeAt(PHYSICAL_CURVE, age)).toBeLessThanOrEqual(0)
  })

  it('grow by as much in all as measured, over more years', () => {
    const total = (at: (age: number) => number, to: number) =>
      Array.from({ length: to - 18 }, (_, i) => at(18 + i)).reduce((a, b) => a + b, 0)
    const measured = total((age) => stepAt(ICE_TIME, age), 26)
    expect(total((age) => changeAt(SKILL_CURVE, age), 29)).toBeCloseTo(measured, 1)
    expect(total((age) => changeAt(READING_CURVE, age), 32)).toBeCloseTo(measured, 1)
  })

  it('decline as measured, the extra years later', () => {
    expect(changeAt(READING_CURVE, 36)).toBe(stepAt(ICE_TIME, 30))
    expect(changeAt(SKILL_CURVE, 36)).toBe(stepAt(ICE_TIME, 33))
    expect(changeAt(PHYSICAL_CURVE, 32)).toBe(stepAt(TOP_SPEED, 31))
  })

  it('keep declining past the last measured age, faster at the end', () => {
    expect(stepAt(ICE_TIME, 42)).toBe(stepAt(ICE_TIME, 37))
    expect(stepAt(ICE_TIME, 42)).toBeLessThan(0)
    expect(stepAt(ICE_TIME, 34)).toBeLessThan(stepAt(ICE_TIME, 29))
  })
})

describe('develop', () => {
  it('is deterministic for a stream (D-08)', () => {
    const player = skaters()[0]!
    expect(develop(player, streamOf(player), { regular: true })).toEqual(
      develop(player, streamOf(player), { regular: true }),
    )
  })

  it('changes attributes only: identity, age and potential stay', () => {
    for (const player of players.slice(0, 50)) {
      const after = develop(player, streamOf(player), { regular: true })
      expect(identity(after)).toEqual(identity(player))
    }
  })

  it('keeps attributes whole numbers on the scale', () => {
    for (const player of players) {
      const after = develop(player, streamOf(player), { regular: true })
      for (const value of Object.values(after.attributes)) {
        expect(Number.isInteger(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(1)
        expect(value).toBeLessThanOrEqual(20)
      }
    }
  })

  it('never changes discipline, which does not age', () => {
    for (const skater of skaters()) {
      const after = develop(skater, streamOf(skater), { regular: true })
      expect(after.attributes.discipline).toBe(skater.attributes.discipline)
    }
  })

  it('grows a young Player with room below his potential', () => {
    const young: Skater = { ...skaters()[0]!, age: 20, potential: 20 }
    expect(meanGrowth(young, false)).toBeGreaterThan(0.3)
  })

  it('grows a regular a little faster before the peak', () => {
    const young: Skater = { ...skaters()[0]!, age: 22, potential: 20 }
    expect(meanGrowth(young, true)).toBeGreaterThan(meanGrowth(young, false))
  })

  it('does not lift a level already at potential', () => {
    const skater = skaters()[0]!
    const atCeiling: Skater = { ...skater, age: 20, potential: playerLevel(skater) }
    // Rounding at random in proportion can add a fraction, never a trend.
    expect(meanGrowth(atCeiling, true)).toBeLessThan(0.1)
  })

  it('declines a veteran however much room he has', () => {
    const veteran: Skater = { ...skaters()[0]!, age: 36, potential: 20 }
    expect(meanGrowth(veteran, true)).toBeLessThan(-0.3)
    const goalie: Goalie = { ...goalies()[0]!, age: 36, potential: 20 }
    expect(meanGrowth(goalie, true)).toBeLessThan(-0.2)
  })

  it('grows a Goalie who arrives at 24, reflexes included', () => {
    const late: Goalie = { ...goalies()[0]!, age: 24, potential: 20 }
    let reflexes = 0
    for (let i = 0; i < 200; i++) {
      reflexes += develop(late, streamOf(late, `g${i}`), { regular: true }).attributes.reflexes
    }
    expect(reflexes / 200).toBeGreaterThan(late.attributes.reflexes)
    expect(meanGrowth(late, true)).toBeGreaterThan(0)
  })

  it('gives each Player a career shape: fast growth young, still growing at 28, holding at 29, down at 35', () => {
    const at = (age: number) =>
      skaters()
        .slice(0, 120)
        .reduce((sum, skater) => sum + meanGrowth({ ...skater, age, potential: 20 }, true, 20), 0) /
      120
    const young = at(21)
    const prime = at(26)
    const late = at(28)
    const plateau = at(29)
    const old = at(35)
    expect(young).toBeGreaterThan(prime)
    expect(prime).toBeGreaterThan(late)
    expect(late).toBeGreaterThan(0)
    expect(Math.abs(plateau)).toBeLessThan(0.1)
    expect(old).toBeLessThan(0)
  })
})

describe('withinPotential', () => {
  const keys = ['a', 'b'] as const

  it('leaves growth that stays below potential alone', () => {
    expect(withinPotential({ a: 1, b: -0.5 }, keys, 10, 12)).toEqual({ a: 1, b: -0.5 })
  })

  it('scales rises down so the level lands on potential', () => {
    const capped = withinPotential({ a: 2, b: 2 }, keys, 10, 11)
    expect((capped.a + capped.b) / 2).toBeCloseTo(1)
  })

  it('lets a single attribute rise at the ceiling while others fall', () => {
    const capped = withinPotential({ a: 1, b: -0.4 }, keys, 12, 12)
    expect(capped.b).toBe(-0.4)
    expect(capped.a).toBeCloseTo(0.4)
  })

  it('does not cap decline', () => {
    expect(withinPotential({ a: -1, b: -2 }, keys, 15, 12)).toEqual({ a: -1, b: -2 })
  })

  it('scales a rise outside the level, such as faceoffs, with the rest', () => {
    const capped = withinPotential<'a' | 'b' | 'c'>({ a: 2, b: 2, c: 1 }, keys, 10, 10)
    expect(capped).toEqual({ a: 0, b: 0, c: 0 })
  })
})

describe('provenance follows the change (D-11)', () => {
  it('trusts an ageing value 0.1 less each Season, down to the generated floor', () => {
    const skater = skaters()[0]!
    const measured: Skater = {
      ...skater,
      provenance: {
        ...skater.provenance!,
        speed: { source: 'measured', confidence: 0.95, note: 'NHL EDGE max speed 23.9 mph' },
        shooting: { source: 'derived', confidence: 0.3 },
      },
    }
    const once = develop(measured, streamOf(skater), { regular: true })
    expect(once.provenance!.speed).toEqual({
      source: 'measured',
      confidence: 0.85,
      note: 'NHL EDGE max speed 23.9 mph',
      seasonsAged: 1,
    })
    expect(once.provenance!.shooting).toEqual({ source: 'derived', confidence: 0.25, seasonsAged: 1 })

    let later = once
    for (let season = 2; season <= 10; season++) {
      later = develop(later, streamOf(skater, `s${season}`), { regular: true })
    }
    expect(later.provenance!.speed).toMatchObject({ confidence: 0.25, seasonsAged: 10 })
  })

  it('leaves discipline as its source gave it', () => {
    const skater = skaters()[0]!
    const after = develop(skater, streamOf(skater), { regular: true })
    expect(after.provenance!.discipline).toEqual(skater.provenance!.discipline)
  })

  it('leaves a Player without provenance without it', () => {
    const bare = { ...skaters()[0]! }
    delete bare.provenance
    const after = develop(bare, streamOf(bare), { regular: true })
    expect(after.provenance).toBeUndefined()
  })
})
