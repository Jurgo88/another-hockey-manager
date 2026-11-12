import type { Club, Lineup, Tactics } from '../domain/club.js'
import type { CompetitionStructure, SeasonFormat } from '../domain/competition.js'
import type {
  CapRules,
  Contract,
  DeadMoney,
  ReSigning,
  ReSigningViolation,
} from '../domain/contract.js'
import type { MatchEvent } from '../domain/event.js'
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
  type Skater,
} from '../domain/player.js'
import type { PlayoffFormat, PlayoffState } from '../domain/playoff.js'
import { ROSTER_SHAPE, ROSTER_SIZE, type RosterProvider } from '../domain/roster.js'
import type { StandingsRow } from '../domain/standings.js'
import { NHL_2026_27_CLUB_SEEDS, NHL_2026_27_SEASON } from '../data/nhl-2026-27.js'
import { develop } from '../develop/index.js'
import {
  applyMoves,
  draftOrder,
  fillLevel,
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
import {
  askingContract,
  atFloor,
  buyout,
  deadCharge,
  entryLevelContract,
  minimumContract,
  openingContracts,
  placesOf,
  tickedContracts,
  tickedDeadMoney,
  type Place,
} from '../generate/contracts.js'
import { createGeneratedRosterProvider } from '../generate/roster.js'
import {
  departures as leaving,
  filledRoster,
  roles,
  type Departure,
  type SeasonUsage,
} from '../leave/index.js'
import { createRng } from '../rng/index.js'
import type { SeasonRecord } from '../stats/history.js'
import { foldMatch, type MatchStats } from '../stats/match.js'
import { foldTotals, NO_TOTALS, type SeasonTotals } from '../stats/season.js'
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
  /** Every rostered Player holds a contract (#125). */
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
}

/**
 * Between one Season and the next, while Managers decide (ADR-028). Plain JSON,
 * like a Season, and every step is pure. The draft window comes first, then the
 * re-signing window (ADR-032), then the Roster window; where a Club declared
 * nothing, the assistant decides.
 */
export interface Offseason {
  phase: 'draft' | 'resign' | 'roster'
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
  | { kind: 'joined'; day: number; playerId: PlayerId }
  | { kind: 'reSigned'; day: number; playerId: PlayerId; years: number }
  | { kind: 'letGo'; day: number; playerId: PlayerId }

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
  // The floor binds as every Season starts, the first too (ADR-031).
  const clubs = openingContracts(format.cap, loaded.clubs, createRng(seed).fork('contracts')).map(
    (club) => atFloor(format.cap, club, 0),
  )
  const unset: SeasonState = {
    ...freshSeason(seed, structure, 1),
    seed,
    playoffFormat: format.playoffs,
    draftFormat: format.draft,
    capRules: format.cap,
    clubs,
    lineups: {},
    absent: {},
    departures: [],
    prospects: openingProspects(
      format.draft,
      clubs.map((club) => club.id),
      createRng(seed).fork('opening'),
    ),
    draft: [],
    deadMoney: {},
  }
  // Every Club opens as an AI Manager would, through the call any Manager uses (D-04).
  return clubs.reduce((state, club) => setLineup(state, club.id, buildNaiveLineup(club)), unset)
}

/**
 * A Season as stored before contracts (#125): without cap rules or dead money,
 * its Players without contracts, its rules perhaps without the floor (#129).
 */
export type UncontractedSeason = Omit<SeasonState, 'capRules' | 'deadMoney'> & {
  capRules?: Partial<CapRules>
  deadMoney?: SeasonState['deadMoney']
}

/** A phase between Seasons as stored before contracts (#125). */
export type UncontractedOffseason = Omit<
  Offseason,
  'ended' | 'expiring' | 'reSignings' | 'deadMoney'
> &
  Partial<Pick<Offseason, 'expiring' | 'reSignings' | 'deadMoney'>> & { ended: UncontractedSeason }

const unsigned = (clubs: readonly Club[]) =>
  clubs.some((club) => [...club.skaters, ...club.goalies].some((player) => !player.contract))

