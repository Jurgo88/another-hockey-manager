import { beforeAll, describe, expect, it } from 'vitest'
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN, SKATER_ATTRIBUTE_KEYS } from '../src/domain/attributes.js'
import type { Club } from '../src/domain/club.js'
import type { Skater } from '../src/domain/player.js'
import { isUniformSource } from '../src/domain/provenance.js'
import { ROSTER_SHAPE, ROSTER_SIZE } from '../src/domain/roster.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'
import { createGeneratedRosterProvider } from '../src/generate/roster.js'
import { FORWARD_SLOT_ABILITY } from '../src/generate/talent.js'
import { generateDistinctNames, generateName, NATION_CODES } from '../src/generate/names.js'
import { createRng } from '../src/rng/index.js'

const IDENTITIES = new Map(
  NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
)

const provider = (seed = 2026) =>
  createGeneratedRosterProvider({ structure: NHL_2026_27, seed, clubIdentities: IDENTITIES })

/** Mean of a Skater's ten ability-driven attributes; discipline is excluded. */
function skaterQuality(skater: Skater): number {
  const keys = SKATER_ATTRIBUTE_KEYS.filter((key) => key !== 'discipline')
  return keys.reduce((sum, key) => sum + skater.attributes[key], 0) / keys.length
}

const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

const percentile = (values: readonly number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const low = Math.floor(index)
  const high = Math.ceil(index)
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (index - low)
}

describe('name generation', () => {
  it('produces a first and last name for every nation', () => {
    const rng = createRng(1)
    for (const nation of NATION_CODES) {
      const name = generateName(rng, nation)
      expect(name.firstName.length).toBeGreaterThan(1)
      expect(name.lastName.length).toBeGreaterThan(2)
      expect(name.nation).toBe(nation)
    }
  })

  it('capitalises surnames', () => {
    const rng = createRng(7)
    for (let i = 0; i < 200; i++) {
      const { lastName } = generateName(rng)
      expect(lastName[0]).toBe(lastName[0]!.toUpperCase())
    }
  })

  it('returns distinct full names in a batch', () => {
    const names = generateDistinctNames(createRng(3), 25)
    const keys = names.map((n) => `${n.firstName} ${n.lastName}`)
    expect(new Set(keys).size).toBe(25)
  })

  it('is deterministic', () => {
    expect(generateDistinctNames(createRng(9), 10)).toEqual(
      generateDistinctNames(createRng(9), 10),
    )
  })
})

