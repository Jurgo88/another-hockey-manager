import { farmOf, type Club, type Lineup, type Tactics } from '../domain/club.js'
import {
  gamesPerClub,
  type CompetitionStructure,
  type SeasonFormat,
} from '../domain/competition.js'
import type {
  CapRules,
  Contract,
  DeadMoney,
  Offer,
  OfferViolation,
  ReSigning,
  ReSigningViolation,
} from '../domain/contract.js'
import type { MatchEvent } from '../domain/event.js'
import type { FarmRules } from '../domain/farm.js'
import type { Fixture, FixtureChange, FixtureId, FixtureInput } from '../domain/fixture.js'
import type {
  DraftFormat,
  DraftPick,
  MovesViolation,
  Prospect,
  RosterMoves,
} from '../domain/draft.js'
import {
  isGoalie,
  naturalPosition,
  playerLevel,
  positionGroup,
  type ClubId,
  type Goalie,
  type Player,
  type PlayerId,
  type PositionGroup,
  type Service,
  type Skater,
} from '../domain/player.js'
import type { PlayoffFormat, PlayoffState } from '../domain/playoff.js'
import { ACTIVE_SIZE, ROSTER_SHAPE, type RosterProvider } from '../domain/roster.js'
import type { StandingsRow } from '../domain/standings.js'
import { NHL_2026_27_CLUB_SEEDS, NHL_2026_27_SEASON } from '../data/nhl-2026-27.js'
import {
  affiliateOf,
  affiliateStructure,
  formSwaps,
  parentOf,
  afterFarmMoves,
  assignedClub,
  withActive,
  claimOrder,
  contractedOf,
  firstService,
  regularOnFarm,
  type DeadlineDay,
  openingService,
  serviceAfter,
  waiverExempt,
  wantsClaim,
  DRESSED,
  DRESSING_MINIMUM,
  farmMoves,
  type FarmMove,
} from '../farm/index.js'
import { develop, expectedLevel } from '../develop/index.js'
import {
  applyMoves,
  draftOrder,
  generateClass,
  continuePicks,
  describeMovesViolation,
  onTheClock,
  takePick,
  naturalOf,
  type Natural,
  movesViolations,
  openingProspects,
  assistantMoves,
  type MoveLimits,
} from '../draft/index.js'
import { afterRest } from '../engine/fatigue.js'
import {
  afterStart,
  buildNaiveLineup,
  lineupForFixture,
  validateLineup,
  withoutInjured,
  type GoalieHistory,
  type LineupViolation,
} from '../engine/lineup.js'
import {
  afterRound,
  afterSeriesFixture,
  nextSeriesFixtures,
  startPlayoffs,
} from '../engine/playoff.js'
import { generateSchedule } from '../engine/schedule.js'
import { fixtureSeed, simulateFixture } from '../engine/simulate.js'
import { gaussian } from '../rng/index.js'
import { statusOnExpiry } from '../domain/contract.js'
import {
  askingContract,
  atFloor,
  buyout,
  deadCharge,
  entryLevelContract,
  minimumContract,
  openingContracts,
  payroll,
  placesOf,
  tickedContracts,
  tickedDeadMoney,
  type Place,
} from '../generate/contracts.js'
import { createGeneratedRosterProvider } from '../generate/roster.js'
import {
  departures as leaving,
  filledRoster,
  filledRosterAt,
  generatedFreeAgents,
  roles,
  type Departure,
  type SeasonUsage,
} from '../leave/index.js'
import { createRng, type Rng } from '../rng/index.js'
import type { SeasonRecord } from '../stats/history.js'
import { foldMatch, type MatchStats } from '../stats/match.js'
import { foldTotals, NO_TOTALS, type SeasonTotals } from '../stats/season.js'
import {
  foldRecent,
  formOf,
  leagueRates,
  type League,
  type LeagueRates,
  type Recent,
} from '../stats/form.js'
import { foldStandings } from '../stats/standings.js'

/**
 * A Season played one calendar day at a time (ADR-014). Everything here is a
 * pure step from one `SeasonState` to the next, so a caller can stop after any
 * day, store the state as JSON and carry on later with the same results.
 *
 * Fixtures play in calendar order, because each Skater carries fatigue from one
 * to the next (FR-14, ADR-010): the fold of a Match, less the rest since, is
 * what the following `FixtureInput` starts from.
 */

/**
 * Plain JSON. The random numbers need no storing: every Fixture forks its own
 * stream from `seed` (D-08), and the rest is folded from Fixtures already played.
 */
export interface SeasonState {
  seed: number
  structure: CompetitionStructure
  playoffFormat: PlayoffFormat
  draftFormat: DraftFormat
  /** What contracts are made to (ADR-030). */
  capRules: CapRules
  /** What a Club's active Roster and farm are kept to (ADR-036). */
  farmRules: FarmRules
  /** Every rostered Player holds a contract (#125), on the active Roster or the farm (ADR-036). */
  clubs: readonly Club[]
  /** Each Club's declared Lineup. What a Fixture gets is this, less injuries and rotation. */
  lineups: Readonly<Record<ClubId, Lineup>>
  /** In calendar order. Playoff games join as they become due. */
  fixtures: readonly Fixture[]
  /** Index in `fixtures` of the next Fixture to play. */
  nextFixture: number
  /** Where the last Match left each Skater who has played, 0-100. */
  fatigue: Readonly<Record<PlayerId, number>>
  /** The last day each Club played. */
  lastPlayed: Readonly<Record<ClubId, number>>
  goalieHistory: Readonly<Record<ClubId, GoalieHistory>>
  /**
   * The day each injured Player is back, folded from the stream (#97): out for
   * every Fixture before it, however many the Club plays meanwhile.
   */
  absent: Readonly<Record<PlayerId, number>>
  /**
   * Those out long enough to go on Injured Reserve (CBA 16.11, ADR-036): they
   * stay on their Club's active Roster without counting against its limit,
   * until they are back.
   */
  injuredReserve: Readonly<Record<PlayerId, true>>
  /** Players on waivers, off their Club's Roster until claimed or cleared (ADR-036). */
  waivers: readonly OnWaivers[]
  /**
   * Players who cleared waivers this Season and may go down again without them
   * until the rules' days on an active Roster or NHL games run out (CBA 13.5).
   */
  cleared: Readonly<Record<PlayerId, Cleared>>
  /** Each Club's declared claims on Players on waivers; a Club without any is the assistant's. */
  claims: Readonly<Record<ClubId, readonly PlayerId[]>>
  /** The last Season's final table, which claims go by early in this one; empty in the first. */
  priorStandings: readonly StandingsRow[]
  /** The first and last days of the regular Season, which the cap is charged over (ADR-031). */
  regularSeason: { first: number; last: number }
  /** What each Club has been charged against the cap so far this regular Season, as a share of it. */
  capCharged: Readonly<Record<ClubId, number>>
  /** The last day charged. */
  capChargedTo: number
  /** Those out long enough for long-term injury relief: they count nothing while out (ADR-031). */
  longTermInjured: Readonly<Record<PlayerId, true>>
  /** Called up in a roster emergency: off the cap while it lasts (CBA 50.10(e)). */
  capExempt: Readonly<Record<PlayerId, true>>
  /**
   * Those called up since the trade deadline, and how (CBA 13.12(l), (m)): only
   * they go back down before the Season ends, and the regular ones count
   * against the Club's call-ups.
   */
  recalled: Readonly<Record<PlayerId, 'regular' | 'emergency'>>
  /** Each Club's regular call-ups since the deadline. */
  deadlineRecalls: Readonly<Record<ClubId, number>>
  /** The regular-Season table. */
  standings: readonly StandingsRow[]
  /** Player counts so far, the playoffs kept apart. */
  totals: Readonly<{ regular: SeasonTotals; playoffs: SeasonTotals }>
  /** Null until the regular Season ends. */
  playoffs: PlayoffState | null
  /** Fixtures a Manager is following Period by Period (ADR-016). */
  live: Readonly<Record<FixtureId, LiveFixture>>
  /**
   * Which Season of the run this is, from 1 (#85). Earlier Seasons are not
   * kept here: the caller takes each one's `recordOf` before `nextSeason` (#86).
   */
  year: number
  /** Who left the league between the Season before and this one (ADR-023, #88, ADR-028). */
  departures: readonly Departure[]
  /** What each Club pays for contracts it released (ADR-031), by Club. */
  deadMoney: Readonly<Record<ClubId, readonly DeadMoney[]>>
  /** Drafted Players whose Clubs hold their rights, off the Rosters (ADR-024). */
  prospects: readonly Prospect[]
  /** The draft held before this Season, empty before the first (ADR-028). */
  draft: readonly DraftPick[]
  /**
   * The affiliates' Season, in a run that plays the farm's games; null in one
   * that does not, which develops a farm by rank instead (ADR-036, #135). The
   * choice is the run's, made as it starts and carried from Season to Season.
   */
  affiliates: AffiliateSeason | null
}

/**
 * What a run that plays the farm's games keeps of its affiliates (ADR-036,
 * #135): their schedule, Players on minor-league contracts, table and counts,
 * all folded from their Fixtures (D-03), and what form and the rule on recalls
 * read. Injuries and fatigue are the Season's, one record for both leagues.
 */
export interface AffiliateSeason {
  /** The affiliates' league as a Competition, its Competition's alignment mirrored. */
  structure: CompetitionStructure
  /** In calendar order. */
  fixtures: readonly Fixture[]
  /** Index in `fixtures` of the next one to play. */
  nextFixture: number
  /** Each Club's affiliate's Players on minor-league contracts: no NHL contract, off the cap and the 50. */
  minorLeague: Readonly<Record<ClubId, readonly Player[]>>
  standings: readonly StandingsRow[]
  totals: SeasonTotals
  /** The last day each affiliate played, by its id. */
  lastPlayed: Readonly<Record<ClubId, number>>
  goalieHistory: Readonly<Record<ClubId, GoalieHistory>>
  /** The day each Skater's fatigue in the Season's record dates from: his last Fixture, either league. */
  fatiguedOn: Readonly<Record<PlayerId, number>>
  /** Each Player's last Fixtures, either league, for his form. */
  recent: Recent
  /** Sent down and yet to play a farm Fixture: recalled only in an emergency (memorandum of 2025, item 30). */
  awaiting: Readonly<Record<PlayerId, true>>
}

/** How a run is played, beyond its Competition's rules (ADR-036, #135). */
export interface SeasonOptions {
  /** Whether the affiliates play their Fixtures. Off unless asked for. */
  playFarm?: boolean
}

/**
 * Between one Season and the next, while Managers decide (ADR-028). Plain JSON,
 * like a Season, and every step is pure. The draft window comes first, then the
 * re-signing window (ADR-032), then the Roster window; where a Club declared
 * nothing, the assistant decides.
 */
export interface Offseason {
  phase: 'draft' | 'resign' | 'roster' | 'market' | 'closed'
  /** The Season just played, with its champion. */
  ended: SeasonState
  /** The Season to come. */
  year: number
  /** Developed, a year older, without those who left; gaps not yet filled. */
  clubs: readonly Club[]
  /** Who left after the Season: retired or unsigned so far. */
  departures: readonly Departure[]
  /** Prospects whose rights are held, the new class among them once drafted. */
  prospects: readonly Prospect[]
  /** Prospects whose rights expired, free to fill any Club's gap (ADR-024). */
  undrafted: readonly Player[]
  /** The first round's order, which every round follows. */
  order: readonly ClubId[]
  /** The class still to be picked from: all of it before the draft, empty once it is made. */
  draftClass: readonly Player[]
  /** Each Club's declared order of prospects. */
  lists: Readonly<Record<ClubId, readonly PlayerId[]>>
  /** The picks made so far, in order (ADR-028 amendment, #92). */
  picks: readonly DraftPick[]
  /** Each Club's declared moves. */
  moves: Readonly<Record<ClubId, RosterMoves>>
  /**
   * Players whose contract ran out, by id, with the place in the league their
   * ask is priced from: their public role in the Season just played (ADR-030).
   */
  expiring: Readonly<Record<PlayerId, Place>>
  /** Each Club's declared re-signings; once the window closes, those made. */
  reSignings: Readonly<Record<ClubId, readonly ReSigning[]>>
  /** Dead money for the Season ahead, a Season on from the one ended. */
  deadMoney: Readonly<Record<ClubId, readonly DeadMoney[]>>
  /** Every rostered Player's place in the Season just played, his ask priced from it (ADR-030). */
  places: Readonly<Record<PlayerId, Place>>
  /** The market's free agents: some from the re-signing window, all once the market opens. */
  freeAgents: readonly FreeAgent[]
  /** Each Club's declared offers for the market's current round. */
  offers: Readonly<Record<ClubId, readonly Offer[]>>
  /** The market's round, from 1. */
  round: number
  /** Who signed with whom in the market, in order. */
  signings: readonly Signing[]
  /** What each Club's Roster moves were, once the Roster window closed. */
  rosterMoves: Readonly<
    Record<
      ClubId,
      {
        calledUp: readonly PlayerId[]
        released: readonly PlayerId[]
        /** Prospects signed who stay on loan (ADR-036). */
        signed?: readonly PlayerId[]
      }
    >
  >
}

/** Offers that break the rules: the Manager has to change them. */
export class InvalidOffersError extends Error {
  constructor(
    readonly clubId: ClubId,
    readonly violations: readonly OfferViolation[],
  ) {
    super(`Offers of Club ${clubId} break ${violations.length} rule(s)`)
    this.name = 'InvalidOffersError'
  }
}

/** Roster moves that break the rules: the Manager has to change them. */
/** Re-signings that break the rules: the Manager has to change them. */
export class InvalidReSigningsError extends Error {
  constructor(
    readonly clubId: ClubId,
    readonly violations: readonly ReSigningViolation[],
  ) {
    super(`Re-signings of Club ${clubId} break ${violations.length} rule(s)`)
    this.name = 'InvalidReSigningsError'
  }
}

export class InvalidMovesError extends Error {
  constructor(
    readonly clubId: ClubId,
    readonly violations: readonly MovesViolation[],
  ) {
    super(
      `Moves of Club ${clubId} break ${violations.length} rule(s): ${violations.map(describeMovesViolation).join('; ')}`,
    )
    this.name = 'InvalidMovesError'
  }
}

/** How far a Fixture has been followed, and what has been decided along the way. */
export interface LiveFixture {
  /** How many events of the stream have been shown. They can no longer change. */
  shown: number
  changes: readonly FixtureChange[]
}

/** Where a followed Fixture stands. */
export type LivePhase = 'start' | 'running' | 'intermission' | 'ended'

/** How much game time one step of a followed Fixture shows. */
const REVEAL_SECONDS = 60

/** A Fixture as far as it has been followed. */
export interface FixtureSoFar {
  events: readonly MatchEvent[]
  phase: LivePhase
  /** Each Skater's fatigue at the opening faceoff, 0-100. */
  openingFatigue: Readonly<Record<PlayerId, number>>
  /** Each Skater's fatigue as last reported in what has been shown, 0-100. */
  fatigue: Readonly<Record<PlayerId, number>>
  /** The Lineups in force now, to start a change from. */
  lineups: Readonly<Record<ClubId, Lineup>>
}

/** A Player on waivers: who put him there, and the day the claims are settled (CBA 13.18). */
export interface OnWaivers {
  player: Player
  clubId: ClubId
  until: number
}

/** A Player since he cleared waivers: what the rules count before he needs them again (CBA 13.5). */
export interface Cleared {
  /** His NHL games this Season when he cleared. */
  gamesAt: number
  /** Days on an active Roster since, before the stay under way. */
  days: number
  /** The day he went back up, while he is up; null on the farm. */
  upSince: number | null
}

export interface PlayedFixture {
  fixture: Fixture
  input: FixtureInput
  seed: number
  events: readonly MatchEvent[]
  match: MatchStats
}

export interface PlayedDay {
  state: SeasonState
  day: number
  played: readonly PlayedFixture[]
  /** Call-ups and send-downs made before the day's Fixtures (ADR-036). */
  moves: readonly FarmMove[]
  /** The affiliates' Fixtures of the day, in a run that plays them (#135). */
  farmPlayed: readonly PlayedFixture[]
}

/** What a Manager is told about a day. A new kind of news is one more member here. */
export type ClubNotice =
  | { kind: 'injury'; day: number; playerId: PlayerId; days: number }
  | { kind: 'recovered'; day: number; playerId: PlayerId }
  // Between Seasons (ADR-028 amendment, #92).
  | { kind: 'retired'; day: number; playerId: PlayerId }
  | { kind: 'unsigned'; day: number; playerId: PlayerId }
  | { kind: 'rightsExpired'; day: number; playerId: PlayerId }
  | { kind: 'drafted'; day: number; playerId: PlayerId; round: number; pick: number }
  | { kind: 'released'; day: number; playerId: PlayerId }
  | { kind: 'calledUp'; day: number; playerId: PlayerId }
  /** A prospect signed to his entry-level contract, who plays on loan (ADR-036). */
  | { kind: 'signed'; day: number; playerId: PlayerId }
  // From the farm and to it during a Season, and through waivers (ADR-036, #133).
  | { kind: 'sentDown'; day: number; playerId: PlayerId }
  | { kind: 'waived'; day: number; playerId: PlayerId }
  | { kind: 'cleared'; day: number; playerId: PlayerId }
  | { kind: 'claimed'; day: number; playerId: PlayerId; fromClubId: ClubId }
  | { kind: 'claimedBy'; day: number; playerId: PlayerId; clubId: ClubId }
  | { kind: 'joined'; day: number; playerId: PlayerId }
  | { kind: 'reSigned'; day: number; playerId: PlayerId; years: number }
  | { kind: 'letGo'; day: number; playerId: PlayerId }
  | { kind: 'testsMarket'; day: number; playerId: PlayerId }

