/**
 * NHL 2026-27 competition structure: 32 Clubs, 2 Conferences, 4 Divisions,
 * and the 84-game schedule key.
 *
 * SCOPE (ADR-003): this module describes competition *structure* - how many
 * Clubs, how they are grouped, and how many times each pair meets. That is
 * factual format, not club identity.
 *
 * The real Club names below are a local development and reference dataset.
 * A public build takes its Clubs from the generator, which mirrors this same
 * structure with generated names. Club marks and logos are not used anywhere.
 */

import type { DraftFormat } from '../domain/draft.js'
import type { Conference, CompetitionStructure, Division, ScheduleKey } from '../domain/competition.js'
import type { PlayoffFormat } from '../domain/playoff.js'

/**
 * Confirmed for 2026-27: the regular season expands from 82 to 84 games by
 * adding two divisional games, giving every divisional pair a clean 2 home /
 * 2 away. Per-club totals: 28 divisional + 24 intra-conference + 32
 * non-conference = 84, split exactly 42 home / 42 away.
 */
export const NHL_2026_27_SCHEDULE_KEY: ScheduleKey = {
  divisional: { games: 4, home: 2 },
  intraConference: { games: 3, homeHeavy: 4, awayHeavy: 4 },
  interConference: { games: 2, home: 1 },
}

interface ClubSeed {
  id: string
  code: string
  name: string
}

export const ATLANTIC_CLUBS: readonly ClubSeed[] = [
  { id: 'bos', code: 'BOS', name: 'Boston Bruins' },
  { id: 'buf', code: 'BUF', name: 'Buffalo Sabres' },
  { id: 'det', code: 'DET', name: 'Detroit Red Wings' },
  { id: 'fla', code: 'FLA', name: 'Florida Panthers' },
  { id: 'mtl', code: 'MTL', name: 'Montreal Canadiens' },
  { id: 'ott', code: 'OTT', name: 'Ottawa Senators' },
  { id: 'tbl', code: 'TBL', name: 'Tampa Bay Lightning' },
  { id: 'tor', code: 'TOR', name: 'Toronto Maple Leafs' },
]

export const METROPOLITAN_CLUBS: readonly ClubSeed[] = [
  { id: 'car', code: 'CAR', name: 'Carolina Hurricanes' },
  { id: 'cbj', code: 'CBJ', name: 'Columbus Blue Jackets' },
  { id: 'njd', code: 'NJD', name: 'New Jersey Devils' },
  { id: 'nyi', code: 'NYI', name: 'New York Islanders' },
  { id: 'nyr', code: 'NYR', name: 'New York Rangers' },
  { id: 'phi', code: 'PHI', name: 'Philadelphia Flyers' },
  { id: 'pit', code: 'PIT', name: 'Pittsburgh Penguins' },
  { id: 'wsh', code: 'WSH', name: 'Washington Capitals' },
]

export const CENTRAL_CLUBS: readonly ClubSeed[] = [
  { id: 'chi', code: 'CHI', name: 'Chicago Blackhawks' },
  { id: 'col', code: 'COL', name: 'Colorado Avalanche' },
  { id: 'dal', code: 'DAL', name: 'Dallas Stars' },
  { id: 'min', code: 'MIN', name: 'Minnesota Wild' },
  { id: 'nsh', code: 'NSH', name: 'Nashville Predators' },
  { id: 'stl', code: 'STL', name: 'St. Louis Blues' },
  { id: 'uta', code: 'UTA', name: 'Utah Mammoth' },
  { id: 'wpg', code: 'WPG', name: 'Winnipeg Jets' },
]