/**
 * A Season stored before contracts brought up to them (#125): the NHL's cap
 * rules, and every Player on a Roster under the contract the league would have
 * opened with. The same Season gives the same contracts each time it is read.
 */
export function contractedSeason(state: UncontractedSeason): SeasonState {
  const current = state.capRules?.lowerLimit !== undefined && state.deadMoney !== undefined
  if (current && !unsigned(state.clubs)) return state as SeasonState
  // Rules stored before #129 lack the floor, buyouts and the playoff regime.
  const capRules: CapRules = { ...NHL_2026_27_SEASON.cap, ...state.capRules }
  return {
    ...state,
    capRules,
    deadMoney: state.deadMoney ?? {},
    clubs: unsigned(state.clubs)
      ? openingContracts(capRules, state.clubs, createRng(state.seed).fork('contracts')).map(
          (club) => atFloor(capRules, club, 0),
        )
      : state.clubs,
  }
}

/** A phase between Seasons stored before contracts brought up to them (#125). */
export function contractedOffseason(off: UncontractedOffseason): Offseason {
  // Stored before the re-signing window (#127): nothing waits on it.
  const window = {
    expiring: off.expiring ?? {},
    reSignings: off.reSignings ?? {},
    deadMoney: off.deadMoney ?? {},
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
  const roleOf = roles(state.clubs, (player) => usageOf(state, player))
  const departures = leaving(state.clubs, roleOf, (player) =>
    createRng(state.seed).fork(`leave:y${state.year}:${player.id}`),
  )
  const gone = new Set(departures.map((departure) => departure.playerId))
  const grownClubs = state.clubs.map((club) => {
    const grown = <P extends Player>(player: P) => olderAndRested(developed(state, club.id, player))
    const stays = (player: Player) => !gone.has(player.id)
    return {
      ...club,
      skaters: club.skaters.filter(stays).map(grown),
      goalies: club.goalies.filter(stays).map(grown),
    }
  })
  const clubs = tickedContracts(grownClubs)
  const places = placesOf(state.clubs, (player) => roleOf.get(player.id) ?? 0)
  const expiring = Object.fromEntries(
    clubs
      .flatMap((club) => [...club.skaters, ...club.goalies])
      .filter((player) => player.contract?.years === 0)
      .map((player) => [player.id, places.get(player.id)!] as const),
  )
  const grownProspects = state.prospects.map((prospect) => ({
    ...prospect,
    player: olderAndRested(developed(state, prospect.player.clubId, prospect.player)),
  }))
  const expires = (prospect: Prospect) => prospect.year + format.rightsSeasons <= year
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
  return affordableMoves(off, club, assistantMoves(club, off.prospects, gapsOf(off, clubId)))
}

/**
 * Declares a Club's call-ups and releases, for any Manager (D-04). They replace
 * the assistant's for that Club. They must keep it within its shape, and leave
 * it, once its gaps are filled, able to dress a Lineup.
 */
export function setRosterMoves(off: Offseason, clubId: ClubId, moves: RosterMoves): Offseason {
  if (off.phase !== 'roster') throw new Error('The draft has not been made')
  const club = offseasonClub(off, clubId)
  const violations = movesViolations(club, off.prospects, moves)
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
 * The next Season from the phase between Seasons, before its first day. The
 * draft is made if it has not been. Each Club's moves are made, its own or the
 * assistant's; then, Club by Club in draft order, each gap takes the best
 * undrafted former prospect of its group who is no weaker than a generated fill,
 * and a generated undrafted Player otherwise (ADR-023, ADR-028). A former
 * prospect nobody takes leaves the league.
 *
 * The table starts again and the schedule is drawn anew from a stream of its
 * own (D-08). An absence runs on across the summer by the calendar. A declared
 * Lineup stays while it is still valid, and otherwise the assistant builds one
 * with the same Tactics.
 */
export function startNextSeason(offseason: Offseason): SeasonState {
  const off = runReSigning(offseason)
  const state = off.ended
  const year = off.year
  const fresh = freshSeason(state.seed, state.structure, year)
  const { daysPerYear } = state.structure.calendar
  const firstDay = fresh.fixtures[0]!.day

  const lastSeasonAge = (player: Player) => player.age - 1
  const departures: Departure[] = [...off.departures]
  const deadMoney: Record<ClubId, readonly DeadMoney[]> = { ...off.deadMoney }
  const joined = new Set<PlayerId>()
  const moved = new Map<ClubId, { club: Club; missing: Player[] }>()
  for (const club of off.clubs) {
    const moves =
      off.moves[club.id] ??
      affordableMoves(off, club, assistantMoves(club, off.prospects, gapsOf(off, club.id)))
    const after = movedClub(off, club, moves)
    for (const player of after.joined) joined.add(player.id)
    for (const player of after.released) {
      // A release is a buyout (ADR-031).
      const owed = buyout(state.capRules, player)
      if (owed) deadMoney[club.id] = [...(deadMoney[club.id] ?? []), owed]
      departures.push({
        playerId: player.id,
        clubId: club.id,
        age: lastSeasonAge(player),
        reason: 'released',
      })
    }
    moved.set(club.id, { club: after.club, missing: after.missing })
  }

  let undrafted = [...off.undrafted]
  const clubOrder = [
    ...off.order,
    ...off.clubs.map((c) => c.id).filter((id) => !off.order.includes(id)),
  ]
  for (const clubId of clubOrder) {
    const entry = moved.get(clubId)
    if (!entry) continue
    const taken = takeUndrafted(entry.club, entry.missing, undrafted)
    undrafted = undrafted.filter((player) => !taken.some((t) => t.id === player.id))
    entry.club = withPlayers(
      entry.club,
      taken.map((player) => ({ ...player, clubId })),
    )
    entry.missing = stillMissing(entry.missing, taken)
  }
  for (const player of undrafted) {
    departures.push({
      playerId: player.id,
      clubId: player.clubId,
      age: lastSeasonAge(player),
      reason: 'rights-expired',
    })
  }

  const clubs = off.clubs.map((club) => {
    const { club: after, missing } = moved.get(club.id)!
    const full = signed(
      state.capRules,
      filledRoster(after, missing, fillStream(off, club.id), year),
      joined,
    )
    // The floor binds as the Season starts (ADR-031).
    return atFloor(state.capRules, full, deadCharge(deadMoney[club.id]))
  })
  const gone = new Set(departures.map((departure) => departure.playerId))
  const absent = Object.fromEntries(
    Object.entries(state.absent)
      .filter(([id]) => !gone.has(id))
      .map(([id, back]) => [id, back - daysPerYear] as const)
      .filter(([, back]) => back > firstDay),
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
    departures,
    prospects: off.prospects.filter((prospect) => !joined.has(prospect.player.id)),
    draft: off.picks,
    deadMoney,
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
  return club ? rosterIds(club).filter((id) => id in off.expiring) : []
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
    (a, b) => playerLevel(b) - playerLevel(a) || (a.id < b.id ? -1 : 1),
  )
  for (const player of best) {
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
 * re-signings are made, its own or the assistant's; a Player let go leaves the
 * league as unsigned until free agency exists (#127), and his place is a gap.
 * The draft is made first if it has not been.
 */
export function runReSigning(offseason: Offseason): Offseason {
  const off = offseason.phase === 'draft' ? runDraft(offseason) : offseason
  if (off.phase !== 'resign') return off
  const departures = [...off.departures]
  const made: Record<ClubId, readonly ReSigning[]> = {}
  const clubs = off.clubs.map((club) => {
    const decided = off.reSignings[club.id] ?? proposedReSignings(off, club.id)
    made[club.id] = decided
    const years = new Map(decided.map((r) => [r.playerId, r.years]))
    const settle = <P extends Player>(players: readonly P[]): P[] =>
      players.flatMap((player) => {
        if (!(player.id in off.expiring)) return [player]
        const term = years.get(player.id)
        if (term !== undefined) return [{ ...player, contract: askOf(off, player.id, term) }]
        departures.push({
          playerId: player.id,
          clubId: club.id,
          age: player.age - 1,
          reason: 'unsigned',
        })
        return []
      })
    return { ...club, skaters: settle(club.skaters), goalies: settle(club.goalies) }
  })
  return { ...off, phase: 'roster', clubs, departures, reSignings: made }
}

/** Players whose contracts count for a Club's payroll in the Season ahead. */
const contracted = (players: readonly Player[]) =>
  players.reduce((sum, player) => sum + (player.contract?.capHit ?? 0), 0)

/**
 * A Club's payroll for the Season ahead (ADR-031): the contracts it holds, its
 * dead money, and every place its Roster still has open at the minimum, since
 * the fill will take them at that.
 */
function payrollAhead(rules: CapRules, players: readonly Player[], dead: number): number {
  return contracted(players) + Math.max(0, ROSTER_SIZE - players.length) * rules.minimum + dead
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
  return {
    before: payrollAhead(rules, players(none.club, new Set()), dead),
    after: payrollAhead(rules, players(after.club, new Set(moves.callUps)), dead + bought),
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
  let callUps = moves.callUps.slice(0, moves.callUps.length - moves.releases.length)
  while (callUps.length > 0 && !fits({ callUps, releases: [] })) callUps = callUps.slice(0, -1)
  return { callUps, releases: [] }
}

function offseasonClub(off: Offseason, clubId: ClubId): Club {
  const club = off.clubs.find((candidate) => candidate.id === clubId)
  if (!club) throw new Error(`No Club ${clubId}`)
  return club
}

/** A Player who left after the Season, as he was in it. */
function leaverOf(state: SeasonState, playerId: PlayerId): Player {
  for (const club of state.clubs) {
    const player = [...club.skaters, ...club.goalies].find((p) => p.id === playerId)
    if (player) return player
  }
  throw new Error(`No Player ${playerId}`)
}

const GROUP_SHAPE: Readonly<Record<PositionGroup, number>> = {
  forward: ROSTER_SHAPE.forwards,
  defence: ROSTER_SHAPE.defence,
  goalie: ROSTER_SHAPE.goalies,
}

/** Who left a Club after the Season, as they were in it. */
function leaversOf(off: Offseason, clubId: ClubId): Player[] {
  return off.departures
    .filter((departure) => departure.clubId === clubId)
    .map((departure) => leaverOf(off.ended, departure.playerId))
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
  const after = applyMoves(club, off.prospects, moves)
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

/**
 * The undrafted former prospects a Club takes for its gaps (ADR-028): for each
 * Player it is missing, the best at his natural position no weaker than a
 * generated fill, while the group has room.
 */
function takeUndrafted(
  club: Club,
  missing: readonly Player[],
  undrafted: readonly Player[],
): Player[] {
  const taken: Player[] = []
  const room = (group: PositionGroup) =>
    GROUP_SHAPE[group] -
    [...club.skaters, ...club.goalies, ...taken].filter((p) => positionGroup(p) === group).length
  for (const gap of missing) {
    const group = positionGroup(gap)
    if (room(group) <= 0) continue
    const best = undrafted
      .filter((p) => !taken.includes(p) && naturalOf(p) === naturalOf(gap))
      .filter((p) => playerLevel(p) >= fillLevel(group))
      .sort((a, b) => playerLevel(b) - playerLevel(a) || (a.id < b.id ? -1 : 1))[0]
    if (best) taken.push(best)
  }
  return taken
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
    draft: state.draft,
    departures: state.departures,
    roster: state.clubs.flatMap((club) =>
      [...club.skaters, ...club.goalies].map((player) => ({
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
  return {
    structure,
    year,
    fixtures,
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
function developed<P extends Player>(state: SeasonState, clubId: ClubId, player: P): P {
  const clubFixtures = state.standings.find((row) => row.clubId === clubId)?.gamesPlayed ?? 0
  const { skaters, goalies } = state.totals.regular
  const dressed = (skaters[player.id] ?? goalies[player.id])?.gamesPlayed ?? 0
  const rng = createRng(state.seed).fork(`develop:y${state.year}:${player.id}`)
  return develop(player, rng, { regular: clubFixtures > 0 && dressed * 2 >= clubFixtures })
}

/** A Player a year on: older, rested, and back to a neutral form. */
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
  return { ...player, age: player.age + 1, form: 50, fatigue: 0 }
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
  const out = new Set(rosterIds(club).filter((id) => daysOut(state, id, day) > 0))
  return withoutInjured(club, lineup, out)
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

/** True once the playoffs have a champion. */
export function isSeasonOver(state: SeasonState): boolean {
  return state.playoffs !== null && state.playoffs.champion !== null
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
  return [...recovered, ...injured]
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
  if (off.phase !== 'roster') return []
  const day = off.ended.fixtures.at(-1)!.day
  const kept = new Map((off.reSignings[clubId] ?? []).map((r) => [r.playerId, r.years]))
  return expiringIn(off.ended, off, clubId).map((playerId): ClubNotice => {
    const years = kept.get(playerId)
    return years === undefined
      ? { kind: 'letGo', day, playerId }
      : { kind: 'reSigned', day, playerId, years }
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
  // The next Season makes the draft and the re-signings if nobody did.
  const off = runReSigning(offseason)
  const day = next.fixtures[0]!.day
  const before = new Set(rosterIds(offseasonClub(off, clubId)))
  const held = new Set(
    off.prospects.filter((p) => p.player.clubId === clubId).map((p) => p.player.id),
  )
  const released = next.departures
    .filter((departure) => departure.clubId === clubId && departure.reason === 'released')
    .map((departure): ClubNotice => ({ kind: 'released', day, playerId: departure.playerId }))
  const arrived = rosterIds(clubOf(next, clubId))
    .filter((id) => !before.has(id))
    .map((id): ClubNotice => ({ kind: held.has(id) ? 'calledUp' : 'joined', day, playerId: id }))
  return [...released, ...arrived]
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
  if (!next) throw new Error(`Season s${state.seed} has no Fixtures left`)

  const played: PlayedFixture[] = []
  let current = recovered(state, next.day)
  for (;;) {
    const fixture = current.fixtures[current.nextFixture]
    if (fixture?.day !== next.day) break
    const step = playFixture(current, fixture)
    current = step.state
    played.push(step.played)
  }
  return { state: afterDay(current, next.day, played), day: next.day, played }
}

/**
 * Moves the playoffs on once the last due Fixture is in: the end of the regular
 * Season seeds them, and each game day credits its series and sets the next game.
 */
function afterDay(state: SeasonState, day: number, played: readonly PlayedFixture[]): SeasonState {
  if (state.nextFixture < state.fixtures.length) return state

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
  return Object.keys(absent).length === Object.keys(state.absent).length
    ? state
    : { ...state, absent }
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

function rested(state: SeasonState, clubId: ClubId, day: number): Club {
  const club = clubOf(state, clubId)
  const last = state.lastPlayed[clubId]
  if (last === undefined) return club
  return {
    ...club,
    skaters: club.skaters.map((skater) => ({
      ...skater,
      fatigue: afterRest(state.fatigue[skater.id]!, day - last, skater.attributes.stamina),
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
  if (!playoffCapBinds(state)) return lineup
  const club = clubOf(state, clubId)
  const injured = rosterIds(club).filter((id) => daysOut(state, id, day) > 0)
  const hit = new Map(
    [...club.skaters, ...club.goalies].map((p) => [p.id, p.contract?.capHit ?? 0]),
  )
  const out = new Set(injured)
  let current = withoutInjured(club, lineup, out)
  let charge = playoffCapCharge(state, clubId, current)
  while (charge > 1 + CAP_EPSILON) {
    const candidates = dressed(current)
      .filter((id) => !out.has(id))
      .sort((a, b) => hit.get(b)! - hit.get(a)! || (a < b ? -1 : 1))
    let improved = false
    for (const id of candidates) {
      const trial = withoutInjured(club, lineup, new Set([...out, id]))
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
  for (const { playerId, days } of match.injuries) absent[playerId] = day + days
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
      live,
      standings:
        state.playoffs === null
          ? foldStandings(state.structure, [match], state.standings)
          : state.standings,
      totals:
        state.playoffs === null
          ? { ...state.totals, regular: foldTotals(state.totals.regular, [match]) }
          : { ...state.totals, playoffs: foldTotals(state.totals.playoffs, [match]) },
    },
  }
}