/** A Lineup that breaks the rules of the game: the Manager has to change it. */
export class InvalidLineupError extends Error {
  constructor(
    readonly clubId: ClubId,
    readonly violations: readonly LineupViolation[],
  ) {
    super(`Lineup of Club ${clubId} breaks ${violations.length} rule(s)`)
    this.name = 'InvalidLineupError'
  }
}

/**
 * One full Season before its first day, of the NHL 2026-27 unless another
 * format is given (D-10, ADR-014), on the Rosters a provider gives (D-05), or on
 * Clubs generated for its structure. Its Clubs hold the prospects of the drafts
 * before it (ADR-028 amendment, #90), and every Player on a Roster holds the
 * contract the league opens with, or the one a roster file gives him (ADR-030).
 */
export async function startSeason(
  seed: number,
  provider?: RosterProvider,
  format: SeasonFormat = NHL_2026_27_SEASON,
  options: SeasonOptions = {},
): Promise<SeasonState> {
  const { structure } = format
  const rosters =
    provider ??
    createGeneratedRosterProvider({
      structure,
      seed,
      clubIdentities: new Map(
        NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
      ),
    })
  const loaded = await rosters.loadCompetition(structure.id)
  // Every Club has a farm (ADR-036). The floor binds as every Season starts, the first too (ADR-031).
  const clubs = openingContracts(
    format.cap,
    loaded.clubs.map((club) => withFarm(club, seed)),
    createRng(seed).fork('contracts'),
  )
    // Everyone under contract has service for waivers, estimated where the source gives none.
    .map((club) => serviced(club, openingService))
    .map((club) => atFloor(format.cap, club, 0))
  const unset: SeasonState = {
    ...freshSeason(seed, structure, 1),
    seed,
    playoffFormat: format.playoffs,
    draftFormat: format.draft,
    capRules: format.cap,
    farmRules: format.farm,
    clubs,
    lineups: {},
    absent: {},
    injuredReserve: {},
    longTermInjured: {},
    // A league opens with its Rosters as its source gives them: no camp.
    waivers: [],
    cleared: {},
    claims: {},
    priorStandings: [],
    departures: [],
    prospects: openingProspects(
      format.draft,
      clubs.map((club) => club.id),
      createRng(seed).fork('opening'),
    ),
    draft: [],
    deadMoney: {},
    affiliates: options.playFarm
      ? freshAffiliates(seed, structure, format.farm, 1, clubs, {})
      : null,
  }
  // Every Club opens as an AI Manager would, through the call any Manager uses (D-04).
  return clubs.reduce((state, club) => setLineup(state, club.id, buildNaiveLineup(club)), unset)
}

/**
 * A Club as a Season opens (ADR-036): one whose source gives it a farm keeps
 * it; otherwise everyone it holds is pooled, completed with an undrafted fill
 * to the shape of a Club's contracts, and the assistant picks its active
 * Roster. The fill draws from a stream of the Club's own (D-08).
 */
function withFarm(club: Club, seed: number): Club {
  if (club.farm !== undefined) return club
  const pool = pooled(club)
  const full = filledRosterAt(pool, [], createRng(seed).fork(`farm:${club.id}`), 1)
  return assignedClub(full)
}

/** A Club with everyone it holds on its active Roster and none on its farm, as between Seasons. */
function pooled(club: Club): Club {
  const all = contractedOf(club)
  return {
    ...club,
    skaters: all.filter((p): p is Skater => !isGoalie(p)),
    goalies: all.filter((p): p is Goalie => isGoalie(p)),
    farm: [],
  }
}

/**
 * A Season as stored before contracts (#125): without cap rules or dead money,
 * its Players without contracts, its rules perhaps without the floor (#129),
 * the buried allowance or the farm (#133).
 */
export type UncontractedSeason = Omit<
  SeasonState,
  | 'capRules'
  | 'deadMoney'
  | 'farmRules'
  | 'injuredReserve'
  | 'waivers'
  | 'cleared'
  | 'claims'
  | 'priorStandings'
  | 'regularSeason'
  | 'capCharged'
  | 'capChargedTo'
  | 'longTermInjured'
  | 'capExempt'
  | 'recalled'
  | 'deadlineRecalls'
  | 'affiliates'
> & {
  affiliates?: SeasonState['affiliates']
  capRules?: Partial<CapRules>
  deadMoney?: SeasonState['deadMoney']
  farmRules?: FarmRules
  injuredReserve?: SeasonState['injuredReserve']
  waivers?: SeasonState['waivers']
  cleared?: SeasonState['cleared']
  claims?: SeasonState['claims']
  priorStandings?: SeasonState['priorStandings']
  regularSeason?: SeasonState['regularSeason']
  capCharged?: SeasonState['capCharged']
  capChargedTo?: number
  longTermInjured?: SeasonState['longTermInjured']
  capExempt?: SeasonState['capExempt']
  recalled?: SeasonState['recalled']
  deadlineRecalls?: SeasonState['deadlineRecalls']
}

/** A phase between Seasons as stored before contracts (#125). */
export type UncontractedOffseason = Omit<
  Offseason,
  'ended' | 'expiring' | 'reSignings' | 'deadMoney'
> &
  Partial<Pick<Offseason, 'expiring' | 'reSignings' | 'deadMoney'>> & { ended: UncontractedSeason }

const unsigned = (clubs: readonly Club[]) =>
  clubs.some((club) => contractedOf(club).some((player) => !player.contract))

/**
 * A Season stored before contracts brought up to them (#125): the NHL's cap
 * rules, and every Player on a Roster under the contract the league would have
 * opened with. The same Season gives the same contracts each time it is read.
 */
export function contractedSeason(state: UncontractedSeason): SeasonState {
  const current =
    state.capRules?.buried !== undefined &&
    state.deadMoney !== undefined &&
    state.farmRules !== undefined &&
    state.waivers !== undefined &&
    state.capCharged !== undefined &&
    state.recalled !== undefined &&
    state.capRules.entryLevel?.slide !== undefined &&
    state.farmRules.loanedUntil !== undefined &&
    state.farmRules.league !== undefined &&
    state.affiliates !== undefined
  if (current && !unsigned(state.clubs) && !unserviced(state.clubs)) return state as SeasonState
  // Rules stored before #129 lack the floor, buyouts and the playoff regime,
  // and before #133 the buried allowance and the waivers.
  const capRules: CapRules = {
    ...NHL_2026_27_SEASON.cap,
    ...state.capRules,
    entryLevel: { ...NHL_2026_27_SEASON.cap.entryLevel, ...state.capRules?.entryLevel },
  }
  // Rules stored before #135 lack the affiliates' league.
  const farmRules: FarmRules = state.farmRules?.loanedUntil
    ? { ...state.farmRules, league: state.farmRules.league ?? NHL_2026_27_SEASON.farm.league }
    : NHL_2026_27_SEASON.farm
  // Stored before the farm (#133): every Club gets one, the same each time it is read.
  const farmed = state.farmRules
    ? state.clubs
    : state.clubs.map((club) => withFarm(club, state.seed))
  return {
    ...state,
    capRules,
    farmRules,
    injuredReserve: state.injuredReserve ?? {},
    waivers: state.waivers ?? [],
    cleared: state.cleared ?? {},
    claims: state.claims ?? {},
    priorStandings: state.priorStandings ?? [],
    // Stored before the daily charge: what has been played is charged at the
    // payroll as it stands, on the next day played.
    regularSeason: state.regularSeason ?? regularSeasonOf(state),
    capCharged: state.capCharged ?? {},
    capChargedTo: state.capChargedTo ?? state.fixtures[0]!.day - 1,
    longTermInjured: state.longTermInjured ?? {},
    capExempt: state.capExempt ?? {},
    recalled: state.recalled ?? {},
    deadlineRecalls: state.deadlineRecalls ?? {},
    deadMoney: state.deadMoney ?? {},
    // Stored before the farm's games (#135): a run without them.
    affiliates: state.affiliates ?? null,
    clubs: (unsigned(farmed)
      ? openingContracts(capRules, farmed, createRng(state.seed).fork('contracts')).map((club) =>
          atFloor(capRules, club, 0),
        )
      : farmed
    ).map((club) => serviced(club, openingService)),
  }
}

/**
 * The first and last days of a stored Season's regular Season: its first
 * Fixtures, as many as its schedule key gives every Club, before any playoffs.
 */
function regularSeasonOf(state: UncontractedSeason): SeasonState['regularSeason'] {
  const { structure } = state
  const clubs = structure.divisions.reduce((sum, d) => sum + d.clubIds.length, 0)
  const divisionSize = structure.divisions[0]!.clubIds.length
  const conferenceSize = clubs / structure.conferences.length
  const regular = (gamesPerClub(structure.scheduleKey, divisionSize, conferenceSize) * clubs) / 2
  const days = state.fixtures.slice(0, regular).map((f) => f.day)
  return { first: days[0]!, last: days.at(-1)! }
}

/** Whether any Player under contract lacks service for waivers (stored before #133). */
const unserviced = (clubs: readonly Club[]) =>
  clubs.some((club) => contractedOf(club).some((player) => player.contract && !player.service))

/** A Club whose Players under contract all have service, `from` giving it to any who lack it. */
function serviced(club: Club, from: (player: Player) => Service): Club {
  const give = <P extends Player>(player: P): P =>
    player.contract && !player.service ? { ...player, service: from(player) } : player
  return {
    ...club,
    skaters: club.skaters.map(give),
    goalies: club.goalies.map(give),
    ...(club.farm ? { farm: club.farm.map(give) } : {}),
  }
}

/**
 * Whether a Player's entry-level contract slides a Season (CBA 9.1(d)): he
 * signed it young enough, this is one of the first Seasons under it his age
 * allows to slide, and he played fewer NHL games in it than the rule names,
 * regular Season and playoffs.
 */
function slides(state: SeasonState, player: Player): boolean {
  const { contract, service } = player
  if (contract?.kind !== 'entry-level' || !service) return false
  const { slide } = state.capRules.entryLevel
  const allowed = slide.seasons.find((row) => service.signedAt <= row.upToAge)?.seasons ?? 0
  return service.seasons < allowed && gamesThisSeason(state, player.id) < slide.games
}

/**
 * A Player's service after the Season just played, with the NHL games he played
 * in it, regular Season and playoffs, folded from its events (D-03).
 */
function servedSeason<P extends Player>(state: SeasonState, player: P): P {
  if (!player.service) return player
  const games = (totals: SeasonTotals) =>
    (totals.skaters[player.id] ?? totals.goalies[player.id])?.gamesPlayed ?? 0
  const played = games(state.totals.regular) + games(state.totals.playoffs)
  return {
    ...player,
    service: serviceAfter(player.service, played, state.farmRules.waivers.exemption),
  }
}

/** A phase between Seasons stored before contracts brought up to them (#125). */
export function contractedOffseason(off: UncontractedOffseason): Offseason {
  // Stored before the re-signing window (#127): nothing waits on it.
  const window = {
    expiring: off.expiring ?? {},
    reSignings: off.reSignings ?? {},
    deadMoney: off.deadMoney ?? {},
    places: off.places ?? {},
    freeAgents: off.freeAgents ?? [],
    offers: off.offers ?? {},
    round: off.round ?? 0,
    signings: off.signings ?? [],
    rosterMoves: off.rosterMoves ?? {},
  }
  const ended = contractedSeason(off.ended)
  if (!unsigned(off.clubs)) return { ...off, ...window, ended }
  const rng = createRng(ended.seed).fork(`contracts:y${off.year}`)
  return { ...off, ...window, ended, clubs: openingContracts(ended.capRules, off.clubs, rng) }
}

/**
 * The Season after one with a champion, before its first day (#85), with
 * nothing declared between them: every pick and every move is the assistant's,
 * which is what a Club gets whose Manager leaves them to it (ADR-028, D-04).
 */
export function nextSeason(state: SeasonState): SeasonState {
  return startNextSeason(endSeason(state))
}

/**
 * The step out of a Season with a champion into the phase between Seasons
 * (ADR-028). Every Player develops by the age he played at (ADR-022), prospects
 * too, off the Roster and without the bonus for ice time; some retire or are not
 * signed again (ADR-027); everyone who stays is a year older and rested.
 * Rights older than the format allows expire. Every contract has a Season fewer;
 * one that ran out waits on the re-signing window, its ask priced from the
 * Player's role in the Season (ADR-030, #127). The draft order is drawn and the
 * class generated, each from a stream of its own (D-08).
 */
export function endSeason(state: SeasonState): Offseason {
  if (!isSeasonOver(state)) throw new Error(`Season s${state.seed} has no champion yet`)

  const year = state.year + 1
  const format = state.draftFormat
  // A farm's regulars develop as regulars do (ADR-022, ADR-036): by the farm's
  // Fixtures in a run that plays them (#135), by rank in one that does not.
  const farmRegulars = state.affiliates
    ? farmRegularsByFixtures(state.affiliates)
    : new Set(
        state.clubs.flatMap((club) =>
          farmOf(club)
            .filter((player) => regularOnFarm(club, player))
            .map((player) => player.id),
        ),
      )
  // Between Seasons a Club's active Roster and farm are held as one (ADR-036),
  // with any Player still on waivers as the Season ends.
  const held = state.clubs.map((club) =>
    pooled(
      withPlayers(
        club,
        state.waivers.filter((w) => w.clubId === club.id).map((w) => w.player),
      ),
    ),
  )
  const roleOf = roles(held, (player) => usageOf(state, player))
  const departures = leaving(held, roleOf, (player) =>
    createRng(state.seed).fork(`leave:y${state.year}:${player.id}`),
  )
  const gone = new Set(departures.map((departure) => departure.playerId))
  const slid = new Set(
    [...held.flatMap(contractedOf), ...state.prospects.map((p) => p.player)]
      .filter((player) => slides(state, player))
      .map((player) => player.id),
  )
  const grownClubs = held.map((club) => {
    const grown = <P extends Player>(player: P) =>
      olderAndRested(
        servedSeason(state, developed(state, club.id, player, farmRegulars.has(player.id))),
      )
    const stays = (player: Player) => !gone.has(player.id)
    return {
      ...club,
      skaters: club.skaters.filter(stays).map(grown),
      goalies: club.goalies.filter(stays).map(grown),
    }
  })
  // A young Player's entry-level contract slides a Season he played too few
  // NHL games in (CBA 9.1(d)); every other contract has a Season fewer.
  const clubs = tickedContracts(grownClubs, slid)
  const places = placesOf(held, (player) => roleOf.get(player.id) ?? 0)
  const expiring = Object.fromEntries(
    clubs
      .flatMap((club) => [...club.skaters, ...club.goalies])
      .filter((player) => player.contract?.years === 0)
      .map((player) => [player.id, places.get(player.id)!] as const),
  )
  const grownProspects = state.prospects.map((prospect) => {
    const player = olderAndRested(
      servedSeason(state, developed(state, prospect.player.clubId, prospect.player)),
    )
    const contract = player.contract
    // Signed and on loan: his contract has a Season fewer unless it slides (ADR-036).
    return {
      ...prospect,
      player:
        contract && !slid.has(player.id)
          ? { ...player, contract: { ...contract, years: contract.years - 1 } }
          : player,
    }
  })
  // A prospect's rights run out unless he has signed (ADR-024, ADR-036).
  const expires = (prospect: Prospect) =>
    !prospect.player.contract && prospect.year + format.rightsSeasons <= year
  const order = draftOrder(
    format,
    state.standings,
    state.playoffs!,
    createRng(state.seed).fork(`lottery:y${year}`),
  )
  const size = Math.round(order.length * format.rounds * format.classSize)
  return {
    phase: 'draft',
    ended: state,
    year,
    clubs,
    departures,
    prospects: grownProspects.filter((prospect) => !expires(prospect)),
    undrafted: grownProspects.filter(expires).map((prospect) => prospect.player),
    order,
    draftClass: generateClass(createRng(state.seed).fork(`class:y${year}`), year, size),
    lists: {},
    picks: [],
    moves: {},
    expiring,
    reSignings: {},
    deadMoney: tickedDeadMoney(state.deadMoney),
    places: Object.fromEntries(places),
    freeAgents: [],
    offers: {},
    round: 0,
    signings: [],
    rosterMoves: {},
  }
}

/**
 * Declares the order in which a Club wants the prospects of the class, for any
 * Manager (D-04). A pick takes the first still available; with none left, the
 * assistant chooses.
 */
export function setDraftList(
  off: Offseason,
  clubId: ClubId,
  prospectIds: readonly PlayerId[],
): Offseason {
  if (off.phase !== 'draft') throw new Error('The draft has been made')
  if (!off.order.includes(clubId)) throw new Error(`No Club ${clubId} in the draft`)
  const inClass = new Set(off.draftClass.map((player) => player.id))
  const unknown = prospectIds.filter((id) => !inClass.has(id))
  if (unknown.length > 0) throw new Error(`Not in the class: ${unknown.join(', ')}`)
  return { ...off, lists: { ...off.lists, [clubId]: [...prospectIds] } }
}

/** Makes every pick left in the draft, and opens the re-signing window (ADR-032). */
export function runDraft(off: Offseason): Offseason {
  if (off.phase !== 'draft') return off
  return { ...picksUntil(off, () => false), phase: 'resign', draftClass: [] }
}