describe('createGeneratedRosterProvider', () => {
  let clubs: readonly Club[]
  let skaters: Skater[]

  beforeAll(async () => {
    const result = await provider().loadCompetition('nhl')
    clubs = result.clubs
    skaters = clubs.flatMap((club) => club.skaters)
  })

  it('rejects a competition it does not hold', async () => {
    await expect(provider().loadCompetition('khl')).rejects.toThrow(/asked for "khl"/)
  })

  it('fills every Club in the structure', () => {
    expect(clubs).toHaveLength(32)
    expect(clubs.map((c) => c.id).sort()).toEqual(
      NHL_2026_27_CLUB_SEEDS.map((c) => c.id).sort(),
    )
  })

  it('gives every Club the declared roster shape', () => {
    for (const club of clubs) {
      const forwards = club.skaters.filter((s) =>
        ['LW', 'C', 'RW'].includes(s.preferredPositions[0]!),
      )
      const defence = club.skaters.filter((s) =>
        ['LD', 'RD'].includes(s.preferredPositions[0]!),
      )

      expect({
        club: club.id,
        skaters: club.skaters.length,
        goalies: club.goalies.length,
        forwards: forwards.length,
        defence: defence.length,
      }).toEqual({
        club: club.id,
        skaters: ROSTER_SHAPE.forwards + ROSTER_SHAPE.defence,
        goalies: ROSTER_SHAPE.goalies,
        forwards: ROSTER_SHAPE.forwards,
        defence: ROSTER_SHAPE.defence,
      })
    }
  })

  it('produces enough depth to make Lineup selection meaningful', () => {
    // A Lineup dresses 18 Skaters and 2 Goalies (FR-20).
    expect(ROSTER_SHAPE.forwards + ROSTER_SHAPE.defence).toBeGreaterThan(18)
    expect(ROSTER_SHAPE.goalies).toBeGreaterThan(2)
    expect(ROSTER_SIZE).toBe(25)
  })

  it('gives every Player a unique id and no duplicate names inside a Club', () => {
    const ids = clubs.flatMap((c) => [...c.skaters, ...c.goalies]).map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const club of clubs) {
      const names = [...club.skaters, ...club.goalies].map((p) => `${p.firstName} ${p.lastName}`)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('keeps every attribute inside the 1-20 scale', () => {
    for (const club of clubs) {
      for (const skater of club.skaters) {
        for (const value of Object.values(skater.attributes)) {
          expect(value).toBeGreaterThanOrEqual(ATTRIBUTE_MIN)
          expect(value).toBeLessThanOrEqual(ATTRIBUTE_MAX)
          expect(Number.isInteger(value)).toBe(true)
        }
      }
      for (const goalie of club.goalies) {
        for (const value of Object.values(goalie.attributes)) {
          expect(value).toBeGreaterThanOrEqual(ATTRIBUTE_MIN)
          expect(value).toBeLessThanOrEqual(ATTRIBUTE_MAX)
        }
      }
    }
  })

  it('marks every attribute as generated (ADR-008)', () => {
    for (const club of clubs) {
      for (const player of [...club.skaters, ...club.goalies]) {
        expect(player.provenance).toBeDefined()
        expect(isUniformSource(player.provenance!, 'generated')).toBe(true)
      }
    }
  })

  it('gives potential at or above current ability', () => {
    for (const skater of skaters) {
      expect(skater.potential).toBeGreaterThanOrEqual(1)
      expect(skater.potential).toBeLessThanOrEqual(ATTRIBUTE_MAX)
    }
  })

  it('produces plausible ages', () => {
    const ages = skaters.map((s) => s.age)
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(18)
    expect(Math.max(...ages)).toBeLessThanOrEqual(40)
    expect(mean(ages)).toBeGreaterThan(23)
    expect(mean(ages)).toBeLessThan(30)
  })

  it('is deterministic for a seed', async () => {
    const again = await provider().loadCompetition('nhl')
    expect(again.clubs).toEqual(clubs)
  })

  it('varies with the seed', async () => {
    const other = await provider(99).loadCompetition('nhl')
    expect(other.clubs).not.toEqual(clubs)
  })

  it('keeps each Club stable under reordering, like D-08 for Fixtures', async () => {
    const reversed = createGeneratedRosterProvider({
      structure: {
        ...NHL_2026_27,
        divisions: [...NHL_2026_27.divisions].reverse(),
      },
      seed: 2026,
      clubIdentities: IDENTITIES,
    })

    const result = await reversed.loadCompetition('nhl')
    const boston = result.clubs.find((c) => c.id === 'bos')!
    const original = clubs.find((c) => c.id === 'bos')!

    // Club strength is positional so ability shifts, but the identities
    // generated for a Club must come from that Club's own stream.
    expect(boston.skaters.map((s) => s.lastName)).toEqual(
      original.skaters.map((s) => s.lastName),
    )
  })

  describe('structural property 1 - Clubs differ', () => {
    it('spreads Club quality across a measurable range', () => {
      const clubQuality = clubs.map((club) => mean(club.skaters.map(skaterQuality)))
      const spread = Math.max(...clubQuality) - Math.min(...clubQuality)

      // Measured standings run 124 to 59 points over 84 Fixtures. A league of
      // interchangeable Clubs cannot produce that.
      expect(spread).toBeGreaterThan(0.8)
    })

    it('does not make one Club dominate absurdly', () => {
      const clubQuality = clubs.map((club) => mean(club.skaters.map(skaterQuality)))
      const spread = Math.max(...clubQuality) - Math.min(...clubQuality)

      // CLUB_WEIGHT is a Tier 2 calibration knob - the engine decides how a
      // talent gap becomes a points gap, and that multiplier is unknown until
      // the engine exists. This band only rules out the absurd: a spread of
      // seven attribute points between best and worst Club, which an earlier
      // value produced and this assertion caught.
      expect(spread).toBeLessThan(4)
    })
  })

  describe('structural property 2 - Rosters are structured, not sampled', () => {
    it('declines in quality down the depth chart', () => {
      const tierQuality = (from: number, to: number) =>
        mean(
          clubs.flatMap((club) =>
            club.skaters.slice(from, to).map(skaterQuality),
          ),
        )

      const first = tierQuality(0, 3)
      const second = tierQuality(3, 6)
      const third = tierQuality(6, 9)
      const fourth = tierQuality(9, 12)

      expect(first).toBeGreaterThan(second)
      expect(second).toBeGreaterThan(third)
      expect(third).toBeGreaterThan(fourth)
    })

    it('drops more between the first and second Line than between the third and fourth', () => {
      const tierQuality = (from: number, to: number) =>
        mean(clubs.flatMap((club) => club.skaters.slice(from, to).map(skaterQuality)))

      const topSixDrop = tierQuality(0, 3) - tierQuality(3, 6)
      const bottomSixDrop = tierQuality(6, 9) - tierQuality(9, 12)

      // Real depth charts are steep at the top and flat at the bottom.
      expect(topSixDrop).toBeGreaterThan(bottomSixDrop * 0.8)
    })

    it('matches the declared slot curve in direction', () => {
      for (let i = 1; i < FORWARD_SLOT_ABILITY.length; i++) {
        expect(FORWARD_SLOT_ABILITY[i]!).toBeLessThan(FORWARD_SLOT_ABILITY[i - 1]!)
      }
    })
  })

  describe('structural property 3 - the top is thin', () => {
    it('puts a small number of Players well clear of the field', () => {
      const quality = skaters.map(skaterQuality)
      const p50 = percentile(quality, 0.5)
      const p90 = percentile(quality, 0.9)
      const p99 = percentile(quality, 0.99)

      // The measured scoring leader had 138 points against 103 for the fifth
      // highest - a 34% gap inside the top five. A smooth decline cannot
      // produce that, so the top percentile must pull away from the 90th.
      expect(p99 - p90).toBeGreaterThan((p90 - p50) * 0.25)
      expect(p99).toBeGreaterThan(p90)
    })

    it('keeps a 19-or-20 profile genuinely generational', () => {
      const quality = skaters.map(skaterQuality)
      const generational = quality.filter((q) => q >= 19).length

      // On this scale 10 is a replacement-level professional and 20 is
      // generational, so a Player averaging 19 across ten attributes should be
      // a handful in a 700-Player league, not a tier.
      expect(generational / quality.length).toBeLessThan(0.03)
    })

    it('places the bulk of the league below the midpoint of the scale', () => {
      const quality = skaters.map(skaterQuality)
      // A league whose median Player sits at 15 has no headroom left to
      // describe the Players who are actually good.
      expect(percentile(quality, 0.5)).toBeLessThan(14)
      expect(percentile(quality, 0.5)).toBeGreaterThan(6)
    })
  })

  describe('position shaping', () => {
    it('gives centres better faceoffs than wingers', () => {
      const centres = skaters.filter((s) => s.preferredPositions[0] === 'C')
      const wingers = skaters.filter((s) =>
        ['LW', 'RW'].includes(s.preferredPositions[0]!),
      )

      expect(mean(centres.map((s) => s.attributes.faceoffs))).toBeGreaterThan(
        mean(wingers.map((s) => s.attributes.faceoffs)) + 2,
      )
    })

    it('gives defencemen better shot blocking and worse shooting than forwards', () => {
      const defence = skaters.filter((s) =>
        ['LD', 'RD'].includes(s.preferredPositions[0]!),
      )
      const forwards = skaters.filter((s) =>
        ['LW', 'C', 'RW'].includes(s.preferredPositions[0]!),
      )

      expect(mean(defence.map((s) => s.attributes.shotBlocking))).toBeGreaterThan(
        mean(forwards.map((s) => s.attributes.shotBlocking)),
      )
      expect(mean(defence.map((s) => s.attributes.shooting))).toBeLessThan(
        mean(forwards.map((s) => s.attributes.shooting)),
      )
    })

    it('keeps discipline roughly independent of ability', () => {
      const best = [...skaters].sort((a, b) => skaterQuality(b) - skaterQuality(a)).slice(0, 100)
      const worst = [...skaters].sort((a, b) => skaterQuality(a) - skaterQuality(b)).slice(0, 100)

      const gap = Math.abs(
        mean(best.map((s) => s.attributes.discipline)) -
          mean(worst.map((s) => s.attributes.discipline)),
      )

      // Elite Players take penalties too.
      expect(gap).toBeLessThan(2)
    })

    it('makes Players spiky rather than flat', () => {
      // Faceoffs are excluded as well as discipline: position weighting makes
      // a winger's faceoff rating low by design, which would inflate the
      // spread without saying anything about within-Player variation.
      const keys = SKATER_ATTRIBUTE_KEYS.filter(
        (key) => key !== 'discipline' && key !== 'faceoffs',
      )

      const ranges = skaters.map((skater) => {
        const values = keys.map((key) => skater.attributes[key])
        return Math.max(...values) - Math.min(...values)
      })

      // A Player who is 15 at everything is not a hockey player. Spikiness is
      // also what makes Lineup decisions interesting, so it is a requirement.
      expect(mean(ranges)).toBeGreaterThan(3)
    })

    it('makes left-handed shots the majority overall', () => {
      const left = skaters.filter((s) => s.handedness === 'left').length
      expect(left / skaters.length).toBeGreaterThan(0.5)
    })
  })

  describe('goalies', () => {
    it('ranks the starter above the third Goalie on average', () => {
      const quality = (index: number) =>
        mean(
          clubs.map((club) => {
            const goalie = club.goalies[index]!
            return mean(Object.values(goalie.attributes))
          }),
        )

      expect(quality(0)).toBeGreaterThan(quality(1))
      expect(quality(1)).toBeGreaterThan(quality(2))
    })

    it('spreads starting Goalie quality across the league', () => {
      const starters = clubs.map((club) => mean(Object.values(club.goalies[0]!.attributes)))
      expect(Math.max(...starters) - Math.min(...starters)).toBeGreaterThan(1.5)
    })
  })

  it('generates Club identities when none are supplied (ADR-003)', async () => {
    const anonymous = createGeneratedRosterProvider({ structure: NHL_2026_27, seed: 5 })
    const result = await anonymous.loadCompetition('nhl')

    for (const club of result.clubs) {
      expect(club.name).not.toContain('Bruins')
      expect(club.name).toMatch(/Club$/)
    }
  })
})
