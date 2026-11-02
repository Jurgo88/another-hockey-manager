import {
  NHL_2026_27,
  NHL_2026_27_CLUB_SEEDS,
  SKATER_ATTRIBUTE_KEYS,
  advanceDay,
  buildNaiveLineup,
  createFileRosterProvider,
  readRosterFile,
  startSeason,
  writeRosterFile,
  type CompetitionRosters,
  type Skater,
} from '@ahm/sim'
import { beforeAll, describe, expect, it } from 'vitest'
import { ageOn, chooseRosters, estimateRosters } from '../src/estimate.js'
import { buildReference, groupOf, quantile, type Reference } from '../src/reference.js'
import { fixtureSeason } from './fixture.js'

const OPTIONS = { structure: NHL_2026_27, clubs: NHL_2026_27_CLUB_SEEDS, ageDate: '2025-10-01' }

let reference: Reference
let rosters: CompetitionRosters
const records = fixtureSeason()

beforeAll(() => {
  reference = buildReference()
  rosters = estimateRosters(records, { ...OPTIONS, reference })
})

const realSkaters = () =>
  rosters.clubs.flatMap((c) => c.skaters).filter((s) => s.id.startsWith('nhl-'))
const recordOf = (skater: Skater) => records.skaters.find((r) => `nhl-${r.playerId}` === skater.id)!

describe('estimated Rosters', () => {
  it('make a valid roster file that reads back unchanged (ADR-020)', () => {
    expect(readRosterFile(writeRosterFile(rosters), NHL_2026_27)).toEqual(rosters)
  })

  it('give every Club a Lineup the naive builder can dress', () => {
    for (const club of rosters.clubs) expect(() => buildNaiveLineup(club)).not.toThrow()
  })

  it('play a Season day', async () => {
    const season = await startSeason(1, createFileRosterProvider(writeRosterFile(rosters), NHL_2026_27))
    expect(advanceDay(season).played.length).toBeGreaterThan(0)
  })

  it('come out the same every time', () => {
    expect(estimateRosters(records, { ...OPTIONS, reference })).toEqual(rosters)
  })
})

describe('provenance (D-11)', () => {
  it('marks every attribute, and never derives what has no public source (R-07)', () => {
    for (const skater of realSkaters()) {
      expect(Object.keys(skater.provenance!)).toHaveLength(SKATER_ATTRIBUTE_KEYS.length)
      for (const key of ['checking', 'defPositioning', 'shotBlocking'] as const) {
        expect(skater.provenance![key]).toMatchObject({ source: 'generated', confidence: 0.25 })
      }
      expect(skater.provenance!.speed.source).toBe('measured')
    }
  })

  it('keeps derived values at or below 0.5, and trusts a short season less', () => {
    const skaters = realSkaters()
    for (const skater of skaters) {
      for (const entry of Object.values(skater.provenance!)) {
        if (entry.source === 'derived') expect(entry.confidence).toBeLessThanOrEqual(0.5)
      }
    }
    const regular = skaters.find((s) => recordOf(s).matchesPlayed >= 70)!
    const callUp = skaters.find((s) => recordOf(s).matchesPlayed <= 5)!
    expect(callUp.provenance!.passing.confidence).toBeLessThan(regular.provenance!.passing.confidence)
  })

  it('measures faceoffs only for forwards with enough draws', () => {
    for (const skater of realSkaters()) {
      const record = recordOf(skater)
      const measured = skater.provenance!.faceoffs.source === 'measured'
      expect(measured).toBe(record.position !== 'D' && record.faceoffsTaken >= 100)
    }
  })
})