/**
 * Makes the picks in order, from each Club's list or by the assistant, until the
 * next pick is `clubId`'s or the draft is over (ADR-028 amendment, #92). A draft
 * room stops here for a Manager to choose, any Manager alike (D-04).
 */
export function draftUntil(off: Offseason, clubId: ClubId): Offseason {
  if (off.phase !== 'draft') return off
  return picksUntil(off, (onClock) => onClock === clubId)
}

/** The next pick of the draft, or null when no pick is left. */
export function draftClock(off: Offseason): { pick: number; round: number; clubId: ClubId } | null {
  if (off.phase !== 'draft' || off.draftClass.length === 0) return null
  return onTheClock(off.ended.draftFormat, off.order, off.picks.length)
}

/** Makes the next pick, which must be `clubId`'s, with a prospect still in the class. */
export function makePick(off: Offseason, clubId: ClubId, playerId: PlayerId): Offseason {
  const clock = draftClock(off)
  if (!clock || clock.clubId !== clubId) throw new Error(`The next pick is not Club ${clubId}'s`)
  const player = off.draftClass.find((candidate) => candidate.id === playerId)
  if (!player) throw new Error(`Not in the class: ${playerId}`)
  const { pick, prospect } = takePick(
    off.ended.draftFormat,
    off.year,
    off.order,
    off.picks.length,
    player,
  )
  return {
    ...off,
    picks: [...off.picks, pick],
    prospects: [...off.prospects, prospect],
    draftClass: off.draftClass.filter((candidate) => candidate.id !== playerId),
  }
}

function picksUntil(off: Offseason, stop: (clubId: ClubId) => boolean): Offseason {
  const { picks, prospects, available } = continuePicks(
    off.ended.draftFormat,
    off.year,
    off.order,
    off.draftClass,
    off.lists,
    off.picks,
    stop,
  )
  return { ...off, picks, prospects: [...off.prospects, ...prospects], draftClass: available }
}

/** The assistant's call-ups and releases for a Club, once the draft is made (ADR-028). */
export function proposedMoves(off: Offseason, clubId: ClubId): RosterMoves {
  if (off.phase !== 'roster') throw new Error('The draft has not been made')
  const club = offseasonClub(off, clubId)
  return affordableMoves(
    off,
    club,
    assistantMoves(club, off.prospects, gapsOf(off, clubId), limitsOf(off)),
  )
}

/**
 * Declares a Club's call-ups and releases, for any Manager (D-04). They replace
 * the assistant's for that Club. They must keep it within its shape, and leave
 * it, once its gaps are filled, able to dress a Lineup.
 */
export function setRosterMoves(off: Offseason, clubId: ClubId, moves: RosterMoves): Offseason {
  if (off.phase !== 'roster') throw new Error('The draft has not been made')
  const club = offseasonClub(off, clubId)
  const violations = movesViolations(club, off.prospects, moves, limitsOf(off))
  if (violations.length === 0) {
    const after = movedClub(off, club, moves)
    const filled = filledRoster(after.club, after.missing, fillStream(off, clubId), off.year)
    try {
      buildNaiveLineup(filled)
    } catch {
      violations.push({ kind: 'cannotDress' })
    }
    const { before, after: payroll } = movesPayroll(off, club, moves)
    if (!withinCap(payroll, before)) violations.push({ kind: 'overCap', payroll })
  }
  if (violations.length > 0) throw new InvalidMovesError(clubId, violations)
  return { ...off, moves: { ...off.moves, [clubId]: moves } }
}

/**
 * The market's parameters (ADR-032, #130). THE VALUES ARE FITTED in #130 to
 * the leaving bands of the Phase 2 gate, by age and by ice-time third, on eight
 * generated leagues and the 2025-26 roster file: a Player from outside up to 0.4
 * above a call-up, so the bottom of a Roster is pushed out as by players from
 * Europe and the AHL; an ask falling 15% for each round unsigned, so a Player no
 * Club can afford at his ask still signs; the assistant keeping the top four
 * fifths of the league's regulars and the young. The test rate and the weights
 * are estimates, refitted with the long-run calibration (item 9) against the
 * measured 19.9% of regulars who change Club between seasons (#122).
 */
export const MARKET = {
  /** The chance an unrestricted Player his Club re-signs tests the market instead. */
  testRate: 0.35,
  /** How a free agent weighs an offer: money against his ask, his role there, the Club's strength, a draw. */
  weights: { money: 4, role: 1, strength: 0.5, draw: 0.5 },
  /** Players from outside the league, as a multiple of the gaps the market opens with. */
  poolFactor: 1.5,
  /** How far above a call-up a Player from outside may be, in ability: drawn evenly up to it. */
  poolLift: 0.4,
  /**
   * Whom the assistant keeps of those whose contracts ran out: a regular, ranked
   * within this share of the league's regulars by role, or a Player still young.
   */
  reSign: { regularShare: 0.8, youngUpTo: 23 },
  /** Offers range from this share of the ask to the next. */
  band: { low: 0.9, high: 1.25 },
  /** What a free agent asks falls by this factor for every round he has gone unsigned. */
  askDecay: 0.85,
  /** A market that has not ended by then is closed. */
  maxRounds: 60,
} as const

/** A free agent, in the market between the Roster window and the next Season (ADR-032). */
export interface FreeAgent {
  /** As he was; `clubId` is the Club he left, or empty for a Player from outside. */
  player: Player
  origin: 'league' | 'prospect' | 'outside'
  /** The offer of the Club he left, for one testing the market: it stands in the first round. */
  standing?: { clubId: ClubId; years: number }
}

/** A free agent signed in the market. */
export interface Signing {
  playerId: PlayerId
  clubId: ClubId
  round: number
}

const PHASES = ['draft', 'resign', 'roster', 'market', 'closed'] as const

/** Whether the phase between Seasons has reached `phase`. */
export function phaseReached(off: Offseason, phase: Offseason['phase']): boolean {
  return PHASES.indexOf(off.phase) >= PHASES.indexOf(phase)
}

/** What a free agent asks (ADR-030): by the role he had, the minimum for one who had none. */
export function freeAgentAsk(off: Offseason, playerId: PlayerId, years?: number): Contract {
  const agent = off.freeAgents.find((a) => a.player.id === playerId)
  if (!agent) throw new Error(`Player ${playerId} is not a free agent`)
  const rng = createRng(off.ended.seed).fork(`ask:y${off.year}:${playerId}`)
  const rules = off.ended.capRules
  const ask = askingContract(rules, agent.player, off.places[playerId], rng, years)
  // Unsigned round after round, he asks less, down to the minimum.
  const factor = MARKET.askDecay ** Math.max(0, off.round - 1)
  const capHit = Math.max(
    rules.minimum,
    Math.round(ask.capHit * factor * rules.upperLimit) / rules.upperLimit,
  )
  return { ...ask, capHit }
}

/** The longest term a Club may offer a free agent: more to its own Player (ADR-030). */
function maxTermFor(off: Offseason, agent: FreeAgent, clubId: ClubId): number {
  const { maxTerm } = off.ended.capRules
  return agent.player.clubId === clubId ? maxTerm.ownClub : maxTerm.otherClub
}

/** Places a Club still has open in each group of its 16-10-3 shape. */
function roomOf(club: Club): Record<PositionGroup, number> {
  const count = (group: PositionGroup) =>
    [...club.skaters, ...club.goalies].filter((p) => positionGroup(p) === group).length
  return {
    forward: GROUP_SHAPE.forward - count('forward'),
    defence: GROUP_SHAPE.defence - count('defence'),
    goalie: GROUP_SHAPE.goalie - count('goalie'),
  }
}

/** A free agent signed at an offer: his contract with the Club, standard, at the offer. */
function signedAt(off: Offseason, player: Player, clubId: ClubId, offer: Offer): Player {
  return {
    ...player,
    clubId,
    contract: {
      capHit: offer.capHit,
      years: offer.years,
      kind: 'standard',
      onExpiry: statusOnExpiry(off.ended.capRules, player.age, offer.years),
    },
  }
}

/** A Club's payroll for the Season ahead if every one of its offers were taken, and as it stands. */
function offersPayroll(off: Offseason, club: Club, offers: readonly Offer[]) {
  const rules = off.ended.capRules
  const dead = deadCharge(off.deadMoney[club.id])
  const players = [...club.skaters, ...club.goalies]
  const agents = new Map(off.freeAgents.map((a) => [a.player.id, a.player]))
  const signed = offers
    .filter((o) => agents.has(o.playerId))
    .map((o) => signedAt(off, agents.get(o.playerId)!, club.id, o))
  return {
    before: payrollAhead(rules, players, dead),
    after: payrollAhead(rules, [...players, ...signed], dead),
  }
}

/** The rules a Club's offers break (ADR-032). */
export function offerViolations(
  off: Offseason,
  clubId: ClubId,
  offers: readonly Offer[],
): OfferViolation[] {
  const club = offseasonClub(off, clubId)
  const agents = new Map(off.freeAgents.map((a) => [a.player.id, a]))
  const violations: OfferViolation[] = []
  const seen = new Set<PlayerId>()
  const wanted: Record<PositionGroup, number> = { forward: 0, defence: 0, goalie: 0 }
  for (const offer of offers) {
    const agent = agents.get(offer.playerId)
    if (!agent) {
      violations.push({ kind: 'notFreeAgent', playerId: offer.playerId })
      continue
    }
    if (seen.has(offer.playerId))
      violations.push({ kind: 'offeredTwice', playerId: offer.playerId })
    seen.add(offer.playerId)
    wanted[positionGroup(agent.player)]++
    const max = maxTermFor(off, agent, clubId)
    if (!Number.isInteger(offer.years) || offer.years < 1 || offer.years > max) {
      violations.push({ kind: 'termOutOfRange', playerId: offer.playerId, years: offer.years, max })
      continue
    }
    const ask = freeAgentAsk(off, offer.playerId, offer.years).capHit
    const { minimum, maximum } = off.ended.capRules
    const low = Math.max(minimum, ask * MARKET.band.low)
    const high = Math.min(maximum, ask * MARKET.band.high)
    if (offer.capHit < low - CAP_EPSILON || offer.capHit > high + CAP_EPSILON) {
      violations.push({
        kind: 'outsideBand',
        playerId: offer.playerId,
        capHit: offer.capHit,
        low,
        high,
      })
    }
  }
  const room = roomOf(club)
  for (const group of ['forward', 'defence', 'goalie'] as const) {
    if (wanted[group] > room[group]) {
      violations.push({ kind: 'noRoom', group, offers: wanted[group], room: room[group] })
    }
  }
  if (violations.length === 0) {
    const { before, after } = offersPayroll(off, club, offers)
    if (!withinCap(after, before)) violations.push({ kind: 'overCap', payroll: after })
    // With every offer taken, the places left must still let it dress a Lineup.
    const agents = new Map(off.freeAgents.map((a) => [a.player.id, a.player]))
    const signed = withPlayers(
      club,
      offers.map((o) => signedAt(off, agents.get(o.playerId)!, clubId, o)),
    )
    const left = roomOf(signed)
    const short = shortOf(signed)
    if (
      (['forward', 'defence', 'goalie'] as const).some(
        (g) => short.filter((n) => groupOfNatural(n) === g).length > left[g],
      )
    ) {
      violations.push({ kind: 'cannotDress' })
    }
  }
  return violations
}

/**
 * The assistant's offers for a Club in this round (ADR-032, #130): for each open
 * place, the best free agent a Season ahead at the natural position of whoever
 * left it that the Club can afford with its other offers, at his ask. The
 * same for every Club (D-04); it reads the truth until scouting (item 8).
 */
export function proposedOffers(off: Offseason, clubId: ClubId): Offer[] {
  if (off.phase !== 'market') return []
  const club = offseasonClub(off, clubId)
  const needs = needsAtOpening(off, club)
  const best = [...off.freeAgents].sort(
    (a, b) =>
      expectedLevel(b.player) - expectedLevel(a.player) || (a.player.id < b.player.id ? -1 : 1),
  )
  // In the first round the Club's offers to its own Players testing the market
  // stand, and take their places first (ADR-032).
  const offers: Offer[] =
    off.round === 1
      ? off.freeAgents
          .filter((a) => a.standing?.clubId === clubId)
          .map((a) => ({
            playerId: a.player.id,
            years: a.standing!.years,
            capHit: freeAgentAsk(off, a.player.id, a.standing!.years).capHit,
          }))
      : []
  // Only while the Club keeps a place in his group for every position it still
  // needs to dress a Lineup (DRESSING_MINIMUM).
  const room = roomOf(club)
  const short = shortOf(club)
  for (const offer of [...offers]) {
    const natural = naturalOf(agentOf(off, offer.playerId))
    const group = groupOfNatural(natural)
    const at = short.indexOf(natural)
    if (at >= 0) short.splice(at, 1)
    const needed = short.filter((n) => groupOfNatural(n) === group).length
    if (room[group] - 1 < needed) offers.splice(offers.indexOf(offer), 1)
    else room[group]--
  }
  const taken = new Set<PlayerId>(offers.map((o) => o.playerId))
  for (const offer of offers) {
    const natural = naturalOf(agentOf(off, offer.playerId))
    const at = needs.indexOf(natural)
    // A place in his group, the nearest need to his position if not his own.
    needs.splice(
      at >= 0 ? at : needs.findIndex((n) => groupOfNatural(n) === groupOfNatural(natural)),
      1,
    )
  }
  // Not a Player the Club has just bought out.
  const released = new Set(off.rosterMoves[clubId]?.released ?? [])
  for (const natural of needs) {
    // At the natural position of the gap only, so the Club keeps its balance of
    // centres, wings and sides and can dress a Lineup.
    const candidates = best.filter(
      (a) => naturalOf(a.player) === natural && !released.has(a.player.id),
    )
    for (const agent of candidates) {
      if (taken.has(agent.player.id)) continue
      const ask = freeAgentAsk(off, agent.player.id)
      const years = Math.min(ask.years, maxTermFor(off, agent, clubId))
      const offer = {
        playerId: agent.player.id,
        capHit: freeAgentAsk(off, agent.player.id, years).capHit,
        years,
      }
      const { before, after } = offersPayroll(off, club, [...offers, offer])
      if (!withinCap(after, before)) continue
      offers.push(offer)
      taken.add(agent.player.id)
      break
    }
  }
  return offers
}

const groupOfNatural = (natural: Natural): PositionGroup =>
  natural === 'G' ? 'goalie' : natural === 'LD' || natural === 'RD' ? 'defence' : 'forward'

/** Declares a Club's offers for this round of the market, for any Manager (D-04). */
export function setOffers(off: Offseason, clubId: ClubId, offers: readonly Offer[]): Offseason {
  if (off.phase !== 'market') throw new Error('The market is not open')
  const violations = offerViolations(off, clubId, offers)
  if (violations.length > 0) throw new InvalidOffersError(clubId, violations)
  return { ...off, offers: { ...off.offers, [clubId]: [...offers] } }
}

/**
 * How a free agent rates an offer (ADR-032): the money against his ask, the role
 * he would have, his rank by level among the Club's Players of his group, the
 * Club's strength, its share of points in the Season just played, and a draw
 * from his stream for the round (D-08). His own ability and public facts only.
 */
function rating(off: Offseason, agent: FreeAgent, clubId: ClubId, offer: Offer): number {
  const club = offseasonClub(off, clubId)
  const level = playerLevel(agent.player)
  const group = [...club.skaters, ...club.goalies].filter(
    (p) => positionGroup(p) === positionGroup(agent.player),
  )
  const role =
    group.length === 0 ? 1 : group.filter((p) => playerLevel(p) < level).length / group.length
  const row = off.ended.standings.find((r) => r.clubId === clubId)
  const strength = row && row.gamesPlayed > 0 ? row.points / (2 * row.gamesPlayed) : 0.5
  const ask = freeAgentAsk(off, agent.player.id, offer.years).capHit
  const rng = createRng(off.ended.seed).fork(
    `market:y${off.year}:${agent.player.id}:r${off.round}:${clubId}`,
  )
  const { weights } = MARKET
  return (
    weights.money * (offer.capHit / ask - 1) +
    weights.role * role +
    weights.strength * strength +
    weights.draw * gaussian(rng)
  )
}

/**
 * One round of the market (ADR-032): every Club's offers, its own or the
 * assistant's, and in the first round the standing offers of the Clubs whose
 * Players test the market. Each free agent, the best by level first, takes the
 * offer he rates highest; offers not taken lapse. A round with no offers closes
 * the market.
 */
