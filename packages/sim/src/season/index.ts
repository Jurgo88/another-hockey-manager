import type { Club, Lineup, Tactics } from '../domain/club.js'
import type { CompetitionStructure } from '../domain/competition.js'
import type { MatchEvent } from '../domain/event.js'
import type { Fixture, FixtureChange, FixtureId, FixtureInput } from '../domain/fixture.js'
import type { DraftFormat, DraftPick, Prospect, RosterMoves } from '../domain/draft.js'
import {
  isGoalie,
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
import { ROSTER_SHAPE, type RosterProvider } from '../domain/roster.js'
import type { StandingsRow } from '../domain/standings.js'
import {
  NHL_2026_27,
  NHL_2026_27_CLUB_SEEDS,
  NHL_DRAFT_FORMAT,
  NHL_PLAYOFF_FORMAT,
} from '../data/nhl-2026-27.js'
import { develop } from '../develop/index.js'
import {
  applyMoves,
  draftOrder,
  fillLevel,
  generateClass,
  makePicks,
  naturalOf,
  type Natural,
  movesViolations,
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
  /** Drafted Players whose Clubs hold their rights, off the Rosters (ADR-024). */
  prospects: readonly Prospect[]
  /** The draft held before this Season, empty before the first (ADR-028). */
  draft: readonly DraftPick[]
}

/**
 * Between one Season and the next, while Managers decide (ADR-028). Plain JSON,
 * like a Season, and every step is pure. The draft window comes first, then the
 * Roster window; where a Club declared nothing, the assistant decides.
 */
export interface Offseason {
  phase: 'draft' | 'roster'
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
  /** The class, until the draft is made. */
  draftClass: readonly Player[]
  /** Each Club's declared order of prospects. */
  lists: Readonly<Record<ClubId, readonly PlayerId[]>>
  picks: readonly DraftPick[]
  /** Each Club's declared moves. */
  moves: Readonly<Record<ClubId, RosterMoves>>
}

/** Roster moves that break the rules: the Manager has to change them. */
export class InvalidMovesError extends Error {
  constructor(
    readonly clubId: ClubId,
    readonly violations: readonly string[],
  ) {
    super(`Moves of Club ${clubId} break ${violations.length} rule(s): ${violations.join('; ')}`)
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
 * One full NHL 2026-27 Season before its first day, on the Rosters a provider
 * gives (D-05), or on 32 generated Clubs.
 */
export async function startSeason(
  seed: number,
  provider: RosterProvider = createGeneratedRosterProvider({
    structure: NHL_2026_27,
    seed,
    clubIdentities: new Map(
      NHL_2026_27_CLUB_SEEDS.map((club) => [club.id, { code: club.code, name: club.name }]),
    ),
  }),
): Promise<SeasonState> {
  const { clubs } = await provider.loadCompetition(NHL_2026_27.id)
  const unset: SeasonState = {
    ...freshSeason(seed, NHL_2026_27, 1),
    seed,
    playoffFormat: NHL_PLAYOFF_FORMAT,
    draftFormat: NHL_DRAFT_FORMAT,
    clubs,
    lineups: {},
    absent: {},
    departures: [],
    prospects: [],
    draft: [],
  }
  // Every Club opens as an AI Manager would, through the call any Manager uses (D-04).
  return clubs.reduce((state, club) => setLineup(state, club.id, buildNaiveLineup(club)), unset)
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
 * Rights older than the format allows expire. The draft order is drawn and the
 * class generated, each from a stream of its own (D-08).
 */
export function endSeason(state: SeasonState): Offseason {
  if (!isSeasonOver(state)) throw new Error(`Season s${state.seed} has no champion yet`)

  const year = state.year + 1
  const format = state.draftFormat
  const departures = leaving(
    state.clubs,
    roles(state.clubs, (player) => usageOf(state, player)),
    (player) => createRng(state.seed).fork(`leave:y${state.year}:${player.id}`),
  )
  const gone = new Set(departures.map((departure) => departure.playerId))
  const clubs = state.clubs.map((club) => {
    const grown = <P extends Player>(player: P) => olderAndRested(developed(state, club.id, player))
    const stays = (player: Player) => !gone.has(player.id)
    return {
      ...club,
      skaters: club.skaters.filter(stays).map(grown),
      goalies: club.goalies.filter(stays).map(grown),
    }
  })
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
  }
}

/**
 * Declares the order in which a Club wants the prospects of the class, for any
 * Manager (D-04). A pick takes the first still available; with none left, the
 * assistant chooses.
 */
export function setDraftList(off: Offseason, clubId: ClubId, prospectIds: readonly PlayerId[]): Offseason {
  if (off.phase !== 'draft') throw new Error('The draft has been made')
  if (!off.order.includes(clubId)) throw new Error(`No Club ${clubId} in the draft`)
  const inClass = new Set(off.draftClass.map((player) => player.id))
  const unknown = prospectIds.filter((id) => !inClass.has(id))
  if (unknown.length > 0) throw new Error(`Not in the class: ${unknown.join(', ')}`)
  return { ...off, lists: { ...off.lists, [clubId]: [...prospectIds] } }
}

/** Makes every pick of the draft, and opens the Roster window (ADR-028). */
export function runDraft(off: Offseason): Offseason {
  if (off.phase !== 'draft') return off
  const { picks, prospects } = makePicks(
    off.ended.draftFormat,
    off.year,
    off.order,
    off.draftClass,
    off.lists,
  )
  return {
    ...off,
    phase: 'roster',
    prospects: [...off.prospects, ...prospects],
    draftClass: [],
    picks,
  }
}

/** The assistant's call-ups and releases for a Club, once the draft is made (ADR-028). */
export function proposedMoves(off: Offseason, clubId: ClubId): RosterMoves {
  if (off.phase !== 'roster') throw new Error('The draft has not been made')
  return assistantMoves(offseasonClub(off, clubId), off.prospects, gapsOf(off, clubId))
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
      violations.push('the Club could not dress a Lineup')
    }
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
  const off = runDraft(offseason)
  const state = off.ended
  const year = off.year
  const fresh = freshSeason(state.seed, state.structure, year)
  const { daysPerYear } = state.structure.calendar
  const firstDay = fresh.fixtures[0]!.day

  const lastSeasonAge = (player: Player) => player.age - 1
  const departures: Departure[] = [...off.departures]
  const joined = new Set<PlayerId>()
  const moved = new Map<ClubId, { club: Club; missing: Player[] }>()
  for (const club of off.clubs) {
    const moves = off.moves[club.id] ?? assistantMoves(club, off.prospects, gapsOf(off, club.id))
    const after = movedClub(off, club, moves)
    for (const player of after.joined) joined.add(player.id)
    for (const player of after.released) {
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
  const clubOrder = [...off.order, ...off.clubs.map((c) => c.id).filter((id) => !off.order.includes(id))]
  for (const clubId of clubOrder) {
    const entry = moved.get(clubId)
    if (!entry) continue
    const taken = takeUndrafted(entry.club, entry.missing, undrafted)
    undrafted = undrafted.filter((player) => !taken.some((t) => t.id === player.id))
    entry.club = withPlayers(entry.club, taken.map((player) => ({ ...player, clubId })))
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
    return filledRoster(after, missing, fillStream(off, club.id), year)
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
  }
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
function takeUndrafted(club: Club, missing: readonly Player[], undrafted: readonly Player[]): Player[] {
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
  try {
    return buildNaiveLineup(
      { ...club, skaters: fit(club.skaters), goalies: fit(club.goalies) },
      tactics,
    )
  } catch {
    return replaceInjured(state, clubId, buildNaiveLineup(club, tactics))
  }
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

/** The Lineup a Club dresses on `day`, once injuries and Goalie rotation have had their say. */
function lineupFor(state: SeasonState, clubId: ClubId, day: number): Lineup {
  const healthy = replaceInjured(state, clubId, state.lineups[clubId]!, day)
  // Rotation is a regular-Season rule: nobody rests a starter in the playoffs.
  if (state.playoffs !== null) return healthy
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
