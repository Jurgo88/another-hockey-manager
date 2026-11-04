import { beforeAll, describe, expect, it } from 'vitest'
import { gamesPerClub } from '../src/domain/competition.js'
import type { Fixture } from '../src/domain/fixture.js'
import type { ClubId } from '../src/domain/player.js'
import { NHL_2026_27, NHL_2026_27_CLUB_SEEDS } from '../src/data/nhl-2026-27.js'
import { countMeetings, generateSchedule } from '../src/engine/schedule.js'
import { createRng } from '../src/rng/index.js'

const CLUB_IDS = NHL_2026_27_CLUB_SEEDS.map((club) => club.id)

const divisionOf = (clubId: ClubId) =>
  NHL_2026_27.divisions.find((division) => division.clubIds.includes(clubId))!

const conferenceOf = (clubId: ClubId) => divisionOf(clubId).conferenceId

describe('NHL 2026-27 structure', () => {
  it('has 32 Clubs in 4 divisions of 8 across 2 conferences', () => {
    expect(CLUB_IDS).toHaveLength(32)
    expect(new Set(CLUB_IDS).size).toBe(32)
    expect(NHL_2026_27.conferences).toHaveLength(2)
    expect(NHL_2026_27.divisions).toHaveLength(4)
    for (const division of NHL_2026_27.divisions) {
      expect(division.clubIds).toHaveLength(8)
    }
  })

  it('has unique Club codes', () => {
    const codes = NHL_2026_27_CLUB_SEEDS.map((club) => club.code)
    expect(new Set(codes).size).toBe(32)
  })

  it('assigns every division to a declared conference', () => {
    for (const division of NHL_2026_27.divisions) {
      const conference = NHL_2026_27.conferences.find((c) => c.id === division.conferenceId)
      expect(conference).toBeDefined()
      expect(conference!.divisionIds).toContain(division.id)
    }
  })

  it('implies 84 games per Club from the schedule key', () => {
    expect(gamesPerClub(NHL_2026_27.scheduleKey, 8, 16)).toBe(84)
  })
})

describe('the calendar (ADR-010)', () => {
  const fixtures = generateSchedule({
    structure: NHL_2026_27,
    seasonId: 's1',
    rng: createRng(7),
  })
  const daysOf = (clubId: ClubId) =>
    fixtures
      .filter((f) => f.homeClubId === clubId || f.awayClubId === clubId)
      .map((f) => f.day)
      .sort((a, b) => a - b)

  it('keeps each Fixture inside its round', () => {
    const { daysPerRound } = NHL_2026_27.calendar
    for (const fixture of fixtures) {
      expect(Math.floor(fixture.day / daysPerRound)).toBe(fixture.round)
    }
  })

  it('leaves one to three days between two Fixtures of a Club', () => {
    for (const clubId of CLUB_IDS) {
      const days = daysOf(clubId)
      for (let i = 1; i < days.length; i++) {
        const gap = days[i]! - days[i - 1]!
        expect(gap).toBeGreaterThanOrEqual(1)
        expect(gap).toBeLessThanOrEqual(3)
      }
    }
  })

  it('never has a Club play three days running', () => {
    for (const clubId of CLUB_IDS) {
      const days = daysOf(clubId)
      for (let i = 2; i < days.length; i++) {
        expect(days[i]! - days[i - 2]!).toBeGreaterThan(2)
      }
    }
  })

  it('reads the calendar as data (D-10)', () => {
    const everyFixtureEarly = generateSchedule({
      structure: { ...NHL_2026_27, calendar: { ...NHL_2026_27.calendar, daysPerRound: 3, lastDayShare: 0 } },
      seasonId: 's1',
      rng: createRng(7),
    })
    expect(everyFixtureEarly.every((f) => f.day === f.round * 3)).toBe(true)
  })
})