export function marketRound(off: Offseason): Offseason {
  if (off.phase !== 'market') return off
  const byClub = new Map<ClubId, Offer[]>()
  for (const club of off.clubs) {
    byClub.set(club.id, [...(off.offers[club.id] ?? proposedOffers(off, club.id))])
  }
  if (off.round === 1) {
    for (const agent of off.freeAgents) {
      if (!agent.standing) continue
      const { clubId, years } = agent.standing
      const list = byClub.get(clubId) ?? []
      if (list.some((o) => o.playerId === agent.player.id)) continue
      const club = offseasonClub(off, clubId)
      if (
        roomOf(club)[positionGroup(agent.player)] <=
        list.filter((o) => positionGroup(agentOf(off, o.playerId)) === positionGroup(agent.player))
          .length
      )
        continue
      list.push({
        playerId: agent.player.id,
        capHit: freeAgentAsk(off, agent.player.id, years).capHit,
        years,
      })
      byClub.set(clubId, list)
    }
  }
  const offered = [...byClub.values()].some((list) => list.length > 0)
  if (!offered || off.round > MARKET.maxRounds) return closeMarket(off)

  const toPlayer = new Map<PlayerId, { clubId: ClubId; offer: Offer }[]>()
  for (const [clubId, list] of byClub) {
    for (const offer of list) {
      toPlayer.set(offer.playerId, [...(toPlayer.get(offer.playerId) ?? []), { clubId, offer }])
    }
  }
  const signings: Signing[] = [...off.signings]
  const joining = new Map<ClubId, Player[]>()
  const order = [...off.freeAgents].sort(
    (a, b) =>
      expectedLevel(b.player) - expectedLevel(a.player) || (a.player.id < b.player.id ? -1 : 1),
  )
  const signed = new Set<PlayerId>()
  for (const agent of order) {
    const options = toPlayer.get(agent.player.id)
    if (!options || options.length === 0) continue
    const best = options
      .map((o) => ({ ...o, score: rating(off, agent, o.clubId, o.offer) }))
      .sort((a, b) => b.score - a.score || (a.clubId < b.clubId ? -1 : 1))[0]!
    signed.add(agent.player.id)
    signings.push({ playerId: agent.player.id, clubId: best.clubId, round: off.round })
    joining.set(best.clubId, [
      ...(joining.get(best.clubId) ?? []),
      signedAt(off, agent.player, best.clubId, best.offer),
    ])
  }
  return {
    ...off,
    clubs: off.clubs.map((club) => withPlayers(club, joining.get(club.id) ?? [])),
    freeAgents: off.freeAgents.filter((a) => !signed.has(a.player.id)),
    signings,
    offers: {},
    round: off.round + 1,
  }
}

/** A Player as a free agent holds him: without a contract. */
function withoutContract(player: Player): Player {
  const copy = { ...player }
  delete copy.contract
  return copy
}

function agentOf(off: Offseason, playerId: PlayerId): Player {
  return off.freeAgents.find((a) => a.player.id === playerId)!.player
}

/**
 * The market closed (ADR-032): a free agent from the league nobody signed leaves
 * it as unsigned, a former prospect as his rights expired; a Player from outside
 * goes back where he came from.
 */
function closeMarket(off: Offseason): Offseason {
  const departures = [...off.departures]
  for (const { player, origin } of off.freeAgents) {
    if (origin === 'outside') continue
    departures.push({
      playerId: player.id,
      clubId: player.clubId,
      age: player.age - 1,
      reason: origin === 'prospect' ? 'rights-expired' : 'unsigned',
    })
  }
  return { ...off, phase: 'closed', departures, freeAgents: [], offers: {} }
}

/** Plays the market out, round after round, and closes it (ADR-032). */
export function runMarket(offseason: Offseason): Offseason {
  let off = runRosterMoves(offseason)
  while (off.phase === 'market') off = marketRound(off)
  return off
}

/**
 * Closes the Roster window and opens the market (ADR-032, #130). Each Club's
 * moves are made, its own or the assistant's within the cap: a prospect called
 * up signs his entry-level contract; a Player released is bought out (ADR-031)
 * and becomes a free agent. The market opens with every free agent: those let
 * go or testing it, those released, prospects whose rights expired, and Players
 * from outside the league for the gaps the league has.
 */
export function runRosterMoves(offseason: Offseason): Offseason {
  const off = runReSigning(offseason)
  if (off.phase !== 'roster') return off
  const rules = off.ended.capRules
  const deadMoney: Record<ClubId, readonly DeadMoney[]> = { ...off.deadMoney }
  const made: Record<ClubId, Offseason['rosterMoves'][ClubId]> = {}
  const freeAgents: FreeAgent[] = [...off.freeAgents]
  const joined = new Set<PlayerId>()
  const loaned = new Set<PlayerId>()
  const clubs = off.clubs.map((club) => {
    const moves =
      off.moves[club.id] ??
      affordableMoves(
        off,
        club,
        assistantMoves(club, off.prospects, gapsOf(off, club.id), limitsOf(off)),
      )
    const after = applyMoves(club, off.prospects, moves, limitsOf(off).loanedUntil)
    for (const player of after.joined) joined.add(player.id)
    for (const player of after.loaned) loaned.add(player.id)
    for (const player of after.released) {
      const owed = buyout(rules, player)
      if (owed) deadMoney[club.id] = [...(deadMoney[club.id] ?? []), owed]
      freeAgents.push({ player: withoutContract(player), origin: 'league' })
    }
    made[club.id] = {
      calledUp: after.joined.map((p) => p.id),
      released: after.released.map((p) => p.id),
      signed: after.loaned.map((p) => p.id),
    }
    return signed(rules, after.club, joined)
  })
  const opened: Offseason = { ...off, clubs, deadMoney }
  const gaps = clubs.flatMap((club) => needsAtOpening(opened, club))
  const pool = Array.from(
    { length: Math.round(gaps.length * MARKET.poolFactor) },
    (_, i) => gaps[i % Math.max(1, gaps.length)]!,
  ).filter((n) => n !== undefined)
  const outside = generatedFreeAgents(
    pool,
    createRng(off.ended.seed).fork(`pool:y${off.year}`),
    off.year,
    MARKET.poolLift,
  )
  return {
    ...opened,
    phase: 'market',
    // A prospect who signed and stays on loan holds his entry-level contract (ADR-036).
    prospects: off.prospects
      .filter((p) => !joined.has(p.player.id))
      .map((p) =>
        loaned.has(p.player.id)
          ? {
              ...p,
              player: {
                ...p.player,
                contract: entryLevelContract(rules, p.player),
                service: firstService(p.player),
              },
            }
          : p,
      ),
    rosterMoves: made,
    freeAgents: [
      ...freeAgents,
      ...off.undrafted.map((player): FreeAgent => ({ player, origin: 'prospect' })),
      ...outside.map((player): FreeAgent => ({ player, origin: 'outside' })),
    ],
    undrafted: [],
    round: 1,
    offers: {},
  }
}

/**
 * Those a Club is still missing: who left it since the Season, less one at each
 * natural position for every Player who has joined it since.
 */
function missingFrom(off: Offseason, club: Club): Player[] {
  const ended = new Set(heldIds(clubOf(off.ended, club.id)))
  const joined = [...club.skaters, ...club.goalies].filter((p) => !ended.has(p.id))
  return stillMissing(leaversOf(off, club.id), joined)
}

/** The natural positions a Club is short of to dress a Lineup, one entry for each missing. */
function shortOf(club: Club): Natural[] {
  const have = [...club.skaters, ...club.goalies].map(naturalOf)
  return (Object.entries(DRESSING_MINIMUM) as [Natural, number][]).flatMap(([natural, least]) =>
    Array.from(
      { length: Math.max(0, least - have.filter((n) => n === natural).length) },
      () => natural,
    ),
  )
}

/** The natural positions of a Club's open places: what it needs to dress, then whom it lost. */
function needsAtOpening(off: Offseason, club: Club): Natural[] {
  const room = roomOf(club)
  // What the Club needs to dress a Lineup comes first, then whom it lost.
  const short = shortOf(club)
  const missing = [...missingFrom(off, club).map(naturalOf)]
  for (const natural of short) {
    const at = missing.indexOf(natural)
    if (at >= 0) missing.splice(at, 1)
  }
  const left = [...short, ...missing]
  const needs: Natural[] = []
  for (const group of ['forward', 'defence', 'goalie'] as const) {
    const naturals = left.filter((n) => groupOfNatural(n) === group)
    const fallback: Natural[] =
      group === 'forward' ? ['C', 'LW', 'RW'] : group === 'defence' ? ['LD', 'RD'] : ['G']
    for (let i = 0; i < room[group]; i++) needs.push(naturals[i] ?? fallback[i % fallback.length]!)
  }
  return needs
}

/**
 * The next Season from the phase between Seasons, before its first day. Every
 * window still open closes as the assistant would close it, for every Club
 * alike (D-04): the draft, the re-signings, the Roster moves and the market.
 * Each gap the market left takes a generated fill at the minimum (ADR-023), the
 * floor binds (ADR-031), and the table starts again with a schedule drawn from
 * a stream of its own (D-08). An absence runs on across the summer by the
 * calendar. A declared Lineup stays while it is still valid, and otherwise the
 * assistant builds one with the same Tactics.
 */
export function startNextSeason(offseason: Offseason): SeasonState {
  const off = runMarket(offseason)
  const state = off.ended
  const year = off.year
  const fresh = freshSeason(state.seed, state.structure, year)
  const { daysPerYear } = state.structure.calendar
  const firstDay = fresh.fixtures[0]!.day

  // The assistant picks each active Roster, the rest go to the farm (ADR-036);
  // whoever signed his first contract between the Seasons starts his service.
  const assigned = off.clubs.map((club) => {
    const rng = fillStream(off, club.id)
    const full = signed(
      state.capRules,
      dressable(filledRosterAt(club, needsAtOpening(off, club), rng, year), rng, year),
      new Set(),
    )
    return assignedClub(serviced(full, firstService))
  })
  // Those who need waivers to go down go through them at camp, by the table just
  // ended; then the floor binds as the Season starts (ADR-031).
  const camp = campWaivers(state, assigned, off.deadMoney)
  const clubs = camp.clubs.map((club) =>
    atFloor(state.capRules, club, deadCharge(off.deadMoney[club.id])),
  )
  const gone = new Set(off.departures.map((departure) => departure.playerId))
  const absent = Object.fromEntries(
    Object.entries(state.absent)
      .filter(([id]) => !gone.has(id))
      .map(([id, back]) => [id, back - daysPerYear] as const)
      .filter(([, back]) => back > firstDay),
  )
  // Whoever is still out on the first day stays on Injured Reserve, and on
  // long-term injury relief.
  const injuredReserve = Object.fromEntries(
    Object.keys(absent)
      .filter((id) => id in state.injuredReserve)
      .map((id) => [id, true] as const),
  )
  const longTermInjured = Object.fromEntries(
    Object.keys(absent)
      .filter((id) => id in state.longTermInjured)
      .map((id) => [id, true] as const),
  )
  const lineups = Object.fromEntries(
    clubs.map((club) => {
      const declared = state.lineups[club.id]!
      const valid = validateLineup(declared, club).length === 0
      return [club.id, valid ? declared : buildNaiveLineup(club, declared.tactics)]
    }),
  )
  return {
    ...state,
    ...fresh,
    clubs,
    lineups,
    absent,
    injuredReserve,
    longTermInjured,
    waivers: [],
    cleared: camp.cleared,
    claims: {},
    priorStandings: state.standings,
    departures: off.departures,
    prospects: off.prospects,
    draft: off.picks,
    deadMoney: off.deadMoney,
    // A run that plays the farm's games goes on playing them (#135).
    affiliates: state.affiliates
      ? freshAffiliates(
          state.seed,
          state.structure,
          state.farmRules,
          year,
          clubs,
          minorLeagueAfter(state),
        )
      : null,
  }
}

/**
 * A Club with a contract for everyone who joined it without one (ADR-030): a
 * prospect it called up signs an entry-level contract, the fill and a former
 * prospect it took one year at the minimum.
 */
function signed(rules: CapRules, club: Club, calledUp: ReadonlySet<PlayerId>): Club {
  const sign = <P extends Player>(player: P): P =>
    player.contract
      ? player
      : {
          ...player,
          contract: calledUp.has(player.id)
            ? entryLevelContract(rules, player)
            : minimumContract(rules, player),
        }
  return { ...club, skaters: club.skaters.map(sign), goalies: club.goalies.map(sign) }
}

/** The Players of a Club in a Season whose contracts ran out with it, in Roster order. */
function expiringIn(state: SeasonState, off: Offseason, clubId: ClubId): PlayerId[] {
  const club = state.clubs.find((candidate) => candidate.id === clubId)
  return club ? heldIds(club).filter((id) => id in off.expiring) : []
}

/** A Club's Players whose contracts ran out, still on its Roster until the window closes. */
export function expiringPlayers(off: Offseason, clubId: ClubId): Player[] {
  const club = offseasonClub(off, clubId)
  return [...club.skaters, ...club.goalies].filter((player) => player.id in off.expiring)
}

/**
 * What a Player whose contract ran out asks to sign again (ADR-030): the curve
 * at his role, for `years` when his Club names them, and otherwise the term he
 * draws from his stream for the Season (D-08).
 */
export function askOf(off: Offseason, playerId: PlayerId, years?: number): Contract {
  const place = off.expiring[playerId]
  if (!place) throw new Error(`Player ${playerId}'s contract has not run out`)
  const player = off.clubs
    .flatMap((club) => [...club.skaters, ...club.goalies])
    .find((candidate) => candidate.id === playerId)
  if (!player) throw new Error(`Player ${playerId} is on no Roster`)
  const rng = createRng(off.ended.seed).fork(`resign:y${off.year}:${playerId}`)
  return askingContract(off.ended.capRules, player, place, rng, years)
}

/**
 * The assistant's re-signings for a Club (ADR-032): the best by level first,
 * each at his ask and the term he draws, while he fits under the cap with the
 * places still open at the minimum (ADR-031, #129). The same for every Club (D-04).
 */
export function proposedReSignings(off: Offseason, clubId: ClubId): ReSigning[] {
  const kept: ReSigning[] = []
  const best = [...expiringPlayers(off, clubId)].sort(
    (a, b) => expectedLevel(b) - expectedLevel(a) || (a.id < b.id ? -1 : 1),
  )
  for (const player of best) {
    // A Player outside the league's regulars is kept only while young (#130).
    const place = off.expiring[player.id]!
    const regular = place.rank < place.regulars * MARKET.reSign.regularShare
    if (!regular && player.age > MARKET.reSign.youngUpTo) continue
    const trial = [...kept, { playerId: player.id, years: askOf(off, player.id).years }]
    const { before, after } = reSigningPayroll(off, clubId, trial)
    if (withinCap(after, before)) kept.push(trial.at(-1)!)
  }
  return kept
}

/** The rules a Club's re-signings break. */
export function reSigningViolations(
  off: Offseason,
  clubId: ClubId,
  reSignings: readonly ReSigning[],
): ReSigningViolation[] {
  const expiring = new Set(expiringPlayers(off, clubId).map((player) => player.id))
  const max = off.ended.capRules.maxTerm.ownClub
  const seen = new Set<PlayerId>()
  const violations: ReSigningViolation[] = []
  for (const { playerId, years } of reSignings) {
    if (!expiring.has(playerId)) violations.push({ kind: 'notExpiring', playerId })
    else if (seen.has(playerId)) violations.push({ kind: 'reSignedTwice', playerId })
    if (!Number.isInteger(years) || years < 1 || years > max) {
      violations.push({ kind: 'termOutOfRange', playerId, years, max })
    }
    seen.add(playerId)
  }
  if (violations.length === 0) {
    const { before, after } = reSigningPayroll(off, clubId, reSignings)
    if (!withinCap(after, before)) violations.push({ kind: 'overCap', payroll: after })
  }
  return violations
}

/**
 * Declares whom a Club re-signs, each at his ask for the term named; every other
 * Player whose contract ran out is let go. For any Manager (D-04).
 */
export function setReSignings(
  off: Offseason,
  clubId: ClubId,
  reSignings: readonly ReSigning[],
): Offseason {
  if (off.phase !== 'resign') throw new Error('The re-signing window is not open')
  const violations = reSigningViolations(off, clubId, reSignings)
  if (violations.length > 0) throw new InvalidReSigningsError(clubId, violations)
  return { ...off, reSignings: { ...off.reSignings, [clubId]: [...reSignings] } }
}

/**
 * Closes the re-signing window and opens the Roster window (ADR-032). Each Club's
 * re-signings are made, its own or the assistant's. A Player let go becomes a
 * free agent, and so does an unrestricted one who tests the market with his
 * Club's offer standing (#130); his place is a gap.
 * The draft is made first if it has not been.
 */
export function runReSigning(offseason: Offseason): Offseason {
  const off = offseason.phase === 'draft' ? runDraft(offseason) : offseason
  if (off.phase !== 'resign') return off
  const freeAgents: FreeAgent[] = [...off.freeAgents]
  const made: Record<ClubId, readonly ReSigning[]> = {}
  const clubs = off.clubs.map((club) => {
    const decided = off.reSignings[club.id] ?? proposedReSignings(off, club.id)
    made[club.id] = decided
    const years = new Map(decided.map((r) => [r.playerId, r.years]))
    const settle = <P extends Player>(players: readonly P[]): P[] =>
      players.flatMap((player) => {
        if (!(player.id in off.expiring)) return [player]
        const term = years.get(player.id)
        const expired = player.contract
        const free = withoutContract(player)
        // An unrestricted Player may test the market, his Club's offer standing (ADR-032).
        const tests =
          term !== undefined &&
          expired?.onExpiry === 'unrestricted' &&
          createRng(off.ended.seed).fork(`test:y${off.year}:${player.id}`).chance(MARKET.testRate)
        if (term !== undefined && !tests)
          return [{ ...player, contract: askOf(off, player.id, term) }]
        freeAgents.push({
          player: free,
          origin: 'league',
          ...(tests ? { standing: { clubId: club.id, years: term } } : {}),
        })
        return []
      })
    return { ...club, skaters: settle(club.skaters), goalies: settle(club.goalies) }
  })
  // Whoever signed on loan and has reached the farm's age joins his Club (ADR-036).
  const { loanedUntil } = off.ended.farmRules
  const grown = off.prospects.filter((p) => p.player.contract && p.player.age >= loanedUntil)
  const joiningClubs = clubs.map((club) =>
    withPlayers(
      club,
      grown.filter((p) => p.player.clubId === club.id).map((p) => p.player),
    ),
  )
  const held = new Set(grown.map((p) => p.player.id))
  return {
    ...off,
    phase: 'roster',
    clubs: joiningClubs,
    prospects: off.prospects.filter((p) => !held.has(p.player.id)),
    freeAgents,
    reSignings: made,
  }
}

