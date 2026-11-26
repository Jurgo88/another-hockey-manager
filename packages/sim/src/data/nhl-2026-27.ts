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

import type { CapRules } from '../domain/contract.js'
import type { DraftFormat } from '../domain/draft.js'
import type { FarmLeague, FarmRules } from '../domain/farm.js'
import type {
  Conference,
  CompetitionStructure,
  Division,
  ScheduleKey,
  SeasonFormat,
} from '../domain/competition.js'
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

const NHL_CAP_2026_27 = 104_000_000

/**
 * The NHL's contract rules for 2026-27 (ADR-030): the cap, the minimum salary of
 * $850,000, the maximum of 20% of the cap, and an entry-level contract at its
 * maximum, the minimum plus $175,000. Entry-level length by age at signing as
 * the CBA sets it, restricted free agency until 27, and the longest contract
 * since September 2026: 7 Seasons with the Player's own Club, 6 with another.
 * The floor of $76.9M, buyouts at two thirds of what is left (one third under
 * 26) over twice the Seasons left, and the playoff cap on the dressed Lineup
 * from the 2026 playoffs (ADR-031). A contract on the farm counts only above
 * the minimum plus $375,000 (CBA 50.5, ADR-036).
 */
export const NHL_CAP_RULES: CapRules = {
  upperLimit: NHL_CAP_2026_27,
  lowerLimit: 76_900_000 / NHL_CAP_2026_27,
  buyout: { fraction: 2 / 3, youngFraction: 1 / 3, youngUnder: 26, spread: 2 },
  playoffs: 'dressed',
  minimum: 850_000 / NHL_CAP_2026_27,
  maximum: 0.2,
  entryLevel: {
    capHit: 1_025_000 / NHL_CAP_2026_27,
    terms: [
      { upToAge: 21, years: 3 },
      { upToAge: 23, years: 2 },
      { upToAge: 99, years: 1 },
    ],
    // Signed at 18, two Seasons may slide, at 19 one (CBA 9.1(d)).
    slide: {
      games: 10,
      seasons: [
        { upToAge: 18, seasons: 2 },
        { upToAge: 19, seasons: 1 },
      ],
    },
  },
  restrictedUntil: 27,
  maxTerm: { ownClub: 7, otherClub: 6 },
  buried: (850_000 + 375_000) / NHL_CAP_2026_27,
  longTermInjury: { days: 24, fixtures: 10 },
  // The minimum plus $100,000 as the CBA of 2013 has it; the memorandum of 2025
  // revises the threshold in an attachment not read (#133).
  rosterEmergency: { maxCapHit: (850_000 + 100_000) / NHL_CAP_2026_27 },
  retention: { maxShare: 0.5, maxContracts: 3 },
}

/**
 * The affiliates' league of the NHL (ADR-036, #135). The AHL plays 72 Fixtures,
 * most of them within its Division; mirrored on the NHL's alignment that is 8
 * against each divisional opponent and 2 against each other Club of the
 * Conference, none across. A round every second day, as the NHL's calendar has
 * it, makes 144 days; starting on day 24 it ends as the NHL's regular Season
 * does, 168 days from its first. An affiliate holds 14 forwards, 8 defencemen
 * and 3 Goalies, an estimate of an AHL Roster. A Player sent down plays a farm
 * Fixture before he is recalled (the memorandum of 2025, item 30, as the author
 * summarised it; its text was not read).
 */
export const NHL_FARM_LEAGUE: FarmLeague = {
  scheduleKey: {
    divisional: { games: 8, home: 4 },
    intraConference: { games: 2, homeHeavy: 0, awayHeavy: 0 },
    interConference: { games: 0, home: 0 },
  },
  calendar: { daysPerRound: 2, lastDayShare: 0.21, daysPerYear: 365, firstDay: 24 },
  roster: { forward: 14, defence: 8, goalie: 3 },
  fixturesBeforeRecall: 1,
}

/**
 * The NHL's farm rules for 2026-27 (ADR-036), from the CBA of 2013 as the
 * memoranda of 2020 and 2025 left it: an active Roster of 23 (16.4), 50
 * contracts (Article 10), Injured Reserve from 7 days (16.11), emergency
 * call-ups below 2 Goalies, 6 defencemen and 12 forwards fit (13.12(m)).
 *
 * The exemption from waivers as 13.4 tables it, Skaters and Goalies apart, NHL
 * games counting the playoffs. A Player who signs at 18 or 19 has his Seasons
 * cut to 3, a Goalie to 4, from the first Season in which he plays 11 NHL games
 * or more. 13.4 counts a young Player's Seasons from his signing and an older
 * one's from his first professional game; in a league whose farm plays, every
 * Season under contract is professional, so both count from the first Season
 * under contract.
 */
export const NHL_FARM_RULES: FarmRules = {
  activeMax: 23,
  // Players under 20 play in the junior leagues, not the minors (CBA 9.1(d)(iv)).
  loanedUntil: 20,
  contractsMax: 50,
  injuredReserveDays: 7,
  emergency: { forward: 12, defence: 6, goalie: 2 },
  waivers: {
    exemption: {
      skaters: [
        { age: 18, seasons: 5, games: 160 },
        { age: 19, seasons: 4, games: 160 },
        { age: 20, seasons: 3, games: 160 },
        { age: 21, seasons: 3, games: 80 },
        { age: 22, seasons: 3, games: 70 },
        { age: 23, seasons: 3, games: 60 },
        { age: 24, seasons: 2, games: 60 },
        { age: 25, seasons: 1, games: null },
      ],
      goalies: [
        { age: 18, seasons: 6, games: 80 },
        { age: 19, seasons: 5, games: 80 },
        { age: 20, seasons: 4, games: 80 },
        { age: 21, seasons: 4, games: 60 },
        { age: 22, seasons: 4, games: 60 },
        { age: 23, seasons: 3, games: 60 },
        { age: 24, seasons: 2, games: 60 },
        { age: 25, seasons: 1, games: null },
      ],
      youngUpTo: 19,
      shortenAfter: 11,
      shortened: { skaters: 3, goalies: 4 },
    },
    claimDays: 1,
    // Until 1 November, about 25 days into a regular Season that opens in October.
    priorTableDays: 25,
    reWaiver: { days: 30, games: 10 },
  },
  // The 40th day before the last of the regular Season (13.12(j)); five regular
  // call-ups from it, at most four up at once (the memorandum of 2025, item 16).
  deadline: { daysBeforeEnd: 40, recalls: 5, onRoster: 4 },
  league: NHL_FARM_LEAGUE,
}

/** A Season of the NHL 2026-27: its alignment, bracket, draft, contracts and farm. */
export const NHL_2026_27_SEASON: SeasonFormat = {
  structure: NHL_2026_27,
  playoffs: NHL_PLAYOFF_FORMAT,
  draft: NHL_DRAFT_FORMAT,
  cap: NHL_CAP_RULES,
  farm: NHL_FARM_RULES,
}
