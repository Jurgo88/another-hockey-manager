import type { CompetitionStructure } from '../domain/competition.js'
import type { MatchEvent } from '../domain/event.js'
import type { FixtureId } from '../domain/fixture.js'
import { displayName, type ClubId, type PlayerId } from '../domain/player.js'
import { goalDifferential, sortStandings, type StandingsRow } from '../domain/standings.js'
import {
  points,
  savePercentage,
  type GoalieStats,
  type MatchStats,
  type SkaterStats,
} from '../stats/match.js'
import { conferenceTables, divisionTables, foldStandings } from '../stats/standings.js'
import {
  careerTotals,
  clubHistory,
  draftOutcomes,
  goalieCareer,
  skaterCareer,
  type CareerSeason,
  type ClubSeason,
  type DraftRoundOutcome,
  type PlayoffResult,
  type SeasonRecord,
} from '../stats/history.js'
import {
  ageProfile,
  payrolls,
  leavingRate,
  leavingRows,
  levelByAge,
  pointsSpread,
  tableDynamics,
  type LeavingRow,
} from '../stats/league.js'
import type { SimulatedRun, SimulatedSeason } from './season.js'

/**
 * Plain-text rendering of a simulated Season. Pure: these functions return
 * strings, and only the entry point touches the console or the disk.
 */

/** A Goalie needs this many Fixtures to appear among the leaders. */
const GOALIE_LEADER_MIN_FIXTURES = 20

export interface Column<T> {
  header: string
  /** Numbers right-align by default; names opt in. */
  align?: 'left'
  value: (row: T) => string | number
}