/**
 * A Club's payroll for the Season ahead (ADR-031): the contracts it holds, its
 * dead money, and every place its Roster still has open at the minimum, since
 * the fill will take them at that.
 */
function payrollAhead(rules: CapRules, players: readonly Player[], dead: number): number {
  // The Players the assistant would put on the active Roster count in full, the
  // farm only above the buried allowance (ADR-036), and each active place still
  // open at the minimum. A place on the farm at the minimum counts nothing.
  const club = assignedClub({
    id: '',
    code: '',
    name: '',
    skaters: players.filter((p): p is Skater => !isGoalie(p)),
    goalies: players.filter((p): p is Goalie => isGoalie(p)),
  })
  const active = club.skaters.length + club.goalies.length
  const open = Math.max(0, ACTIVE_SIZE - active)
  return payroll(club, rules.buried) + open * Math.max(0, rules.minimum) + dead
}

/** Within rounding of a share of the cap. */
const CAP_EPSILON = 1e-9

/**
 * Whether a change of payroll stands under the cap (ADR-031): a Club may end
 * at or under it, and a Club already over it may make no change that adds.
 */
const withinCap = (after: number, before: number) =>
  after <= 1 + CAP_EPSILON || after <= before + CAP_EPSILON

/** A Club's payroll for the Season ahead after these re-signings, and before any. */
function reSigningPayroll(off: Offseason, clubId: ClubId, reSignings: readonly ReSigning[]) {
  const rules = off.ended.capRules
  const club = offseasonClub(off, clubId)
  const running = [...club.skaters, ...club.goalies].filter((p) => !(p.id in off.expiring))
  const dead = deadCharge(off.deadMoney[clubId])
  const kept = reSignings
    .filter((r) => r.playerId in off.expiring)
    .map((r) => ({
      ...offseasonPlayer(off, r.playerId),
      contract: askOf(off, r.playerId, r.years),
    }))
  return {
    before: payrollAhead(rules, running, dead),
    after: payrollAhead(rules, [...running, ...kept], dead),
  }
}

function offseasonPlayer(off: Offseason, playerId: PlayerId): Player {
  const player = off.clubs
    .flatMap((club) => [...club.skaters, ...club.goalies])
    .find((candidate) => candidate.id === playerId)
  if (!player) throw new Error(`Player ${playerId} is on no Roster`)
  return player
}

/**
 * A Club's payroll for the Season ahead after these moves, and before any
 * (ADR-031): a called-up prospect at his entry-level contract, a released
 * Player's buyout as dead money.
 */
function movesPayroll(off: Offseason, club: Club, moves: RosterMoves) {
  const rules = off.ended.capRules
  const dead = deadCharge(off.deadMoney[club.id])
  const players = (c: Club, calledUp: ReadonlySet<PlayerId>) =>
    [...c.skaters, ...c.goalies].map((player) =>
      player.contract || !calledUp.has(player.id)
        ? player
        : { ...player, contract: entryLevelContract(rules, player) },
    )
  const none = movedClub(off, club, { callUps: [], releases: [] })
  const after = movedClub(off, club, moves)
  const bought = after.released.reduce((sum, p) => sum + (buyout(rules, p)?.capHit ?? 0), 0)
  const joining = new Set(after.joined.map((p) => p.id))
  return {
    before: payrollAhead(rules, players(none.club, new Set()), dead),
    after: payrollAhead(rules, players(after.club, joining), dead + bought),
  }
}

/**
 * The assistant's moves cut to what the cap allows (ADR-031): without its swaps
 * of a Player for a better prospect first, then without call-ups from the last,
 * a gap taking the fill at the minimum instead.
 */
function affordableMoves(off: Offseason, club: Club, moves: RosterMoves): RosterMoves {
  const fits = (m: RosterMoves) => {
    const { before, after } = movesPayroll(off, club, m)
    return withinCap(after, before)
  }
  if (fits(moves)) return moves
  // The swaps come last: a release, and the call-up that takes his place.
  // A signing that stays on loan costs nothing and stands.
  const signings = (moves.signings ?? []).filter(
    (id) => off.prospects.find((p) => p.player.id === id)!.player.age < limitsOf(off).loanedUntil,
  )
  let callUps = moves.callUps.slice(0, moves.callUps.length - moves.releases.length)
  while (callUps.length > 0 && !fits({ callUps, releases: [], signings })) {
    callUps = callUps.slice(0, -1)
  }
  return { callUps, releases: [], signings }
}

/** What a Club's moves between Seasons are kept to (ADR-036). */
function limitsOf(off: Offseason): MoveLimits {
  const { contractsMax, loanedUntil } = off.ended.farmRules
  return { contractsMax, loanedUntil }
}

function offseasonClub(off: Offseason, clubId: ClubId): Club {
  const club = off.clubs.find((candidate) => candidate.id === clubId)
  if (!club) throw new Error(`No Club ${clubId}`)
  return club
}

const GROUP_SHAPE: Readonly<Record<PositionGroup, number>> = {
  forward: ROSTER_SHAPE.forwards,
  defence: ROSTER_SHAPE.defence,
  goalie: ROSTER_SHAPE.goalies,
}

/** Who has left a Club since the Season, as they were in it: retired, let go, released or signed elsewhere. */
function leaversOf(off: Offseason, clubId: ClubId): Player[] {
  const now = new Set(rosterIds(offseasonClub(off, clubId)))
  const ended = off.ended.clubs.find((club) => club.id === clubId)
  return ended ? contractedOf(ended).filter((p) => !now.has(p.id)) : []
}

/** A Club's gaps, at the natural positions of those who left them. */
/** The natural positions a Club must fill between Seasons, one for each who left it (ADR-028). */
export function rosterGaps(off: Offseason, clubId: ClubId): Natural[] {
  return gapsOf(off, clubId)
}

function gapsOf(off: Offseason, clubId: ClubId): Natural[] {
  return leaversOf(off, clubId).map(naturalOf)
}

/** The stream a Club's undrafted fill draws from (D-08). */
function fillStream(off: Offseason, clubId: ClubId) {
  return createRng(off.ended.seed).fork(`fill:y${off.ended.year}:${clubId}`)
}

/**
 * A Club after its moves, and whom it is still missing: those who left, less
 * one of each natural position for every Player who joined at it.
 */
function movedClub(off: Offseason, club: Club, moves: RosterMoves) {
  const after = applyMoves(club, off.prospects, moves, limitsOf(off).loanedUntil)
  const missing = stillMissing([...leaversOf(off, club.id), ...after.released], after.joined)
  return { ...after, missing }
}

function stillMissing(missing: readonly Player[], joined: readonly Player[]): Player[] {
  const left = [...missing]
  for (const player of joined) {
    const at = left.findIndex((p) => naturalOf(p) === naturalOf(player))
    if (at >= 0) left.splice(at, 1)
  }
  return left
}

function withPlayers(club: Club, players: readonly Player[]): Club {
  return {
    ...club,
    skaters: [...club.skaters, ...players.filter((p): p is Skater => !isGoalie(p))],
    goalies: [...club.goalies, ...players.filter((p): p is Goalie => isGoalie(p))],
  }
}

/** What is kept of a Season with a champion, for its history and careers (#86). */
export function recordOf(state: SeasonState): SeasonRecord {
  const champion = state.playoffs?.champion
  if (!state.playoffs || !champion) throw new Error(`Season s${state.seed} has no champion yet`)
  return {
    seasonId: state.fixtures[0]!.seasonId,
    year: state.year,
    champion,
    standings: state.standings,
    playoffs: state.playoffs,
    totals: state.totals,
    ...(state.affiliates
      ? { farm: { standings: state.affiliates.standings, totals: state.affiliates.totals } }
      : {}),
    draft: state.draft,
    departures: state.departures,
    roster: state.clubs.flatMap((club) =>
      [
        ...contractedOf(club),
        ...state.waivers.filter((w) => w.clubId === club.id).map((w) => w.player),
      ].map((player) => ({
        playerId: player.id,
        clubId: club.id,
        age: player.age,
        position: naturalPosition(player),
        level: playerLevel(player),
      })),
    ),
  }
}

/** A Season's own parts as they stand before its first day. */
function freshSeason(seed: number, structure: CompetitionStructure, year: number) {
  // The first Season keeps the stream and ids it had before there were more (#85).
  const seasonId = year === 1 ? `s${seed}` : `s${seed}-y${year}`
  const fixtures = generateSchedule({
    structure,
    seasonId,
    rng: createRng(seed).fork(year === 1 ? 'schedule' : `schedule:y${year}`),
  }).sort((a, b) => a.day - b.day || a.round - b.round)
  const first = fixtures[0]!.day
  return {
    structure,
    year,
    fixtures,
    regularSeason: { first, last: fixtures.at(-1)!.day },
    capCharged: {},
    capChargedTo: first - 1,
    capExempt: {},
    recalled: {},
    deadlineRecalls: {},
    nextFixture: 0,
    fatigue: {},
    lastPlayed: {},
    goalieHistory: {},
    standings: foldStandings(structure, []),
    totals: { regular: NO_TOTALS, playoffs: NO_TOTALS },
    playoffs: null,
    live: {},
  } satisfies Partial<SeasonState>
}

/**
 * A Player after a Season's development (ADR-022), at the age he played it.
 * His stream is forked by Season and id (D-08), and whether he was a regular
 * is read from the folded counts (D-03).
 */
function developed<P extends Player>(
  state: SeasonState,
  clubId: ClubId,
  player: P,
  onFarm = false,
): P {
  const clubFixtures = state.standings.find((row) => row.clubId === clubId)?.gamesPlayed ?? 0
  const { skaters, goalies } = state.totals.regular
  const dressed = (skaters[player.id] ?? goalies[player.id])?.gamesPlayed ?? 0
  const rng = createRng(state.seed).fork(`develop:y${state.year}:${player.id}`)
  // A regular for his affiliate counts as one, as for his Club (ADR-036).
  const regular = clubFixtures > 0 && dressed * 2 >= clubFixtures
  return develop(player, rng, { regular, farm: onFarm })
}

/** A Player a year on: older and rested. */
/** What a Player did in the regular Season, for his role when Players leave (ADR-027). */
function usageOf(state: SeasonState, player: Player): SeasonUsage {
  const { skaters, goalies } = state.totals.regular
  const skater = skaters[player.id]
  const fixtures = (skater ?? goalies[player.id])?.gamesPlayed ?? 0
  return {
    fixtures,
    secondsPerFixture: skater && fixtures > 0 ? skater.iceTimeSeconds / fixtures : 0,
    injured: player.id in state.absent,
  }
}

function olderAndRested<P extends Player>(player: P): P {
  return { ...player, age: player.age + 1, fatigue: 0 }
}

/** Declares a Club's Lineup and Tactics for the Fixtures to come, for any Manager (D-04). */
export function setLineup(state: SeasonState, clubId: ClubId, lineup: Lineup): SeasonState {
  // The Fixture so far was played with the Lineup as it stands. Changing that
  // now would replay what the Manager has already seen.
  if (isFollowed(state, clubId)) throw new Error(`Club ${clubId} is in a Fixture being followed`)

  const club = clubOf(state, clubId)
  const declared = state.lineups[clubId]
  const violations = withinEmergency(
    validateLineup(lineup, club),
    declared ? validateLineup(replaceInjured(state, clubId, declared), club) : [],
  )
  if (playoffCapBinds(state)) {
    const charge = playoffCapCharge(state, clubId, lineup)
    if (charge > 1 + CAP_EPSILON) {
      violations.push({
        rule: 'playoff-cap',
        message: `The dressed Players and dead money cost ${(charge * 100).toFixed(1)}% of the cap, above it.`,
      })
    }
  }
  if (violations.length > 0) throw new InvalidLineupError(clubId, violations)
  return { ...state, lineups: { ...state.lineups, [clubId]: lineup } }
}

/**
 * A Lineup with everyone currently out replaced, as it would be for the next
 * Fixture anyway (ADR-012). Offered to a Manager so they need not click it through.
 */
export function replaceInjured(
  state: SeasonState,
  clubId: ClubId,
  lineup: Lineup,
  day = nextDay(state),
): Lineup {
  const club = clubOf(state, clubId)
  return lineupWithout(club, lineup, unavailable(state, club, lineup, day))
}

/**
 * A Lineup without those who cannot play (ADR-012), and never with a Player off
 * the active Roster: with no fit spare left the injured Player stays in it, as
 * before, but one sent down or claimed is replaced by whoever the Roster still
 * holds, a Player out hurt included (ADR-036).
 */
function lineupWithout(club: Club, lineup: Lineup, out: ReadonlySet<PlayerId>): Lineup {
  const first = withoutInjured(club, lineup, out)
  const active = new Set(rosterIds(club))
  const off = dressed(first).filter((id) => !active.has(id))
  return off.length === 0 ? first : withoutInjured(club, first, new Set(off))
}

/**
 * A Club as the next Season starts with a generated fill for every natural
 * position it is short of to dress a Lineup, above its shape if it must be: a
 * Club that claimed Players off waivers may be full at a group yet short at a
 * position of it (ADR-036).
 */
function dressable(club: Club, rng: Rng, year: number): Club {
  const short = shortOf(club)
  if (short.length === 0) return club
  const count = (group: PositionGroup) =>
    [...club.skaters, ...club.goalies].filter((p) => positionGroup(p) === group).length
  const more = (group: PositionGroup) => short.filter((n) => groupOfNatural(n) === group).length
  return filledRosterAt(club, short, rng, year, {
    forwards: count('forward') + more('forward'),
    defence: count('defence') + more('defence'),
    goalies: count('goalie') + more('goalie'),
  })
}

/**
 * Who cannot play for a Club on `day`: those hurt, and those in its Lineup no
 * longer on its active Roster, sent down since it was declared (ADR-036).
 */
function unavailable(state: SeasonState, club: Club, lineup: Lineup, day: number): Set<PlayerId> {
  const active = new Set(rosterIds(club))
  return new Set([
    ...rosterIds(club).filter((id) => daysOut(state, id, day) > 0),
    ...dressed(lineup).filter((id) => !active.has(id)),
  ])
}

/** Calendar days a Player is still out from `day`, by default the next day with Fixtures; 0 if fit. */
export function daysOut(state: SeasonState, playerId: PlayerId, day = nextDay(state)): number {
  return Math.max(0, (state.absent[playerId] ?? day) - day)
}

/**
 * The Lineup an assistant coach would pick from those fit to play, keeping the
 * Tactics. It is the same builder that sets an AI Manager's Lineup (D-04). With
 * too few fit at a position to build one, it builds from everyone and replaces
 * those who are out, as a Fixture would.
 */
export function assistantLineup(state: SeasonState, clubId: ClubId, tactics: Tactics): Lineup {
  const club = clubOf(state, clubId)
  const fit = <T extends { id: PlayerId }>(players: readonly T[]) =>
    players.filter((player) => daysOut(state, player.id) === 0)
  let lineup: Lineup
  try {
    lineup = buildNaiveLineup(
      { ...club, skaters: fit(club.skaters), goalies: fit(club.goalies) },
      tactics,
    )
  } catch {
    lineup = replaceInjured(state, clubId, buildNaiveLineup(club, tactics))
  }
  // In the playoffs the assistant dresses what the cap allows (ADR-031).
  return withinPlayoffCap(state, clubId, lineup, nextDay(state))
}

/** Each Skater's fatigue as it will stand for the Club's next Fixture, after the rest until then. */
export function fatigueBeforeNext(
  state: SeasonState,
  clubId: ClubId,
): Readonly<Record<PlayerId, number>> {
  const next = state.fixtures
    .slice(state.nextFixture)
    .find((fixture) => fixture.homeClubId === clubId || fixture.awayClubId === clubId)
  const { skaters } = next ? rested(state, clubId, next.day) : clubOf(state, clubId)
  return Object.fromEntries(skaters.map((skater) => [skater.id, Math.round(skater.fatigue)]))
}

/** Whether a Fixture of this Club is being followed, which locks its Lineup. */
export function isFollowed(state: SeasonState, clubId: ClubId): boolean {
  return Object.keys(state.live).some((id) => {
    const fixture = fixtureOf(state, id)
    return fixture.homeClubId === clubId || fixture.awayClubId === clubId
  })
}

/** Starts following a Fixture of the next day, with nothing shown yet. */
export function openFixture(state: SeasonState, fixtureId: FixtureId): SeasonState {
  const fixture = fixtureOf(state, fixtureId)
  if (fixture.day !== state.fixtures[state.nextFixture]?.day) {
    throw new Error(`Fixture ${fixtureId} is not on the next day`)
  }
  if (state.live[fixtureId]) return state
  return { ...state, live: { ...state.live, [fixtureId]: { shown: 0, changes: [] } } }
}

