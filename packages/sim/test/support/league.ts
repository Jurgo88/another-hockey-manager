import type { CompetitionStructure, SeasonFormat } from '../../src/domain/competition.js'

/**
 * A small Competition for tests that need a Season only as an input (ADR-014
 * amendment, #106): 8 Clubs in two Conferences of two Divisions, 18 Fixtures
 * each, a two-round bracket of four and a one-round draft. A Season of it plays
 * in a fraction of the time of the NHL's. Tests of the NHL's own shape keep the
 * NHL.
 */

const clubs = (division: string) => [`${division}-1`, `${division}-2`]

export const SMALL_LEAGUE: CompetitionStructure = {
  id: 'small',
  name: 'Small League',
  season: 'test',
  conferences: [
    { id: 'east', name: 'East', divisionIds: ['north', 'south'] },
    { id: 'west', name: 'West', divisionIds: ['lake', 'peak'] },
  ],
  divisions: [
    { id: 'north', name: 'North', conferenceId: 'east', clubIds: clubs('north') },
    { id: 'south', name: 'South', conferenceId: 'east', clubIds: clubs('south') },
    { id: 'lake', name: 'Lake', conferenceId: 'west', clubIds: clubs('lake') },
    { id: 'peak', name: 'Peak', conferenceId: 'west', clubIds: clubs('peak') },
  ],
  // 1 divisional opponent x 4, 2 in the Conference x 3, 4 across it x 2: 18 Fixtures.
  scheduleKey: {
    divisional: { games: 4, home: 2 },
    intraConference: { games: 3, homeHeavy: 1, awayHeavy: 1 },
    interConference: { games: 2, home: 1 },
  },
  calendar: { daysPerRound: 2, lastDayShare: 0.21, daysPerYear: 365 },
  overtime: 'regular-3on3-then-shootout',
}

export const SMALL_SEASON: SeasonFormat = {
  structure: SMALL_LEAGUE,
  playoffs: {
    id: 'small-bracket',
    name: 'Top four, two rounds',
    qualification: [{ kind: 'league-top', count: 4 }],
    bracket: 'league-seeded',
    winsPerRound: [2, 2],
    reseedEachRound: false,
    overtime: 'sudden-death-5on5',
    venuePattern: '2-2-1-1-1',
    daysBetweenFixtures: 2,
  },
  draft: {
    id: 'small-draft',
    name: 'One round',
    rounds: 1,
    classSize: 1.5,
    rightsSeasons: 4,
    lottery: { odds: [50, 30, 15, 5], draws: 1, maxJump: 3 },
    deepRunsLast: 1,
  },
}