describe('generateSchedule', () => {
  let fixtures: Fixture[]

  beforeAll(() => {
    fixtures = generateSchedule({
      structure: NHL_2026_27,
      seasonId: '2026-27',
      rng: createRng(20262027),
    })
  })

  it('produces 1344 Fixtures', () => {
    // 32 Clubs x 84 games / 2
    expect(fixtures).toHaveLength(1344)
  })

  it('gives every Club exactly 84 Fixtures, 42 home and 42 away', () => {
    for (const clubId of CLUB_IDS) {
      const home = fixtures.filter((f) => f.homeClubId === clubId).length
      const away = fixtures.filter((f) => f.awayClubId === clubId).length
      expect({ clubId, home, away, total: home + away }).toEqual({
        clubId,
        home: 42,
        away: 42,
        total: 84,
      })
    }
  })

  it('never schedules a Club against itself', () => {
    for (const fixture of fixtures) {
      expect(fixture.homeClubId).not.toBe(fixture.awayClubId)
    }
  })

  it('runs 84 rounds of 16 Fixtures', () => {
    const rounds = new Map<number, Fixture[]>()
    for (const fixture of fixtures) {
      const bucket = rounds.get(fixture.round) ?? []
      bucket.push(fixture)
      rounds.set(fixture.round, bucket)
    }

    expect(rounds.size).toBe(84)
    for (const [round, bucket] of rounds) {
      expect({ round, size: bucket.length }).toEqual({ round, size: 16 })
    }
  })

  it('never has a Club playing twice in the same round', () => {
    const seen = new Map<number, Set<ClubId>>()

    for (const fixture of fixtures) {
      const clubs = seen.get(fixture.round) ?? new Set<ClubId>()
      expect(clubs.has(fixture.homeClubId)).toBe(false)
      expect(clubs.has(fixture.awayClubId)).toBe(false)
      clubs.add(fixture.homeClubId)
      clubs.add(fixture.awayClubId)
      seen.set(fixture.round, clubs)
    }
  })

  it('gives every Club a unique Fixture id', () => {
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length)
  })

  describe('the 84-game key', () => {
    it('meets divisional opponents 4 times, 2 home and 2 away', () => {
      for (const clubId of CLUB_IDS) {
        const counts = countMeetings(fixtures, clubId)
        const opponents = divisionOf(clubId).clubIds.filter((id) => id !== clubId)

        expect(opponents).toHaveLength(7)
        for (const opponent of opponents) {
          expect({ clubId, opponent, ...counts.get(opponent) }).toEqual({
            clubId,
            opponent,
            games: 4,
            home: 2,
            away: 2,
          })
        }
      }
    })

    it('meets cross-division conference opponents 3 times, home-heavy against exactly 4', () => {
      for (const clubId of CLUB_IDS) {
        const counts = countMeetings(fixtures, clubId)
        const ownDivision = divisionOf(clubId).id
        const opponents = CLUB_IDS.filter(
          (id) => conferenceOf(id) === conferenceOf(clubId) && divisionOf(id).id !== ownDivision,
        )

        expect(opponents).toHaveLength(8)

        let homeHeavy = 0
        let awayHeavy = 0

        for (const opponent of opponents) {
          const count = counts.get(opponent)!
          expect({ clubId, opponent, games: count.games }).toEqual({
            clubId,
            opponent,
            games: 3,
          })
          if (count.home === 2 && count.away === 1) homeHeavy++
          else if (count.home === 1 && count.away === 2) awayHeavy++
          else throw new Error(`${clubId} vs ${opponent}: unexpected split ${count.home}-${count.away}`)
        }

        expect({ clubId, homeHeavy, awayHeavy }).toEqual({ clubId, homeHeavy: 4, awayHeavy: 4 })
      }
    })

    it('meets non-conference opponents twice, once at each venue', () => {
      for (const clubId of CLUB_IDS) {
        const counts = countMeetings(fixtures, clubId)
        const opponents = CLUB_IDS.filter((id) => conferenceOf(id) !== conferenceOf(clubId))

        expect(opponents).toHaveLength(16)
        for (const opponent of opponents) {
          expect({ clubId, opponent, ...counts.get(opponent) }).toEqual({
            clubId,
            opponent,
            games: 2,
            home: 1,
            away: 1,
          })
        }
      }
    })

    it('faces every other Club at least twice', () => {
      for (const clubId of CLUB_IDS) {
        const counts = countMeetings(fixtures, clubId)
        expect(counts.size).toBe(31)
      }
    })
  })

  it('is deterministic for a given seed', () => {
    const again = generateSchedule({
      structure: NHL_2026_27,
      seasonId: '2026-27',
      rng: createRng(20262027),
    })
    expect(again).toEqual(fixtures)
  })

  it('varies matchday order with the seed', () => {
    const other = generateSchedule({
      structure: NHL_2026_27,
      seasonId: '2026-27',
      rng: createRng(1),
    })
    expect(other).not.toEqual(fixtures)
    // but the key still holds
    for (const clubId of CLUB_IDS) {
      const counts = countMeetings(other, clubId)
      expect(counts.size).toBe(31)
      expect([...counts.values()].reduce((sum, c) => sum + c.games, 0)).toBe(84)
    }
  })
})