/** What a followed Fixture has shown so far. Nothing past that point leaves here. */
export function fixtureSoFar(state: SeasonState, fixtureId: FixtureId): FixtureSoFar {
  const live = state.live[fixtureId]
  if (!live) throw new Error(`Fixture ${fixtureId} is not being followed`)

  const fixture = fixtureOf(state, fixtureId)
  const input = inputFor(state, fixture)
  const events = simulateFixture(input, seedOf(state, fixture))
  const inForce = (club: Club, declared: Lineup): Lineup => {
    const out = new Set(
      events.flatMap((e) =>
        e.type === 'injury' && e.offIce && e.clubId === club.id ? [e.player] : [],
      ),
    )
    const changed = live.changes.filter((change) => change.clubId === club.id).at(-1)
    return changed?.lineup ?? withoutInjured(club, declared, out)
  }
  const shown = events.slice(0, live.shown)
  const openingFatigue = Object.fromEntries(
    [...input.homeClub.skaters, ...input.awayClub.skaters].map((skater) => [
      skater.id,
      Math.round(skater.fatigue),
    ]),
  )
  const fatigue = { ...openingFatigue }
  for (const event of shown) {
    if (event.type !== 'fatigue') continue
    event.players.forEach((id, i) => {
      fatigue[id] = event.fatigue[i]!
    })
  }
  return {
    events: shown,
    phase: phaseOf(events, live.shown),
    openingFatigue,
    fatigue,
    lineups: {
      [fixture.homeClubId]: inForce(input.homeClub, input.homeLineup),
      [fixture.awayClubId]: inForce(input.awayClub, input.awayLineup),
    },
  }
}

function phaseOf(events: readonly MatchEvent[], shown: number): LivePhase {
  if (shown === 0) return 'start'
  if (events[shown]?.type === 'match_end' || shown >= events.length) return 'ended'
  return events[shown - 1]!.type === 'period_end' ? 'intermission' : 'running'
}

/** How many events are shown after one more step: a minute, or up to the end of the Period. */
function revealed(events: readonly MatchEvent[], shown: number): number {
  const until = (events[shown - 1]?.clock ?? 0) + REVEAL_SECONDS
  for (let i = shown; i < events.length; i++) {
    const event = events[i]!
    if (event.type === 'period_end' || event.type === 'match_end') return i + 1
    if (event.clock > until) return i
  }
  return events.length
}

/**
 * Shows the next step of a followed Fixture, taking up any Lineup a Club chose
 * at this point. The choice is final, since what has been shown cannot change.
 * Only those already dressed can take part.
 */
export function continueFixture(
  state: SeasonState,
  fixtureId: FixtureId,
  chosen: readonly { clubId: ClubId; lineup: Lineup }[] = [],
): SeasonState {
  const live = state.live[fixtureId]
  if (!live) throw new Error(`Fixture ${fixtureId} is not being followed`)
  const { lineups, phase } = fixtureSoFar(state, fixtureId)
  if (phase === 'ended') throw new Error(`Fixture ${fixtureId} has been shown to its end`)

  const changes = chosen.map(({ clubId, lineup }) => {
    const before = lineups[clubId]
    if (!before) throw new Error(`Club ${clubId} is not in Fixture ${fixtureId}`)
    const club = clubOf(state, clubId)
    const violations = [
      ...withinEmergency(validateLineup(lineup, club), validateLineup(before, club)),
      ...notDressed(lineup, before),
    ]
    if (violations.length > 0) throw new InvalidLineupError(clubId, violations)
    return { afterEvent: live.shown, clubId, lineup }
  })

  const decided: LiveFixture = { ...live, changes: [...live.changes, ...changes] }
  const next = { ...state, live: { ...state.live, [fixtureId]: decided } }
  const fixture = fixtureOf(state, fixtureId)
  const events = simulateFixture(inputFor(next, fixture), seedOf(state, fixture))
  const shown = revealed(events, live.shown)
  return { ...next, live: { ...next.live, [fixtureId]: { ...decided, shown } } }
}

export function isRegularSeasonOver(state: SeasonState): boolean {
  return state.playoffs !== null
}

/** True once the playoffs have a champion, and the affiliates have played every Fixture (#135). */
export function isSeasonOver(state: SeasonState): boolean {
  const farmDone =
    !state.affiliates || state.affiliates.nextFixture >= state.affiliates.fixtures.length
  return state.playoffs !== null && state.playoffs.champion !== null && farmDone
}

/** What a played day means for one Club, folded from its Matches and the absences it left. */
export function noticesOf(before: SeasonState, played: PlayedDay, clubId: ClubId): ClubNotice[] {
  const { day, state } = played
  const roster = new Set(rosterIds(clubOf(before, clubId)))
  const recovered = Object.keys(before.absent)
    .filter((id) => roster.has(id) && state.absent[id] === undefined)
    .map((playerId): ClubNotice => ({ kind: 'recovered', day, playerId }))
  const injured = played.played
    .flatMap(({ match }) => match.injuries)
    .filter((injury) => injury.clubId === clubId)
    .map(({ playerId, days }): ClubNotice => ({ kind: 'injury', day, playerId, days }))
  const moved = played.moves.flatMap((move): ClubNotice[] => {
    if (move.kind === 'claimed') {
      if (move.clubId === clubId) {
        return [{ kind: 'claimed', day, playerId: move.playerId, fromClubId: move.fromClubId }]
      }
      return move.fromClubId === clubId
        ? [{ kind: 'claimedBy', day, playerId: move.playerId, clubId: move.clubId }]
        : []
    }
    return move.clubId === clubId ? [{ kind: move.kind, day, playerId: move.playerId }] : []
  })
  return [...recovered, ...moved, ...injured]
}

/**
 * What a Season's end means for one Club (ADR-028 amendment, #92): who retired
 * or went unsigned, and whose rights it lost. Dated on the Season's last day.
 */
export function endNoticesOf(off: Offseason, clubId: ClubId): ClubNotice[] {
  const day = off.ended.fixtures.at(-1)!.day
  // Those let go in the re-signing window have notices of their own.
  const left = off.departures
    .filter((departure) => departure.clubId === clubId && !(departure.playerId in off.expiring))
    .flatMap((departure): ClubNotice[] =>
      departure.reason === 'retired' || departure.reason === 'unsigned'
        ? [{ kind: departure.reason, day, playerId: departure.playerId }]
        : [],
    )
  const expired = off.undrafted
    .filter((player) => player.clubId === clubId)
    .map((player): ClubNotice => ({ kind: 'rightsExpired', day, playerId: player.id }))
  return [...left, ...expired]
}

/**
 * Whom a Club re-signed and whom it let go, once the re-signing window has
 * closed (ADR-032). Dated on the ended Season's last day.
 */
export function reSigningNoticesOf(off: Offseason, clubId: ClubId): ClubNotice[] {
  if (!phaseReached(off, 'roster')) return []
  const day = off.ended.fixtures.at(-1)!.day
  const kept = new Map((off.reSignings[clubId] ?? []).map((r) => [r.playerId, r.years]))
  const testing = new Set(
    off.freeAgents.filter((a) => a.standing?.clubId === clubId).map((a) => a.player.id),
  )
  const tested = new Set(off.signings.map((s) => s.playerId))
  return expiringIn(off.ended, off, clubId).map((playerId): ClubNotice => {
    const years = kept.get(playerId)
    if (years === undefined) return { kind: 'letGo', day, playerId }
    const onRoster = rosterIds(offseasonClub(off, clubId)).includes(playerId)
    return onRoster || (!testing.has(playerId) && !tested.has(playerId))
      ? { kind: 'reSigned', day, playerId, years }
      : { kind: 'testsMarket', day, playerId }
  })
}

/** Whom a Club drafted, in the order of its picks. Dated on the ended Season's last day. */
export function draftNoticesOf(off: Offseason, clubId: ClubId): ClubNotice[] {
  const day = off.ended.fixtures.at(-1)!.day
  return off.picks
    .filter((pick) => pick.clubId === clubId)
    .map(({ playerId, round, pick }): ClubNotice => ({
      kind: 'drafted',
      day,
      playerId,
      round,
      pick,
    }))
}

/**
 * What the start of the next Season means for one Club: whom it released and
 * called up, and who joined to fill a gap. Dated on the new Season's first day.
 */
export function startNoticesOf(
  offseason: Offseason,
  next: SeasonState,
  clubId: ClubId,
): ClubNotice[] {
  // The next Season closes every window nobody closed.
  const off = runMarket(offseason)
  const day = next.fixtures[0]!.day
  const before = new Set(heldIds(clubOf(off.ended, clubId)))
  const moves = off.rosterMoves[clubId] ?? { calledUp: [], released: [] }
  // Called up, or joined from a loan (ADR-036).
  const calledUp = new Set([
    ...moves.calledUp,
    ...off.ended.prospects.filter((p) => p.player.clubId === clubId).map((p) => p.player.id),
  ])
  const signed = (moves.signed ?? []).map((playerId): ClubNotice => ({
    kind: 'signed',
    day,
    playerId,
  }))
  const released = moves.released.map((playerId): ClubNotice => ({
    kind: 'released',
    day,
    playerId,
  }))
  const arrived = heldIds(clubOf(next, clubId))
    .filter((id) => !before.has(id))
    .map((id): ClubNotice => ({
      kind: calledUp.has(id) ? 'calledUp' : 'joined',
      day,
      playerId: id,
    }))
  return [...released, ...signed, ...arrived]
}

/** Whether a Club plays on the next day that has Fixtures. */
export function playsNext(state: SeasonState, clubId: ClubId): boolean {
  const day = state.fixtures[state.nextFixture]?.day
  return state.fixtures
    .slice(state.nextFixture)
    .some(
      (fixture) =>
        fixture.day === day && (fixture.homeClubId === clubId || fixture.awayClubId === clubId),
    )
}

/**
 * Plays every day up to a Club's next Fixture, and stops before it, so its
 * Manager can still set the Lineup. With no Fixture left, plays to the champion.
 */
export function advanceToFixtureOf(state: SeasonState, clubId: ClubId): PlayedDay[] {
  const days: PlayedDay[] = []
  let current = state
  while (!isSeasonOver(current) && !playsNext(current, clubId)) {
    const day = advanceDay(current)
    days.push(day)
    current = day.state
  }
  return days
}

/** Plays every Fixture of the next day that has any. */
export function advanceDay(state: SeasonState): PlayedDay {
  const next = state.fixtures[state.nextFixture]
  const farmNext = state.affiliates?.fixtures[state.affiliates.nextFixture]
  if (!next && !farmNext) throw new Error(`Season s${state.seed} has no Fixtures left`)
  // In a run with farm games, a day may have only farm Fixtures (#135).
  const day = Math.min(next?.day ?? Infinity, farmNext?.day ?? Infinity)

  const played: PlayedFixture[] = []
  const farmPlayed: PlayedFixture[] = []
  // The days since the last charged at the payroll they ran at, then the moves,
  // then today at the payroll they leave (ADR-031).
  const before = chargedThrough(recovered(state, day), day - 1)
  const settled = settledWaivers(before, day)
  const farmed = withFarmMoves(awaitingCleared(settled.state, settled.moves), day)
  const moved = chargedThrough(farmed.state, day)
  const moves = [...settled.moves, ...farmed.moves]
  let current = moved
  for (;;) {
    const fixture = current.fixtures[current.nextFixture]
    if (fixture?.day !== day) break
    const step = playFixture(current, fixture)
    current = step.state
    played.push(step.played)
  }
  if (current.affiliates && farmNext?.day === day) {
    current = toppedUp(current, day)
    for (;;) {
      const fixture = current.affiliates!.fixtures[current.affiliates!.nextFixture]
      if (fixture?.day !== day) break
      const step = playFarmFixture(current, fixture)
      current = step.state
      farmPlayed.push(step.played)
    }
  }
  return { state: afterDay(current, day, played), day, played, moves, farmPlayed }
}

/**
 * In a run with farm games, those who cleared waivers to their farm have yet
 * to play there before a recall (the memorandum of 2025, item 30).
 */
function awaitingCleared(state: SeasonState, moves: readonly FarmMove[]): SeasonState {
  const aff = state.affiliates
  const cleared = moves.filter((m) => m.kind === 'cleared')
  if (!aff || cleared.length === 0) return state
  const awaiting = { ...aff.awaiting }
  for (const move of cleared) awaiting[move.playerId] = true
  return { ...state, affiliates: { ...aff, awaiting } }
}

/**
 * Every Club's call-ups and send-downs before a day's Fixtures (ADR-036): the
 * assistant's, the same call for every Club (D-04).
 */
function withFarmMoves(state: SeasonState, day: number): { state: SeasonState; moves: FarmMove[] } {
  const moves: FarmMove[] = []
  const waivers: OnWaivers[] = [...state.waivers]
  const cleared: Record<PlayerId, Cleared> = { ...state.cleared }
  const capExempt: Record<PlayerId, true> = { ...state.capExempt }
  const recalled: Record<PlayerId, 'regular' | 'emergency'> = { ...state.recalled }
  const deadlineRecalls: Record<ClubId, number> = { ...state.deadlineRecalls }
  const closed = afterDeadline(state, day)
  // With farm games (#135): the rule on recalls, and swaps for form on a day
  // without other moves, in the regular Season before the deadline.
  const aff = state.affiliates
  const awaiting: Record<PlayerId, true> | null = aff ? { ...aff.awaiting } : null
  const swapping = aff !== null && state.playoffs === null && !closed
  let merit: ((playerId: PlayerId) => number | null) | undefined
  const clubs = state.clubs.map((club) => {
    const out = (id: PlayerId) => daysOut(state, id, day) > 0
    const injuredReserve = (id: PlayerId) => id in state.injuredReserve
    const free = (id: PlayerId) => goesDownFree(state, playerOf(club, id), day)
    const affords = (calledUp: readonly Player[], sentDown: readonly Player[]) => {
      const ids = (ps: readonly Player[]) => new Set(ps.map((p) => p.id))
      const up = ids(calledUp)
      const down = ids(sentDown)
      const active = new Set(
        [...club.skaters, ...club.goalies, ...calledUp]
          .map((p) => p.id)
          .filter((id) => !down.has(id) || up.has(id)),
      )
      return fitsToday(state, club, withActive(club, active), day)
    }
    const mayRecall = (id: PlayerId) => !awaiting || !(id in awaiting)
    const need = farmMoves(club, state.farmRules, {
      out,
      injuredReserve,
      free,
      affords,
      emergencyCapHit: state.capRules.rosterEmergency.maxCapHit,
      ...(afterDeadline(state, day) ? { deadline: deadlineDay(state, club) } : {}),
      ...(awaiting ? { mayRecall } : {}),
    })
    const made =
      need.length === 0 && swapping
        ? formSwaps(club, {
            merit: (merit ??= meritOf(state)),
            out,
            injuredReserve,
            free,
            mayRecall,
            affords,
          })
        : need
    if (made.length === 0) return club
    if (awaiting) {
      for (const move of made) {
        if (move.kind === 'sentDown') awaiting[move.playerId] = true
        if (move.kind === 'calledUp') delete awaiting[move.playerId]
      }
    }
    // A Player who needs waivers to go down goes on them instead (CBA 13.2).
    const settled = made.map((move): FarmMove => {
      if (move.kind !== 'sentDown') return move
      const player = playerOf(club, move.playerId)
      return goesDownFree(state, player, day) ? move : { ...move, kind: 'waived' }
    })
    for (const move of settled) {
      if (move.kind === 'calledUp' && move.offCap) capExempt[move.playerId] = true
      if (move.kind === 'sentDown' || move.kind === 'waived') {
        delete capExempt[move.playerId]
        delete recalled[move.playerId]
      }
      if (move.kind === 'calledUp' && closed) {
        recalled[move.playerId] = move.emergency ? 'emergency' : 'regular'
        if (!move.emergency) deadlineRecalls[club.id] = (deadlineRecalls[club.id] ?? 0) + 1
      }
      const entry = cleared[move.playerId]
      if (move.kind === 'calledUp' && entry) cleared[move.playerId] = { ...entry, upSince: day }
      if (move.kind === 'sentDown' && entry?.upSince != null) {
        cleared[move.playerId] = { ...entry, days: entry.days + day - entry.upSince, upSince: null }
      }
      if (move.kind === 'waived') {
        waivers.push({
          player: playerOf(club, move.playerId),
          clubId: club.id,
          until: day + state.farmRules.waivers.claimDays,
        })
      }
    }
    moves.push(...settled)
    const waived = new Set(settled.filter((m) => m.kind === 'waived').map((m) => m.playerId))
    const after = afterFarmMoves(club, settled)
    return waived.size === 0 ? after : withoutPlayers(after, waived)
  })
  // A roster emergency lasts while a Club is short of the line; then its call-up counts.
  for (const club of clubs) {
    const short = (['forward', 'defence', 'goalie'] as const).some(
      (group) =>
        [...club.skaters, ...club.goalies].filter(
          (p) => positionGroup(p) === group && daysOut(state, p.id, day) === 0,
        ).length < state.farmRules.emergency[group],
    )
    if (short) continue
    for (const p of [...club.skaters, ...club.goalies]) delete capExempt[p.id]
  }
  const exemptChanged = Object.keys(capExempt).length !== Object.keys(state.capExempt).length
  return moves.length === 0 && !exemptChanged
    ? { state, moves }
    : {
        state: {
          ...state,
          clubs,
          waivers,
          cleared,
          capExempt,
          recalled,
          deadlineRecalls,
          affiliates: aff && awaiting ? { ...aff, awaiting } : aff,
        },
        moves,
      }
}