describe('the scale (ADR-021)', () => {
  it('keeps the generator distribution: the fastest in a group gets the top value', () => {
    for (const group of ['C', 'W', 'D'] as const) {
      const pool = realSkaters().filter((s) => groupOf(s.preferredPositions[0]!) === group)
      const fastest = pool.reduce((a, b) =>
        recordOf(a).edge!.topSpeed! > recordOf(b).edge!.topSpeed! ? a : b,
      )
      const values = pool.map((s) => s.attributes.speed)
      expect(fastest.attributes.speed).toBe(Math.max(...values))

      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const sorted = reference.attributes[group].speed
      const referenceMean = sorted.reduce((a, b) => a + b, 0) / sorted.length
      expect(Math.abs(mean - referenceMean)).toBeLessThan(0.4)
    }
  })

  it('pulls a few Fixtures of hot play towards the Player`s ice-time level', () => {
    const centres = realSkaters().filter((s) => s.preferredPositions[0] === 'C')
    const callUp = centres.reduce((a, b) => (recordOf(a).matchesPlayed <= recordOf(b).matchesPlayed ? a : b))
    const regular = centres.find((s) => recordOf(s).matchesPlayed >= 70)!
    // Both get the best primary-assist rate in the league.
    const hot = (r: (typeof records.skaters)[number]) => ({
      ...r,
      primaryAssists5v5: Math.round(((r.toi5v5PerMatch * r.matchesPlayed) / 3600) * 5),
    })
    const lucky = estimateRosters(
      {
        ...records,
        skaters: records.skaters.map((r) =>
          `nhl-${r.playerId}` === callUp.id || `nhl-${r.playerId}` === regular.id ? hot(r) : r,
        ),
      },
      { ...OPTIONS, reference },
    )
    const after = new Map(lucky.clubs.flatMap((c) => c.skaters).map((s) => [s.id, s]))

    expect(recordOf(callUp).matchesPlayed).toBeLessThanOrEqual(10)
    expect(after.get(regular.id)!.attributes.passing).toBeGreaterThanOrEqual(
      quantile(reference.attributes.C.passing, 0.9),
    )
    expect(after.get(callUp.id)!.attributes.passing).toBeLessThan(
      quantile(reference.attributes.C.passing, 0.6),
    )
  })

  it('never puts potential below the level (ADR-020)', () => {
    for (const club of rosters.clubs) {
      for (const skater of club.skaters) {
        const level =
          ['shooting', 'passing', 'puckControl', 'offPositioning', 'checking', 'defPositioning', 'shotBlocking', 'speed', 'stamina']
            .map((k) => skater.attributes[k as keyof Skater['attributes']])
            .reduce((a, b) => a + b, 0) / 9
        expect(skater.potential).toBeGreaterThanOrEqual(Math.round(level))
      }
    }
  })
})

describe('choosing a Roster', () => {
  it('keeps 16 forwards, 10 defencemen and 3 Goalies by ice time at the Club', () => {
    for (const club of chooseRosters(records, NHL_2026_27_CLUB_SEEDS)) {
      expect([club.forwards.length, club.defence.length, club.goalies.length]).toEqual([16, 10, 3])
      const ice = club.forwards.map((p) => p.stint.timeOnIce)
      expect(ice).toEqual([...ice].sort((a, b) => b - a))
    }
  })

  it('puts a traded Player with the Club he played most for', () => {
    const traded = records.skaters[0]!
    const other = NHL_2026_27_CLUB_SEEDS[5]!
    const stints = [
      ...records.stints.map((s) =>
        s.playerId === traded.playerId ? { ...s, matchesPlayed: 10, timeOnIce: 10 * 1200 } : s,
      ),
      {
        clubCode: other.code,
        playerId: traded.playerId,
        firstName: 'First',
        lastName: 'Traded',
        goalie: false,
        matchesPlayed: 60,
        timeOnIce: 60 * 1200,
      },
    ]
    const chosen = chooseRosters({ ...records, stints }, NHL_2026_27_CLUB_SEEDS)
    const home = chosen.find((c) => c.club.code === other.code)!
    expect([...home.forwards, ...home.defence].map((p) => p.record.playerId)).toContain(traded.playerId)
  })

  it('fills a Club short of Goalies with generated ones', () => {
    const short = estimateRosters(fixtureSeason({ goaliesPerClub: 2 }), { ...OPTIONS, reference })
    for (const club of short.clubs) {
      expect(club.goalies).toHaveLength(3)
      const fill = club.goalies.find((g) => !g.id.startsWith('nhl-'))!
      expect(fill.provenance!.reflexes).toEqual({ source: 'generated', confidence: 0.25 })
    }
  })

  it('takes age from the date of birth', () => {
    expect(ageOn('1997-01-13', '2025-10-01')).toBe(28)
    expect(ageOn('1997-10-01', '2025-10-01')).toBe(28)
    expect(ageOn('1997-10-02', '2025-10-01')).toBe(27)
  })
})

describe('generated fill', () => {
  it('never becomes the starting Goalie', () => {
    const short = estimateRosters(fixtureSeason({ goaliesPerClub: 2 }), { ...OPTIONS, reference })
    for (const club of short.clubs) {
      expect(buildNaiveLineup(club).starter.startsWith('nhl-')).toBe(true)
    }
  })
})