export function renderTable<T>(columns: readonly Column<T>[], rows: readonly T[]): string {
  const cells = rows.map((row) => columns.map((column) => String(column.value(row))))
  const widths = columns.map((column, i) =>
    Math.max(column.header.length, ...cells.map((line) => line[i]!.length)),
  )
  const renderLine = (line: readonly string[]) =>
    line
      .map((cell, i) =>
        columns[i]!.align === 'left' ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!),
      )
      .join('  ')
      .trimEnd()

  const header = renderLine(columns.map((column) => column.header))
  const rule = '-'.repeat(header.length)
  return [header, rule, ...cells.map(renderLine)].join('\n')
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function minutesSeconds(seconds: number): string {
  const whole = Math.round(seconds)
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

/** A rate the way hockey prints it: .912, not 0.912. */
function rate(value: number): string {
  return value.toFixed(3).replace(/^0/, '')
}

function byId<V extends { id: string }>(items: readonly V[]): Map<string, V> {
  return new Map(items.map((item) => [item.id, item]))
}

function clubCodes(season: Pick<SimulatedSeason, 'clubs'>): (clubId: ClubId) => string {
  const clubs = byId(season.clubs)
  return (clubId) => clubs.get(clubId)?.code ?? clubId
}

function playerNames(season: SimulatedSeason): (playerId: PlayerId) => string {
  const players = byId(season.clubs.flatMap((club) => [...club.skaters, ...club.goalies]))
  return (playerId) => {
    const player = players.get(playerId)
    return player ? displayName(player) : playerId
  }
}

function standingsColumns(season: Pick<SimulatedSeason, 'clubs'>): Column<StandingsRow>[] {
  const code = clubCodes(season)
  return [
    { header: 'Club', align: 'left', value: (row) => code(row.clubId) },
    { header: 'GP', value: (row) => row.gamesPlayed },
    { header: 'W', value: (row) => row.wins },
    { header: 'L', value: (row) => row.losses },
    { header: 'OTL', value: (row) => row.otLosses },
    { header: 'PTS', value: (row) => row.points },
    { header: 'RW', value: (row) => row.regulationWins },
    { header: 'GF', value: (row) => row.goalsFor },
    { header: 'GA', value: (row) => row.goalsAgainst },
    { header: 'DIFF', value: (row) => signed(goalDifferential(row)) },
  ]
}

function section(title: string, body: string): string {
  return `${title}\n\n${body}`
}

export function renderStandings(season: SimulatedSeason, structure: CompetitionStructure): string {
  const rows = foldStandings(structure, season.matches)
  const columns = standingsColumns(season)
  const divisions = divisionTables(rows)
  const conferences = conferenceTables(rows)

  const conferenceBlocks = structure.conferences.flatMap((conference) => [
    section(
      `${conference.name} Conference`,
      renderTable(columns, conferences.get(conference.id) ?? []),
    ),
    ...structure.divisions
      .filter((division) => division.conferenceId === conference.id)
      .map((division) =>
        section(
          `${division.name} Division`,
          renderTable(columns, divisions.get(division.id) ?? []),
        ),
      ),
  ])

  return conferenceBlocks.join('\n\n')
}

type Leader<S> = S & { playerId: PlayerId }

function compareSkaters(a: Leader<SkaterStats>, b: Leader<SkaterStats>): number {
  return (
    points(b) - points(a) ||
    b.goals - a.goals ||
    (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)
  )
}

export function renderScoringLeaders(season: SimulatedSeason, top: number): string {
  const name = playerNames(season)
  const code = clubCodes(season)
  const positions = new Map(
    season.clubs.flatMap((club) => club.skaters.map((s) => [s.id, s.preferredPositions[0]])),
  )
  const rows = [...season.season.skaters]
    .map(([playerId, stats]) => ({ ...stats, playerId }))
    .sort(compareSkaters)
    .slice(0, top)

  const columns: Column<Leader<SkaterStats>>[] = [
    { header: 'Player', align: 'left', value: (row) => name(row.playerId) },
    { header: 'Club', align: 'left', value: (row) => code(row.clubId) },
    { header: 'Pos', align: 'left', value: (row) => positions.get(row.playerId) ?? '' },
    { header: 'GP', value: (row) => row.gamesPlayed },
    { header: 'G', value: (row) => row.goals },
    { header: 'A', value: (row) => row.assists },
    { header: 'PTS', value: (row) => points(row) },
    { header: '+/-', value: (row) => signed(row.plusMinus) },
    { header: 'SOG', value: (row) => row.shotsOnGoal },
    { header: 'PPG', value: (row) => row.powerPlayGoals },
    { header: 'TOI/GP', value: (row) => minutesSeconds(row.iceTimeSeconds / row.gamesPlayed) },
  ]
  return renderTable(columns, rows)
}

export function renderGoalieLeaders(season: SimulatedSeason, top: number): string {
  const name = playerNames(season)
  const code = clubCodes(season)
  const rows = [...season.season.goalies]
    .map(([playerId, stats]) => ({ ...stats, playerId }))
    .filter((goalie) => goalie.gamesPlayed >= GOALIE_LEADER_MIN_FIXTURES)
    .sort(
      (a, b) =>
        savePercentage(b) - savePercentage(a) ||
        (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0),
    )
    .slice(0, top)

  const columns: Column<Leader<GoalieStats>>[] = [
    { header: 'Goalie', align: 'left', value: (row) => name(row.playerId) },
    { header: 'Club', align: 'left', value: (row) => code(row.clubId) },
    { header: 'GP', value: (row) => row.gamesPlayed },
    { header: 'SA', value: (row) => row.shotsAgainst },
    { header: 'SV', value: (row) => row.saves },
    { header: 'GA', value: (row) => row.goalsAgainst },
    { header: 'SV%', value: (row) => rate(savePercentage(row)) },
    { header: 'GAA', value: (row) => (row.goalsAgainst / row.gamesPlayed).toFixed(2) },
  ]
  return renderTable(columns, rows)
}

/** Several Seasons of one run: who won each, then each final table (#85). */
export function renderRun(run: SimulatedRun, structure: CompetitionStructure): string {
  const code = clubCodes(run)
  const best = (season: SeasonRecord) => sortStandings(season.standings)[0]!
  const history = renderTable<SeasonRecord>(
    [
      { header: 'Season', value: (season) => season.year },
      { header: 'Champion', align: 'left', value: (season) => code(season.champion) },
      { header: 'Best record', align: 'left', value: (season) => code(best(season).clubId) },
      { header: 'PTS', value: (season) => best(season).points },
    ],
    run.seasons,
  )
  const columns = standingsColumns(run)
  return [
    section(`${structure.name} - ${run.seasons.length} Seasons`, history),
    ...renderDraft(run.seasons),
    ...renderLeague(run.seasons),
    ...renderPayrolls(run),
    ...run.seasons.map((season) =>
      section(
        `Season ${season.year} (${season.seasonId}), champion ${code(season.champion)}`,
        renderTable(columns, sortStandings(season.standings)),
      ),
    ),
  ].join('\n\n\n')
}

/** What Clubs paid their Rosters each Season, as shares of the cap (#125). */
function renderPayrolls(run: SimulatedRun): string[] {
  if (run.contracts.length === 0) return []
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`
  const rows = run.contracts.map((contracts, i) => ({
    year: run.seasons[i]!.year,
    ...payrolls(contracts),
  }))
  const table = renderTable<(typeof rows)[number]>(
    [
      { header: 'Season', value: (row) => row.year },
      { header: 'Mean', value: (row) => percent(row.mean) },
      { header: 'SD', value: (row) => percent(row.sd) },
      { header: 'Lowest', value: (row) => percent(row.lowest) },
      { header: 'Highest', value: (row) => percent(row.highest) },
    ],
    rows,
  )
  return [section('Payrolls, share of the cap', table)]
}

/**
 * What the first four drafts of a run yielded by round, as the Phase 2 gate
 * reads them (ADR-028): nothing before a run has a draft.
 */
function renderDraft(seasons: readonly SeasonRecord[]): string[] {
  const years = [...new Set(seasons.flatMap((season) => season.draft.map((pick) => pick.year)))]
    .sort((a, b) => a - b)
    .slice(0, 4)
  if (years.length === 0) return []
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`
  const table = renderTable<DraftRoundOutcome>(
    [
      { header: 'Round', value: (row) => row.round },
      { header: 'Picks', value: (row) => row.picks },
      { header: 'Played', value: (row) => percent(row.reached) },
      { header: '200+ GP', value: (row) => percent(row.regulars) },
      { header: 'Seasons to debut', value: (row) => row.seasonsToDebut },
    ],
    draftOutcomes(seasons, years),
  )
  const last = seasons[seasons.length - 1]!.year
  return [section(`The draft, classes of Seasons ${years.join(', ')}, read in Season ${last}`, table)]
}

/**
 * The league across a run, as the Phase 2 gate reads it (#90): its age and
 * spread each Season, who left by age and ice-time third, the level by age in
 * the last Season, and how the table moved.
 */
function renderLeague(seasons: readonly SeasonRecord[]): string[] {
  if (seasons.length < 2) return []
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`
  const ages = renderTable<SeasonRecord>(
    [
      { header: 'Season', value: (season) => season.year },
      { header: 'Mean age', value: (season) => ageProfile(season).meanAge.toFixed(2) },
      { header: '31+', value: (season) => percent(ageProfile(season).oldShare) },
      { header: '23-', value: (season) => percent(ageProfile(season).youngShare) },
      { header: 'Oldest', value: (season) => ageProfile(season).oldest },
      { header: 'PTS SD', value: (season) => pointsSpread(season).toFixed(1) },
    ],
    seasons,
  )
  const rows = leavingRows(seasons)
  const band = (label: string, test: (row: LeavingRow) => boolean) => {
    const members = rows.filter(test)
    return { label, rate: leavingRate(members), players: members.length }
  }
  const leaving = renderTable(
    [
      { header: 'Who', align: 'left', value: (row) => row.label },
      { header: 'Left', value: (row) => percent(row.rate) },
      { header: 'Players', value: (row) => row.players },
    ],
    [
      band('23 or younger', (row) => row.age <= 23),
      band('24-27', (row) => row.age >= 24 && row.age <= 27),
      band('28-30', (row) => row.age >= 28 && row.age <= 30),
      band('31-33', (row) => row.age >= 31 && row.age <= 33),
      band('34-36', (row) => row.age >= 34 && row.age <= 36),
      band('37 or older', (row) => row.age >= 37),
      band('Top third', (row) => row.third === 0),
      band('Middle third', (row) => row.third === 1),
      band('Bottom third', (row) => row.third === 2),
    ],
  )
  const last = seasons[seasons.length - 1]!
  const level = renderTable(
    [
      { header: 'Age', align: 'left', value: (row) => row.label },
      { header: 'Level', value: (row) => row.level.toFixed(2) },
      { header: 'Skaters', value: (row) => row.players },
    ],
    levelByAge([last]),
  )
  const table = tableDynamics(seasons)
  const dynamics = renderTable(
    [
      { header: 'Measure', align: 'left', value: (row) => row.label },
      { header: 'Value', value: (row) => row.value },
    ],
    [
      { label: 'Correlation of points, Season to Season', value: table.correlation.toFixed(2) },
      { label: 'Top 8 still top 8', value: percent(table.topStays) },
      { label: 'Bottom 8 still bottom 8', value: percent(table.bottomStays) },
      { label: 'Longest run in the top 8', value: table.longestTopRun },
      { label: 'Clubs that finished first', value: table.firstPlaceClubs },
    ],
  )
  return [
    section('The age and spread of the league', ages),
    section(`Players with 20+ Fixtures who left before the next Season`, leaving),
    section(`Skater level by age, Season ${last.year}`, level),
    section('The table across the run', dynamics),
  ]
}

function playoffText(result: PlayoffResult): string {
  if (result.kind === 'missed') return '-'
  return result.kind === 'champion' ? 'Champion' : `Lost: ${result.roundName}`
}

/** One Club's Seasons in a run (#86). */
export function renderClubHistory(run: SimulatedRun, clubId: ClubId): string {
  const club = run.clubs.find((candidate) => candidate.id === clubId)!
  return section(
    `${club.name} - history`,
    renderTable<ClubSeason>(
      [
        { header: 'Season', value: (s) => s.year },
        { header: 'Div', value: (s) => s.divisionRank },
        { header: 'NHL', value: (s) => s.leagueRank },
        { header: 'GP', value: (s) => s.row.gamesPlayed },
        { header: 'W', value: (s) => s.row.wins },
        { header: 'L', value: (s) => s.row.losses },
        { header: 'OTL', value: (s) => s.row.otLosses },
        { header: 'PTS', value: (s) => s.row.points },
        { header: 'DIFF', value: (s) => signed(goalDifferential(s.row)) },
        { header: 'Playoffs', align: 'left', value: (s) => playoffText(s.playoffs) },
      ],
      clubHistory(run.seasons, clubId),
    ),
  )
}

interface CareerRow<S> {
  label: string
  clubId: ClubId | null
  line: Pick<CareerSeason<S>, 'regular' | 'playoffs'>
}

function careerRows<S extends { clubId: ClubId }>(
  career: readonly CareerSeason<S>[],
): CareerRow<S>[] {
  return [
    ...career.map((line) => ({ label: String(line.year), clubId: line.clubId, line })),
    { label: 'Total', clubId: null, line: careerTotals(career) },
  ]
}

/** One Player's career in a run, Season by Season and in total (#86). */
export function renderCareer(run: SimulatedRun, playerId: PlayerId): string {
  const player = run.players.get(playerId)!
  const code = clubCodes(run)
  const club = (row: { clubId: ClubId | null }) => (row.clubId ? code(row.clubId) : '')
  const sv = (goalie: GoalieStats | null) => (goalie ? rate(savePercentage(goalie)) : '')

  if (player.kind === 'goalie') {
    return section(
      `${displayName(player)}, G - career`,
      renderTable<CareerRow<GoalieStats>>(
        [
          { header: 'Season', align: 'left', value: (r) => r.label },
          { header: 'Club', align: 'left', value: club },
          { header: 'GP', value: (r) => r.line.regular?.gamesPlayed ?? 0 },
          { header: 'SA', value: (r) => r.line.regular?.shotsAgainst ?? 0 },
          { header: 'GA', value: (r) => r.line.regular?.goalsAgainst ?? 0 },
          { header: 'SV%', value: (r) => sv(r.line.regular) },
          { header: 'PO GP', value: (r) => r.line.playoffs?.gamesPlayed ?? 0 },
          { header: 'PO SV%', value: (r) => sv(r.line.playoffs) },
        ],
        careerRows(goalieCareer(run.seasons, playerId)),
      ),
    )
  }
  const toi = (skater: SkaterStats | null) =>
    skater ? minutesSeconds(skater.iceTimeSeconds / skater.gamesPlayed) : ''
  return section(
    `${displayName(player)}, ${player.preferredPositions[0]} - career`,
    renderTable<CareerRow<SkaterStats>>(
      [
        { header: 'Season', align: 'left', value: (r) => r.label },
        { header: 'Club', align: 'left', value: club },
        { header: 'GP', value: (r) => r.line.regular?.gamesPlayed ?? 0 },
        { header: 'G', value: (r) => r.line.regular?.goals ?? 0 },
        { header: 'A', value: (r) => r.line.regular?.assists ?? 0 },
        { header: 'PTS', value: (r) => (r.line.regular ? points(r.line.regular) : 0) },
        { header: '+/-', value: (r) => signed(r.line.regular?.plusMinus ?? 0) },
        { header: 'PIM', value: (r) => r.line.regular?.penaltyMinutes ?? 0 },
        { header: 'TOI', value: (r) => toi(r.line.regular) },
        { header: 'PO GP', value: (r) => r.line.playoffs?.gamesPlayed ?? 0 },
        { header: 'PO PTS', value: (r) => (r.line.playoffs ? points(r.line.playoffs) : 0) },
      ],
      careerRows(skaterCareer(run.seasons, playerId)),
    ),
  )
}

export function renderSeason(
  season: SimulatedSeason,
  structure: CompetitionStructure,
  top: number,
): string {
  return [
    section(`${structure.name} - Season ${season.seed}`, renderStandings(season, structure)),
    section(`Scoring leaders (top ${top})`, renderScoringLeaders(season, top)),
    section(
      `Goalie leaders (top ${top}, ${GOALIE_LEADER_MIN_FIXTURES}+ Fixtures)`,
      renderGoalieLeaders(season, top),
    ),
  ].join('\n\n\n')
}

function renderBoxScore(match: MatchStats, code: (clubId: ClubId) => string): string {
  const { result } = match
  const decided = result.decidedIn === 'regulation' ? '' : ` (${result.decidedIn})`
  const scoreline = `${code(match.awayClubId)} ${result.awayGoals} at ${code(match.homeClubId)} ${result.homeGoals}${decided}`
  const columns: Column<MatchStats['periods'][number]>[] = [
    { header: 'Period', align: 'left', value: (line) => line.period },
    { header: `${code(match.awayClubId)} G`, value: (line) => line.awayGoals },
    { header: `${code(match.homeClubId)} G`, value: (line) => line.homeGoals },
    { header: `${code(match.awayClubId)} SOG`, value: (line) => line.awayShots },
    { header: `${code(match.homeClubId)} SOG`, value: (line) => line.homeShots },
  ]
  return `${scoreline}\n\n${renderTable(columns, match.periods)}`
}

/** One line per event a reader follows; `null` for the rest, which the box score sums up. */
function describeEvent(
  event: MatchEvent,
  name: (playerId: PlayerId) => string,
  code: (clubId: ClubId) => string,
): string | null {
  switch (event.type) {
    case 'goal': {
      if (event.period === 'SO') return null
      const assists = event.assists.map(name).join(', ')
      const tags = [
        ...(event.strength === 'powerplay' ? ['PP'] : []),
        ...(event.strength === 'penaltykill' ? ['SH'] : []),
        ...(event.emptyNet ? ['EN'] : []),
      ]
      return [
        `GOAL ${code(event.clubId)} ${name(event.scorer)}`,
        assists ? ` (${assists})` : ' (unassisted)',
        tags.length > 0 ? ` [${tags.join(' ')}]` : '',
      ].join('')
    }
    case 'penalty':
      return `PENALTY ${code(event.clubId)} ${name(event.player)}, ${event.kind}, ${event.minutes} min`
    case 'injury': {
      const where = event.offIce ? ' before the Match' : ''
      return `INJURY ${code(event.clubId)} ${name(event.player)}${where}, out ${event.days} days`
    }
    case 'powerplay_start':
      return `POWER PLAY ${code(event.clubId)}, ${event.skatersFor}-on-${event.skatersAgainst}`
    case 'powerplay_end':
      return event.reason === 'period_end'
        ? null
        : `Power play over for ${code(event.clubId)}: ${event.reason}`
    case 'shot':
      return event.period === 'SO'
        ? `SHOOTOUT ${code(event.clubId)} ${name(event.shooter)}: ${event.result}`
        : null
    default:
      return null
  }
}

export function renderPlayByPlay(season: SimulatedSeason, fixtureId: FixtureId): string {
  const events = season.replay(fixtureId)
  const match = season.matches.find((m) => m.fixtureId === fixtureId)!
  const name = playerNames(season)
  const code = clubCodes(season)

  const lines: string[] = []
  let periodStart = 0
  for (const event of events) {
    if (event.type === 'period_start') {
      periodStart = event.clock
      lines.push(
        '',
        event.period === 'OT' || event.period === 'SO' ? event.period : `Period ${event.period}`,
      )
      continue
    }
    const text = describeEvent(event, name, code)
    if (text === null) continue
    lines.push(`  ${minutesSeconds(event.clock - periodStart).padStart(5)}  ${text}`)
  }

  return `${fixtureId}\n${renderBoxScore(match, code)}\n${lines.join('\n')}`
}

/** Everything worth analysing offline, as plain JSON. Rates are left to the reader (`foldSeason`). */
export function seasonDump(season: SimulatedSeason, structure: CompetitionStructure): unknown {
  const name = playerNames(season)
  return {
    seed: season.seed,
    competition: structure.id,
    standings: foldStandings(structure, season.matches),
    skaters: [...season.season.skaters].map(([playerId, stats]) => ({
      playerId,
      name: name(playerId),
      ...stats,
    })),
    goalies: [...season.season.goalies].map(([playerId, stats]) => ({
      playerId,
      name: name(playerId),
      ...stats,
    })),
    fixtures: season.matches.map(({ fixtureId, homeClubId, awayClubId, result }) => ({
      fixtureId,
      homeClubId,
      awayClubId,
      ...result,
    })),
  }
}