/** The first day after the trade deadline: its day counts as after it, the deadline falling at 3 p.m. */
export function deadlineOf(state: SeasonState): number {
  return state.regularSeason.last - state.farmRules.deadline.daysBeforeEnd
}

/** Whether `day` falls from the trade deadline to the Season's end (CBA 13.12(j)). */
function afterDeadline(state: SeasonState, day: number): boolean {
  return state.playoffs !== null || day >= deadlineOf(state)
}

/** What the deadline leaves a Club: its regular call-ups, and who may go back down. */
function deadlineDay(state: SeasonState, club: Club): DeadlineDay {
  const { recalls, onRoster } = state.farmRules.deadline
  const up = [...club.skaters, ...club.goalies].filter(
    (p) => state.recalled[p.id] === 'regular',
  ).length
  return {
    recalls: recalls - (state.deadlineRecalls[club.id] ?? 0),
    onRoster: onRoster - up,
    mayGoDown: (id) => id in state.recalled,
  }
}

/**
 * What a Club's payroll counts against the cap on a day of the regular Season
 * (ADR-031, ADR-036): its active Roster but those on long-term injury relief or
 * called up in an emergency, its farm above the buried allowance, the Players it
 * has on waivers, and its dead money.
 */
export function countedPayroll(state: SeasonState, club: Club): number {
  const hit = (p: Player) => p.contract?.capHit ?? 0
  const active = [...club.skaters, ...club.goalies]
    .filter((p) => !(p.id in state.longTermInjured) && !(p.id in state.capExempt))
    .reduce((sum, p) => sum + hit(p), 0)
  const farm = farmOf(club).reduce((sum, p) => sum + Math.max(0, hit(p) - state.capRules.buried), 0)
  const waived = state.waivers
    .filter((w) => w.clubId === club.id)
    .reduce((sum, w) => sum + hit(w.player), 0)
  return active + farm + waived + deadCharge(state.deadMoney[club.id])
}

/** The state with every Club charged its counted payroll for each day of the regular Season up to `day`. */
function chargedThrough(state: SeasonState, day: number): SeasonState {
  const { first, last } = state.regularSeason
  const to = Math.min(day, last)
  if (to <= state.capChargedTo || state.playoffs !== null) return state
  const days = last - first + 1
  const span = to - Math.max(state.capChargedTo, first - 1)
  const capCharged = Object.fromEntries(
    state.clubs.map((club) => [
      club.id,
      (state.capCharged[club.id] ?? 0) + (countedPayroll(state, club) * span) / days,
    ]),
  )
  return { ...state, capCharged, capChargedTo: to }
}

/**
 * Whether a change to a Club on `day` stands under the cap as it is charged by
 * the day (ADR-031): what it has been charged, plus its payroll after the change
 * for the days left, stays under the cap, or the change adds nothing.
 */
function fitsToday(state: SeasonState, club: Club, after: Club, day: number): boolean {
  const { first, last } = state.regularSeason
  const days = last - first + 1
  const left = Math.max(0, last - Math.max(day, first) + 1) / days
  const charged = chargedThrough(state, day - 1).capCharged[club.id] ?? 0
  const before = countedPayroll(state, club)
  const then = countedPayroll(state, after)
  return charged + then * left <= 1 + CAP_EPSILON || then <= before + CAP_EPSILON
}

/** A Player a Club holds, active or on its farm. */
function playerOf(club: Club, playerId: PlayerId): Player {
  const player = contractedOf(club).find((p) => p.id === playerId)
  if (!player) throw new Error(`Player ${playerId} is not held by Club ${club.id}`)
  return player
}

/** A Club without these Players, on its active Roster or its farm. */
function withoutPlayers(club: Club, ids: ReadonlySet<PlayerId>): Club {
  const keep = (p: Player) => !ids.has(p.id)
  return {
    ...club,
    skaters: club.skaters.filter(keep),
    goalies: club.goalies.filter(keep),
    ...(club.farm ? { farm: club.farm.filter(keep) } : {}),
  }
}

/** A Player's NHL games so far this Season, regular Season and playoffs, folded from its events (D-03). */
function gamesThisSeason(state: SeasonState, playerId: PlayerId): number {
  const of = (t: SeasonTotals) => (t.skaters[playerId] ?? t.goalies[playerId])?.gamesPlayed ?? 0
  return of(state.totals.regular) + of(state.totals.playoffs)
}

/**
 * Whether a Player goes down to the farm on `day` without waivers: exempt
 * (CBA 13.4), or cleared and not yet past the days or games that end it (13.5).
 */
export function goesDownFree(state: SeasonState, player: Player, day: number): boolean {
  const games = gamesThisSeason(state, player.id)
  if (waiverExempt(player, state.farmRules, games)) return true
  const entry = state.cleared[player.id]
  if (!entry) return false
  const { reWaiver } = state.farmRules.waivers
  const days = entry.days + (entry.upSince !== null ? day - entry.upSince : 0)
  return days < reWaiver.days && games - entry.gamesAt < reWaiver.games
}

/**
 * Declares the Players on waivers a Club claims, for any Manager (D-04). They
 * replace the assistant's choice for that Club. A Club may claim only a Player
 * another Club put on waivers.
 */
export function setClaims(
  state: SeasonState,
  clubId: ClubId,
  playerIds: readonly PlayerId[],
): SeasonState {
  clubOf(state, clubId)
  for (const id of playerIds) {
    const on = state.waivers.find((w) => w.player.id === id)
    if (!on) throw new Error(`Player ${id} is not on waivers`)
    if (on.clubId === clubId) throw new Error(`Club ${clubId} put Player ${id} on waivers itself`)
  }
  return { ...state, claims: { ...state.claims, [clubId]: [...playerIds] } }
}

/**
 * The waivers due by `day` settled (CBA 13.19): each Player goes to the first
 * Club in the order of claims that claims him, its own declaration or the
 * assistant's, and that can afford him and has a contract to spare; he joins
 * its active Roster with his contract. A Player nobody claims clears and goes
 * to his farm.
 */
function settledWaivers(
  state: SeasonState,
  day: number,
): { state: SeasonState; moves: FarmMove[] } {
  const due = state.waivers.filter((w) => w.until <= day)
  if (due.length === 0) return { state, moves: [] }
  const moves: FarmMove[] = []
  const cleared: Record<PlayerId, Cleared> = { ...state.cleared }
  let clubs = [...state.clubs]
  const firstDay = state.fixtures[0]!.day
  const early = day - firstDay < state.farmRules.waivers.priorTableDays
  const table = early && state.priorStandings.length > 0 ? state.priorStandings : state.standings
  for (const { player, clubId } of due) {
    const order = claimOrder(
      table,
      clubs.map((c) => c.id).filter((id) => id !== clubId),
    )
    const claimer = order.find((id) => {
      const club = clubs.find((c) => c.id === id)!
      const declared = state.claims[id]
      const wants = declared ? declared.includes(player.id) : wantsClaim(club, player)
      return wants && canTakeOn(state, club, player, day)
    })
    if (claimer) {
      moves.push({ kind: 'claimed', clubId: claimer, playerId: player.id, fromClubId: clubId })
      clubs = clubs.map((c) =>
        c.id === claimer ? withPlayers(c, [{ ...player, clubId: claimer }]) : c,
      )
    } else {
      moves.push({ kind: 'cleared', clubId, playerId: player.id })
      cleared[player.id] = { gamesAt: gamesThisSeason(state, player.id), days: 0, upSince: null }
      clubs = clubs.map((c) => (c.id === clubId ? { ...c, farm: [...farmOf(c), player] } : c))
    }
  }
  const settled = new Set(due.map((w) => w.player.id))
  const claims = Object.fromEntries(
    Object.entries(state.claims).map(([id, list]) => [id, list.filter((p) => !settled.has(p))]),
  )
  return {
    state: {
      ...state,
      clubs,
      waivers: state.waivers.filter((w) => !settled.has(w.player.id)),
      cleared,
      claims,
    },
    moves,
  }
}

/**
 * Whether a Club can take on a Player's contract during a Season: a contract to
 * spare, and room under the cap with him on its active Roster (ADR-031).
 */
function canTakeOn(state: SeasonState, club: Club, player: Player, day: number): boolean {
  if (contractedOf(club).length >= state.farmRules.contractsMax) return false
  return fitsToday(state, club, withPlayers(club, [player]), day)
}

/**
 * Camp, as the next Season starts (ADR-036): every Player the assistant put on a
 * farm who needs waivers goes through them, the best first, claimed by the
 * Clubs in the order of the table just ended. A Club that claims one re-picks
 * its active Roster, which may send another of its Players through them. Who
 * clears may go down without them again this Season, by the rules of 13.5.
 */
function campWaivers(
  ended: SeasonState,
  assigned: readonly Club[],
  deadMoney: Readonly<Record<ClubId, readonly DeadMoney[]>>,
): { clubs: Club[]; cleared: Record<PlayerId, Cleared> } {
  const rules = ended.farmRules
  const capRules = ended.capRules
  let clubs = [...assigned]
  const cleared: Record<PlayerId, Cleared> = {}
  const done = new Set<PlayerId>()
  for (let round = 0; round < CAMP_ROUNDS; round++) {
    const pending = clubs
      .flatMap((club) => farmOf(club).map((player) => ({ club: club.id, player })))
      .filter(({ player }) => !done.has(player.id) && !waiverExempt(player, rules, 0))
      .sort(
        (a, b) =>
          playerLevel(b.player) - playerLevel(a.player) || (a.player.id < b.player.id ? -1 : 1),
      )
    if (pending.length === 0) break
    for (const { club: from, player } of pending) {
      done.add(player.id)
      const order = claimOrder(
        ended.standings,
        clubs.map((c) => c.id).filter((id) => id !== from),
      )
      const claimer = order.find((id) => {
        const club = clubs.find((c) => c.id === id)!
        if (!wantsClaim(club, player)) return false
        if (contractedOf(club).length >= rules.contractsMax) return false
        const dead = deadCharge(deadMoney[id])
        const players = contractedOf(club)
        return withinCap(
          payrollAhead(capRules, [...players, player], dead),
          payrollAhead(capRules, players, dead),
        )
      })
      if (!claimer) {
        cleared[player.id] = { gamesAt: 0, days: 0, upSince: null }
        continue
      }
      clubs = clubs.map((c) => {
        if (c.id === from) return withoutPlayers(c, new Set([player.id]))
        if (c.id === claimer) return assignedClub(withPlayers(c, [{ ...player, clubId: claimer }]))
        return c
      })
    }
  }
  // Anyone on a farm still waiting, or claimed and then pushed down by a later
  // claim, goes down as cleared.
  for (const club of clubs) {
    for (const player of farmOf(club)) {
      if (!(player.id in cleared) && !waiverExempt(player, rules, 0)) {
        cleared[player.id] = { gamesAt: 0, days: 0, upSince: null }
      }
    }
  }
  return { clubs, cleared }
}

/** Rounds of camp waivers: a claim can send another Player through them, so it settles in a few. */
const CAMP_ROUNDS = 5

/**
 * Moves the playoffs on once the last due Fixture is in: the end of the regular
 * Season seeds them, and each game day credits its series and sets the next game.
 */
function afterDay(state: SeasonState, day: number, played: readonly PlayedFixture[]): SeasonState {
  // A day of farm Fixtures alone moves nothing in the Competition (#135).
  if (played.length === 0 || state.nextFixture < state.fixtures.length) return state

  const { playoffFormat: format, structure } = state
  const credited = state.playoffs
    ? played.reduce(
        (playoffs, { fixture, match }) =>
          afterSeriesFixture(
            playoffs,
            fixture.homeClubId,
            fixture.awayClubId,
            match.result.winner!,
          ),
        state.playoffs,
      )
    : startPlayoffs(format, state.standings, structure)
  const playoffs = afterRound(format, credited)

  const last = state.fixtures.at(-1)!
  const due = nextSeriesFixtures(format, playoffs, {
    competitionId: last.competitionId,
    seasonId: last.seasonId,
    round: last.round + 1,
    day: day + format.daysBetweenFixtures,
  })
  return { ...state, playoffs, fixtures: [...state.fixtures, ...due] }
}

function dressed(lineup: Lineup): PlayerId[] {
  return [
    lineup.starter,
    lineup.backup,
    ...lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
    ...lineup.pairings.flatMap((pairing) => [pairing.leftDefence, pairing.rightDefence]),
  ]
}

/**
 * With no natural replacement left, an injury can put a Skater out of position
 * (ADR-012). A Manager can rearrange around that, as long as no more Skaters
 * end up out of position than the Fixture already had.
 */
function withinEmergency(
  found: readonly LineupViolation[],
  before: readonly LineupViolation[],
): LineupViolation[] {
  const outOfPosition = (list: readonly LineupViolation[]) =>
    list.filter((violation) => violation.rule === 'illegal-position')
  return outOfPosition(found).length > outOfPosition(before).length
    ? [...found]
    : found.filter((violation) => violation.rule !== 'illegal-position')
}

function notDressed(lineup: Lineup, before: Lineup): LineupViolation[] {
  const allowed = new Set(dressed(before))
  return dressed(lineup)
    .filter((id) => !allowed.has(id))
    .map((id): LineupViolation => ({
      rule: 'not-dressed',
      message: `Player ${id} is not dressed for this Fixture`,
    }))
}

/** The next day with Fixtures, or the day after the last one once there are none. */
function nextDay(state: SeasonState): number {
  return state.fixtures[state.nextFixture]?.day ?? state.fixtures.at(-1)!.day + 1
}

/** The state with everyone back by `day` no longer absent. */
function recovered(state: SeasonState, day: number): SeasonState {
  const absent = Object.fromEntries(Object.entries(state.absent).filter(([, back]) => back > day))
  if (Object.keys(absent).length === Object.keys(state.absent).length) return state
  const still = (list: Readonly<Record<PlayerId, true>>) =>
    Object.fromEntries(
      Object.keys(list)
        .filter((id) => id in absent)
        .map((id) => [id, true] as const),
    )
  return {
    ...state,
    absent,
    injuredReserve: still(state.injuredReserve),
    longTermInjured: still(state.longTermInjured),
  }
}

function fixtureOf(state: SeasonState, fixtureId: FixtureId): Fixture {
  const fixture = state.fixtures.find((candidate) => candidate.id === fixtureId)
  if (!fixture) throw new Error(`No Fixture ${fixtureId} in Season s${state.seed}`)
  return fixture
}

function seedOf(state: SeasonState, fixture: Fixture): number {
  return fixtureSeed(createRng(state.seed), fixture)
}

/** What the engine plays a Fixture from, the same for following it and for playing it. */
function inputFor(state: SeasonState, fixture: Fixture): FixtureInput {
  const { homeClubId, awayClubId, day } = fixture
  const changes = state.live[fixture.id]?.changes ?? []
  return {
    fixture,
    homeClub: rested(state, homeClubId, day),
    awayClub: rested(state, awayClubId, day),
    homeLineup: lineupFor(state, homeClubId, day),
    awayLineup: lineupFor(state, awayClubId, day),
    ...(changes.length > 0 ? { changes } : {}),
  }
}

function clubOf(state: SeasonState, clubId: ClubId): Club {
  const club = state.clubs.find((candidate) => candidate.id === clubId)
  if (!club) throw new Error(`No Club ${clubId} in Season s${state.seed}`)
  return club
}

function rosterIds(club: Club): PlayerId[] {
  return [...club.skaters, ...club.goalies].map((player) => player.id)
}

/** Everyone a Club holds under contract, active Roster and farm (ADR-036). */
function heldIds(club: Club): PlayerId[] {
  return contractedOf(club).map((player) => player.id)
}

function rested(state: SeasonState, clubId: ClubId, day: number): Club {
  const club = clubOf(state, clubId)
  const last = state.lastPlayed[clubId]
  if (last === undefined) return club
  // With farm games a Skater may have played since for the farm (#135).
  const since = state.affiliates?.fatiguedOn
  return {
    ...club,
    skaters: club.skaters.map((skater) => ({
      ...skater,
      fatigue: afterRest(
        state.fatigue[skater.id] ?? 0,
        day - (since?.[skater.id] ?? last),
        skater.attributes.stamina,
      ),
    })),
  }
}

/** What a Lineup's dressed Players and a Club's dead money cost against the playoff cap (ADR-031). */
export function playoffCapCharge(state: SeasonState, clubId: ClubId, lineup: Lineup): number {
  const club = clubOf(state, clubId)
  const hits = new Map(
    [...club.skaters, ...club.goalies].map((p) => [p.id, p.contract?.capHit ?? 0]),
  )
  return (
    dressed(lineup).reduce((sum, id) => sum + (hits.get(id) ?? 0), 0) +
    deadCharge(state.deadMoney[clubId])
  )
}

/** Whether the playoff cap binds this Lineup now: in the playoffs, under rules that have one. */
const playoffCapBinds = (state: SeasonState) =>
  state.playoffs !== null && state.capRules.playoffs === 'dressed'

/**
 * A playoff Lineup brought under the cap (ADR-031), the same way for every Club
 * (D-04): the dearest dressed Player whose standing down makes it cheaper is
 * replaced as an injured one would be, by the best fit spare at his position,
 * until it fits or nobody left makes it cheaper.
 */