export const PACIFIC_CLUBS: readonly ClubSeed[] = [
  { id: 'ana', code: 'ANA', name: 'Anaheim Ducks' },
  { id: 'cgy', code: 'CGY', name: 'Calgary Flames' },
  { id: 'edm', code: 'EDM', name: 'Edmonton Oilers' },
  { id: 'lak', code: 'LAK', name: 'Los Angeles Kings' },
  { id: 'sjs', code: 'SJS', name: 'San Jose Sharks' },
  { id: 'sea', code: 'SEA', name: 'Seattle Kraken' },
  { id: 'van', code: 'VAN', name: 'Vancouver Canucks' },
  { id: 'vgk', code: 'VGK', name: 'Vegas Golden Knights' },
]

export const NHL_2026_27_CLUB_SEEDS: readonly ClubSeed[] = [
  ...ATLANTIC_CLUBS,
  ...METROPOLITAN_CLUBS,
  ...CENTRAL_CLUBS,
  ...PACIFIC_CLUBS,
]

const DIVISIONS: readonly Division[] = [
  {
    id: 'atlantic',
    name: 'Atlantic',
    conferenceId: 'eastern',
    clubIds: ATLANTIC_CLUBS.map((club) => club.id),
  },
  {
    id: 'metropolitan',
    name: 'Metropolitan',
    conferenceId: 'eastern',
    clubIds: METROPOLITAN_CLUBS.map((club) => club.id),
  },
  {
    id: 'central',
    name: 'Central',
    conferenceId: 'western',
    clubIds: CENTRAL_CLUBS.map((club) => club.id),
  },
  {
    id: 'pacific',
    name: 'Pacific',
    conferenceId: 'western',
    clubIds: PACIFIC_CLUBS.map((club) => club.id),
  },
]

const CONFERENCES: readonly Conference[] = [
  { id: 'eastern', name: 'Eastern', divisionIds: ['atlantic', 'metropolitan'] },
  { id: 'western', name: 'Western', divisionIds: ['central', 'pacific'] },
]

/**
 * The current NHL playoff format: 16 Clubs, the top three of each division
 * plus two wild cards per conference, four best-of-seven rounds, fixed
 * brackets with no reseeding.
 *
 * Declared as data so that other leagues can declare their own without
 * touching the engine (see `domain/playoff.ts`).
 */
export const NHL_PLAYOFF_FORMAT: PlayoffFormat = {
  id: 'nhl-divisional',
  name: 'NHL divisional bracket with wild cards',
  qualification: [
    { kind: 'division-top', count: 3 },
    { kind: 'conference-wildcard', count: 2 },
  ],
  bracket: 'nhl-divisional',
  winsPerRound: [4, 4, 4, 4],
  reseedEachRound: false,
  overtime: 'sudden-death-5on5',
  venuePattern: '2-2-1-1-1',
  // Every second day, so no game is a back-to-back. Unmeasured.
  daysBetweenFixtures: 2,
}

/**
 * The NHL entry draft (ADR-024, ADR-028), with 4 rounds to begin with rather
 * than 7: rounds 5 to 7 yield few regulars, and the undrafted fill stands in for
 * them. The lottery is the NHL's since 2022, without its rule that a Club may not
 * win twice in five years.
 */
export const NHL_DRAFT_FORMAT: DraftFormat = {
  id: 'nhl-entry-draft',
  name: 'NHL entry draft, four rounds',
  rounds: 4,
  classSize: 1.5,
  rightsSeasons: 4,
  lottery: {
    odds: [18.5, 13.5, 11.5, 9.5, 8.5, 7.5, 6.5, 6, 5, 3.5, 3, 2.5, 2, 1.5, 0.5, 0.5],
    draws: 2,
    maxJump: 10,
  },
  deepRunsLast: 2,
}

export const NHL_2026_27: CompetitionStructure = {
  id: 'nhl',
  name: 'National Hockey League',
  season: '2026-27',
  conferences: CONFERENCES,
  divisions: DIVISIONS,
  scheduleKey: NHL_2026_27_SCHEDULE_KEY,
  // Lands on the measured 16.6% of gaps being back-to-backs (04-validation-targets.md).
  calendar: { daysPerRound: 2, lastDayShare: 0.21, daysPerYear: 365 },
  overtime: 'regular-3on3-then-shootout',
}