function withinPlayoffCap(state: SeasonState, clubId: ClubId, lineup: Lineup, day: number): Lineup {
  if (!playoffCapBinds(state)) return replaceInjured(state, clubId, lineup, day)
  const club = clubOf(state, clubId)
  const injured = [...unavailable(state, club, lineup, day)]
  const hit = new Map(
    [...club.skaters, ...club.goalies].map((p) => [p.id, p.contract?.capHit ?? 0]),
  )
  const out = new Set(injured)
  let current = lineupWithout(club, lineup, out)
  let charge = playoffCapCharge(state, clubId, current)
  while (charge > 1 + CAP_EPSILON) {
    const candidates = dressed(current)
      .filter((id) => !out.has(id))
      .sort((a, b) => hit.get(b)! - hit.get(a)! || (a < b ? -1 : 1))
    let improved = false
    for (const id of candidates) {
      const trial = lineupWithout(club, lineup, new Set([...out, id]))
      const cost = playoffCapCharge(state, clubId, trial)
      if (cost < charge - CAP_EPSILON && !dressed(trial).some((d) => injured.includes(d))) {
        out.add(id)
        current = trial
        charge = cost
        improved = true
        break
      }
    }
    if (!improved) break
  }
  return current
}

/** The Lineup a Club dresses on `day`, once injuries and Goalie rotation have had their say. */
function lineupFor(state: SeasonState, clubId: ClubId, day: number): Lineup {
  // Rotation is a regular-Season rule: nobody rests a starter in the playoffs,
  // where the Lineup must fit under the cap instead (ADR-031).
  if (state.playoffs !== null) return withinPlayoffCap(state, clubId, state.lineups[clubId]!, day)
  const healthy = replaceInjured(state, clubId, state.lineups[clubId]!, day)
  return lineupForFixture(healthy, day, state.goalieHistory[clubId] ?? null)
}

function playFixture(
  state: SeasonState,
  fixture: Fixture,
): { state: SeasonState; played: PlayedFixture } {
  const { homeClubId, awayClubId, day } = fixture
  const input = inputFor(state, fixture)
  const seed = seedOf(state, fixture)
  const events = simulateFixture(input, seed)
  const match = foldMatch(fixture, events)

  const absent = { ...state.absent }
  const injuredReserve = { ...state.injuredReserve }
  const longTermInjured = { ...state.longTermInjured }
  const { longTermInjury } = state.capRules
  for (const { playerId, clubId, days } of match.injuries) {
    absent[playerId] = day + days
    if (days >= state.farmRules.injuredReserveDays) injuredReserve[playerId] = true
    // Out 24 days and 10 of his Club's Fixtures: relief while he is out (ADR-031).
    const missed = state.fixtures.filter(
      (f) =>
        f.day > day && f.day < day + days && (f.homeClubId === clubId || f.awayClubId === clubId),
    ).length
    if (days >= longTermInjury.days && missed >= longTermInjury.fixtures) {
      longTermInjured[playerId] = true
    }
  }
  const live = { ...state.live }
  delete live[fixture.id]

  return {
    played: { fixture, input, seed, events, match },
    state: {
      ...state,
      nextFixture: state.nextFixture + 1,
      fatigue: { ...state.fatigue, ...Object.fromEntries(match.fatigue) },
      lastPlayed: { ...state.lastPlayed, [homeClubId]: day, [awayClubId]: day },
      goalieHistory: {
        ...state.goalieHistory,
        [homeClubId]: afterStart(
          state.goalieHistory[homeClubId] ?? null,
          input.homeLineup.starter,
          day,
        ),
        [awayClubId]: afterStart(
          state.goalieHistory[awayClubId] ?? null,
          input.awayLineup.starter,
          day,
        ),
      },
      absent,
      injuredReserve,
      longTermInjured,
      live,
      standings:
        state.playoffs === null
          ? foldStandings(state.structure, [match], state.standings)
          : state.standings,
      totals:
        state.playoffs === null
          ? { ...state.totals, regular: foldTotals(state.totals.regular, [match]) }
          : { ...state.totals, playoffs: foldTotals(state.totals.playoffs, [match]) },
      // With farm games (#135): when each Skater's fatigue dates from, and form.
      affiliates: state.affiliates && {
        ...state.affiliates,
        fatiguedOn: fatiguedOn(state.affiliates.fatiguedOn, match, day),
        recent:
          state.playoffs === null
            ? foldRecent(state.affiliates.recent, match, 'nhl')
            : state.affiliates.recent,
      },
    },
  }
}

/**
 * A Season's Clubs with everyone they hold, a Player on waivers back on the farm
 * of the Club that put him there (ADR-036): who a Club holds, for a reader that
 * does not follow the waivers.
 */
export function clubsHolding(state: SeasonState): Club[] {
  return state.clubs.map((club) => {
    const waived = state.waivers.filter((w) => w.clubId === club.id).map((w) => w.player)
    return waived.length === 0 ? club : { ...club, farm: [...farmOf(club), ...waived] }
  })
}

// ---------------------------------------------------------------------------
// The farm's games (ADR-036, #135)

/**
 * The affiliates' Season before its first day: their schedule from a stream of
 * its own (D-08), ids apart from the Competition's, and each Club's Players on
 * minor-league contracts, those carried from the Season before and as many more
 * as fill the affiliate to the league's shape.
 */
function freshAffiliates(
  seed: number,
  structure: CompetitionStructure,
  rules: FarmRules,
  year: number,
  clubs: readonly Club[],
  carried: Readonly<Record<ClubId, readonly Player[]>>,
): AffiliateSeason {
  const farmStructure = affiliateStructure(structure, rules.league)
  const seasonId = year === 1 ? `s${seed}-farm` : `s${seed}-y${year}-farm`
  const fixtures = generateSchedule({
    structure: farmStructure,
    seasonId,
    rng: createRng(seed).fork(`farm-schedule:y${year}`),
  }).sort((a, b) => a.day - b.day || a.round - b.round)
  const minorLeague = Object.fromEntries(
    clubs.map((club) => [
      club.id,
      minorLeagueFor(
        club,
        carried[club.id] ?? [],
        rules,
        createRng(seed).fork(`minor:y${year}:${club.id}`),
        year,
      ),
    ]),
  )
  return {
    structure: farmStructure,
    fixtures,
    nextFixture: 0,
    minorLeague,
    standings: foldStandings(farmStructure, []),
    totals: NO_TOTALS,
    lastPlayed: {},
    goalieHistory: {},
    fatiguedOn: {},
    recent: {},
    awaiting: {},
  }
}

/**
 * A Club's Players on minor-league contracts as a Season starts: beyond the
 * league's shape, with the Club's farm counted, the weakest are let go; short of
 * it, or of a natural position to dress, undrafted fills sign (ADR-023), from a
 * stream of the Club's own. A prospect on loan is not on the farm.
 */
function minorLeagueFor(
  club: Club,
  carried: readonly Player[],
  rules: FarmRules,
  rng: Rng,
  year: number,
): Player[] {
  const shape = rules.league.roster
  const farm = farmOf(club)
  const kept: Player[] = []
  for (const group of ['forward', 'defence', 'goalie'] as const) {
    const room = Math.max(0, shape[group] - farm.filter((p) => positionGroup(p) === group).length)
    kept.push(
      ...carried
        .filter((p) => positionGroup(p) === group)
        .sort((a, b) => playerLevel(b) - playerLevel(a) || (a.id < b.id ? -1 : 1))
        .slice(0, room),
    )
  }
  return [...kept, ...signedMinor(affiliateOf(club, kept), shape, rng, year, club.id)]
}

/**
 * Undrafted fills signed to minor-league contracts for an affiliate: up to the
 * shape at each group, and above it for every natural position its fit Players
 * are short of to dress a Lineup.
 */
function signedMinor(
  affiliate: Club,
  shape: Readonly<Record<PositionGroup, number>>,
  rng: Rng,
  year: number,
  clubId: ClubId,
  fit: (player: Player) => boolean = () => true,
): Player[] {
  const all = [...affiliate.skaters, ...affiliate.goalies]
  const short = shortOf({
    ...affiliate,
    skaters: affiliate.skaters.filter(fit),
    goalies: affiliate.goalies.filter(fit),
  })
  const count = (group: PositionGroup) => all.filter((p) => positionGroup(p) === group).length
  const fitCount = (group: PositionGroup) =>
    all.filter((p) => positionGroup(p) === group && fit(p)).length
  const target = (group: PositionGroup) =>
    count(group) +
    Math.max(
      shape[group] - count(group),
      short.filter((n) => groupOfNatural(n) === group).length,
      DRESSED[group] - fitCount(group),
      0,
    )
  const filled = filledRosterAt(affiliate, short, rng, year, {
    forwards: target('forward'),
    defence: target('defence'),
    goalies: target('goalie'),
  })
  const had = new Set(all.map((p) => p.id))
  return [...filled.skaters, ...filled.goalies]
    .filter((p) => !had.has(p.id))
    .map((p) => ({ ...p, clubId }))
}

/**
 * The affiliates playing on `day` with enough fit Players to dress: one short
 * signs fills to minor-league contracts, from a stream of the Club and the day.
 */
function toppedUp(state: SeasonState, day: number): SeasonState {
  const aff = state.affiliates!
  const playing = new Set(
    aff.fixtures
      .slice(aff.nextFixture)
      .filter((f) => f.day === day)
      .flatMap((f) => [parentOf(f.homeClubId), parentOf(f.awayClubId)]),
  )
  let minorLeague: Record<ClubId, readonly Player[]> | undefined
  for (const club of state.clubs) {
    if (!playing.has(club.id)) continue
    const minors = aff.minorLeague[club.id] ?? []
    const signed = signedMinor(
      affiliateOf(club, minors),
      { forward: 0, defence: 0, goalie: 0 },
      createRng(state.seed).fork(`minor:y${state.year}:${club.id}:d${day}`),
      state.year,
      club.id,
      (p) => daysOut(state, p.id, day) === 0,
    )
    if (signed.length === 0) continue
    minorLeague ??= { ...aff.minorLeague }
    minorLeague[club.id] = [...minors, ...signed]
  }
  return minorLeague ? { ...state, affiliates: { ...aff, minorLeague } } : state
}

/** A Club's affiliate on `day`, each Skater rested since his last Fixture in either league. */
function restedAffiliate(state: SeasonState, clubId: ClubId, day: number): Club {
  const aff = state.affiliates!
  const affiliate = affiliateOf(clubOf(state, clubId), aff.minorLeague[clubId] ?? [])
  return {
    ...affiliate,
    skaters: affiliate.skaters.map((skater) => {
      const since = aff.fatiguedOn[skater.id]
      return since === undefined
        ? skater
        : {
            ...skater,
            fatigue: afterRest(
              state.fatigue[skater.id] ?? 0,
              day - since,
              skater.attributes.stamina,
            ),
          }
    }),
  }
}

/**
 * The assistant's Lineup for an affiliate, the builder every Club's assistant
 * uses (D-04), from its fit Players, with the Goalie rotation of the default
 * Tactics.
 */
function affiliateLineup(state: SeasonState, affiliate: Club, day: number): Lineup {
  const fit = <T extends { id: PlayerId }>(players: readonly T[]) =>
    players.filter((player) => daysOut(state, player.id, day) === 0)
  let lineup: Lineup
  try {
    lineup = buildNaiveLineup({
      ...affiliate,
      skaters: fit(affiliate.skaters),
      goalies: fit(affiliate.goalies),
    })
  } catch {
    const out = new Set(
      [...affiliate.skaters, ...affiliate.goalies]
        .filter((p) => daysOut(state, p.id, day) > 0)
        .map((p) => p.id),
    )
    lineup = withoutInjured(affiliate, buildNaiveLineup(affiliate), out)
  }
  return lineupForFixture(lineup, day, state.affiliates!.goalieHistory[affiliate.id] ?? null)
}

/**
 * One farm Fixture played (ADR-036, #135): the same engine (D-01) on the
 * Fixture's own stream (D-08). Its injuries and fatigue go to the Season's
 * record, its counts and table to the affiliates' (D-03). A Player on a farm is
 * on no active Roster, so no injury here puts anyone on Injured Reserve.
 */
function playFarmFixture(
  state: SeasonState,
  fixture: Fixture,
): { state: SeasonState; played: PlayedFixture } {
  const aff = state.affiliates!
  const { day } = fixture
  const homeClub = restedAffiliate(state, parentOf(fixture.homeClubId), day)
  const awayClub = restedAffiliate(state, parentOf(fixture.awayClubId), day)
  const input: FixtureInput = {
    fixture,
    homeClub,
    awayClub,
    homeLineup: affiliateLineup(state, homeClub, day),
    awayLineup: affiliateLineup(state, awayClub, day),
  }
  const seed = seedOf(state, fixture)
  const events = simulateFixture(input, seed)
  const match = foldMatch(fixture, events)

  const absent = { ...state.absent }
  for (const { playerId, days } of match.injuries) absent[playerId] = day + days
  const awaiting = { ...aff.awaiting }
  for (const id of [...dressed(input.homeLineup), ...dressed(input.awayLineup)]) {
    delete awaiting[id]
  }
  return {
    played: { fixture, input, seed, events, match },
    state: {
      ...state,
      absent,
      fatigue: { ...state.fatigue, ...Object.fromEntries(match.fatigue) },
      affiliates: {
        ...aff,
        nextFixture: aff.nextFixture + 1,
        lastPlayed: { ...aff.lastPlayed, [fixture.homeClubId]: day, [fixture.awayClubId]: day },
        goalieHistory: {
          ...aff.goalieHistory,
          [fixture.homeClubId]: afterStart(
            aff.goalieHistory[fixture.homeClubId] ?? null,
            input.homeLineup.starter,
            day,
          ),
          [fixture.awayClubId]: afterStart(
            aff.goalieHistory[fixture.awayClubId] ?? null,
            input.awayLineup.starter,
            day,
          ),
        },
        standings: foldStandings(aff.structure, [match], aff.standings),
        totals: foldTotals(aff.totals, [match]),
        fatiguedOn: fatiguedOn(aff.fatiguedOn, match, day),
        recent: foldRecent(aff.recent, match, 'farm'),
        awaiting,
      },
    },
  }
}

/** The days each Skater's fatigue dates from, after a Match on `day`. */
function fatiguedOn(
  before: Readonly<Record<PlayerId, number>>,
  match: MatchStats,
  day: number,
): Record<PlayerId, number> {
  return { ...before, ...Object.fromEntries([...match.fatigue.keys()].map((id) => [id, day])) }
}

/**
 * Who played as a regular for an affiliate this Season, in a run that plays the
 * farm's games: dressed for at least half of its Fixtures, as a regular for his
 * Club is (ADR-022, ADR-036).
 */
function farmRegularsByFixtures(aff: AffiliateSeason): Set<PlayerId> {
  const fixtures = new Map(aff.standings.map((row) => [row.clubId, row.gamesPlayed]))
  const regulars = new Set<PlayerId>()
  for (const [id, line] of [
    ...Object.entries(aff.totals.skaters),
    ...Object.entries(aff.totals.goalies),
  ]) {
    const of = fixtures.get(line.clubId) ?? 0
    if (of > 0 && line.gamesPlayed * 2 >= of) regulars.add(id)
  }
  return regulars
}

/**
 * Each Club's Players on minor-league contracts after the Season: some retire
 * by age and role among them (ADR-027), the rest develop, a farm regular with
 * the farm's bonus, and are a year older and rested. Each draws from his own
 * stream (D-08).
 */
function minorLeagueAfter(state: SeasonState): Record<ClubId, Player[]> {
  const aff = state.affiliates!
  const regulars = farmRegularsByFixtures(aff)
  const pools: Club[] = state.clubs.map((club) => {
    const minors = aff.minorLeague[club.id] ?? []
    return {
      id: club.id,
      code: club.code,
      name: club.name,
      skaters: minors.filter((p): p is Skater => !isGoalie(p)),
      goalies: minors.filter((p): p is Goalie => isGoalie(p)),
    }
  })
  const roleOf = roles(pools, (player) => {
    const skater = aff.totals.skaters[player.id]
    const fixtures = (skater ?? aff.totals.goalies[player.id])?.gamesPlayed ?? 0
    return {
      fixtures,
      secondsPerFixture: skater && fixtures > 0 ? skater.iceTimeSeconds / fixtures : 0,
      injured: player.id in state.absent,
    }
  })
  const gone = new Set(
    leaving(pools, roleOf, (player) =>
      createRng(state.seed).fork(`leave:y${state.year}:${player.id}`),
    ).map((departure) => departure.playerId),
  )
  return Object.fromEntries(
    pools.map((pool) => [
      pool.id,
      [...pool.skaters, ...pool.goalies]
        .filter((player) => !gone.has(player.id))
        .map((player) =>
          olderAndRested(developed(state, pool.id, player, regulars.has(player.id))),
        ),
    ]),
  )
}

/**
 * Each Player's level plus his form (ADR-036, #135), or null while his form
 * says nothing: form read against the rates of both leagues so far this Season.
 */
function meritOf(state: SeasonState): (playerId: PlayerId) => number | null {
  const aff = state.affiliates!
  const players = new Map<PlayerId, { level: number; group: PositionGroup }>()
  for (const club of state.clubs) {
    for (const player of [...contractedOf(club), ...(aff.minorLeague[club.id] ?? [])]) {
      players.set(player.id, { level: playerLevel(player), group: positionGroup(player) })
    }
  }
  const of = (id: PlayerId) => players.get(id)
  const rates: Record<League, LeagueRates> = {
    nhl: leagueRates(state.totals.regular, of),
    farm: leagueRates(aff.totals, of),
  }
  return (id) => {
    const player = players.get(id)
    if (!player) return null
    const form = formOf(aff.recent[id], player.level, player.group, rates)
    return form === null ? null : player.level + form
  }
}
