import type { MatchEvent, Period, Strength } from '../domain/event.js'
import type { Fixture, FixtureId } from '../domain/fixture.js'
import type { ClubId, PlayerId } from '../domain/player.js'

/**
 * Folds one Match's event stream into its box score and statistics (D-03).
 *
 * This module imports from `domain/` only. It never sees the engine, so the
 * figures here cannot be anything other than what the stream says - which is
 * what keeps the play-by-play and the statistics tables from drifting apart.
 *
 * Shootout events (Period 'SO') decide the result and nothing else.
 */

export interface SkaterStats {
  clubId: ClubId
  gamesPlayed: number
  goals: number
  assists: number
  shotsOnGoal: number
  shotsMissed: number
  /** This Player's attempts that were blocked. */
  shotsBlocked: number
  /** Opposition attempts this Player blocked. */
  blocks: number
  /** Even-strength and short-handed goals only, as in the NHL. */
  plusMinus: number
  penaltyMinutes: number
  powerPlayGoals: number
  shorthandedGoals: number
  faceoffWins: number
  faceoffsTaken: number
  giveaways: number
  takeaways: number
  iceTimeSeconds: number
}

export interface GoalieStats {
  clubId: ClubId
  gamesPlayed: number
  shotsAgainst: number
  saves: number
  goalsAgainst: number
}

export interface ClubStats {
  clubId: ClubId
  gamesPlayed: number
  goalsFor: number
  goalsAgainst: number
  shotsFor: number
  shotsAgainst: number
  shotsMissed: number
  /** This Club's attempts that were blocked. */
  shotsBlocked: number
  /** Opposition attempts this Club blocked. */
  blocks: number
  faceoffWins: number
  faceoffsTaken: number
  penalties: number
  penaltyMinutes: number
  powerPlayOpportunities: number
  powerPlayGoals: number
  /** Seconds with at least one man advantage running. */
  powerPlaySeconds: number
  timesShorthanded: number
  powerPlayGoalsAgainst: number
  shorthandedGoals: number
  giveaways: number
  takeaways: number
}

export type Decision = 'regulation' | 'overtime' | 'shootout'

export interface MatchResult {
  /** Final score. The shootout winner gains exactly one goal. */
  homeGoals: number
  awayGoals: number
  decidedIn: Decision
  /** Null only for a Fixture that ended level. */
  winner: ClubId | null
  /** Successful shootout attempts per side, when a shootout was held. */
  shootout: { homeGoals: number; awayGoals: number } | null
}

export interface PeriodLine {
  period: Period
  homeGoals: number
  awayGoals: number
  homeShots: number
  awayShots: number
}

export interface ScoringPlay {
  clock: number
  period: Period
  clubId: ClubId
  strength: Strength
  scorer: PlayerId
  assists: readonly PlayerId[]
  emptyNet: boolean
  /** Running score immediately after this goal. */
  homeGoals: number
  awayGoals: number
}

export interface MatchStats {
  fixtureId: FixtureId
  homeClubId: ClubId
  awayClubId: ClubId
  result: MatchResult
  /** Ordered as played. Every playoff overtime Period folds into one 'OT' line. */
  periods: readonly PeriodLine[]
  scoring: readonly ScoringPlay[]
  clubs: ReadonlyMap<ClubId, ClubStats>
  skaters: ReadonlyMap<PlayerId, SkaterStats>
  goalies: ReadonlyMap<PlayerId, GoalieStats>
  /** Where the Match left each Skater, 0-100 (ADR-010). A state, not a count: never summed. */
  fatigue: ReadonlyMap<PlayerId, number>
  injuries: readonly Injury[]
}

/** Who a Match put out, and for how many of the Club's Fixtures after it (ADR-012). */
export interface Injury {
  playerId: PlayerId
  clubId: ClubId
  fixtures: number
}

/** A Match as plain JSON, for storing a box score. */
export interface PlainMatchStats extends Omit<
  MatchStats,
  'clubs' | 'skaters' | 'goalies' | 'fatigue'
> {
  clubs: Readonly<Record<ClubId, ClubStats>>
  skaters: Readonly<Record<PlayerId, SkaterStats>>
  goalies: Readonly<Record<PlayerId, GoalieStats>>
}

export function plainMatchStats(match: MatchStats): PlainMatchStats {
  const { fixtureId, homeClubId, awayClubId, result, periods, scoring, injuries } = match
  return {
    fixtureId,
    homeClubId,
    awayClubId,
    result,
    periods,
    scoring,
    injuries,
    clubs: Object.fromEntries(match.clubs),
    skaters: Object.fromEntries(match.skaters),
    goalies: Object.fromEntries(match.goalies),
  }
}

export function points(skater: SkaterStats): number {
  return skater.goals + skater.assists
}

/** NaN when the goalie faced no shots. */
export function savePercentage(goalie: GoalieStats): number {
  return goalie.saves / goalie.shotsAgainst
}

function emptyClubStats(clubId: ClubId): ClubStats {
  return {
    clubId,
    gamesPlayed: 1,
    goalsFor: 0,
    goalsAgainst: 0,
    shotsFor: 0,
    shotsAgainst: 0,
    shotsMissed: 0,
    shotsBlocked: 0,
    blocks: 0,
    faceoffWins: 0,
    faceoffsTaken: 0,
    penalties: 0,
    penaltyMinutes: 0,
    powerPlayOpportunities: 0,
    powerPlayGoals: 0,
    powerPlaySeconds: 0,
    timesShorthanded: 0,
    powerPlayGoalsAgainst: 0,
    shorthandedGoals: 0,
    giveaways: 0,
    takeaways: 0,
  }
}

function emptySkaterStats(clubId: ClubId): SkaterStats {
  return {
    clubId,
    gamesPlayed: 1,
    goals: 0,
    assists: 0,
    shotsOnGoal: 0,
    shotsMissed: 0,
    shotsBlocked: 0,
    blocks: 0,
    plusMinus: 0,
    penaltyMinutes: 0,
    powerPlayGoals: 0,
    shorthandedGoals: 0,
    faceoffWins: 0,
    faceoffsTaken: 0,
    giveaways: 0,
    takeaways: 0,
    iceTimeSeconds: 0,
  }
}

function emptyGoalieStats(clubId: ClubId): GoalieStats {
  return { clubId, gamesPlayed: 1, shotsAgainst: 0, saves: 0, goalsAgainst: 0 }
}

/**
 * The end of play, used to close the last Shift and any open man advantage.
 * A stream that does not end its last Period is incomplete, and guessing its
 * length would put a number in the statistics that the stream never stated.
 */
function matchEndClock(events: readonly MatchEvent[]): number {
  let end: number | null = null
  for (const event of events) {
    if (event.type === 'period_end' && event.period !== 'SO') end = event.clock
  }
  if (end === null) throw new Error('foldMatch: the event stream has no period_end')
  return end
}

export function foldMatch(fixture: Fixture, events: readonly MatchEvent[]): MatchStats {
  const home = fixture.homeClubId
  const away = fixture.awayClubId
  const endClock = matchEndClock(events)

  const opponentOf = (clubId: ClubId): ClubId => {
    if (clubId === home) return away
    if (clubId === away) return home
    throw new Error(`foldMatch: Club ${clubId} is not in Fixture ${fixture.id}`)
  }

  const clubs = new Map<ClubId, ClubStats>([
    [home, emptyClubStats(home)],
    [away, emptyClubStats(away)],
  ])
  const skaters = new Map<PlayerId, SkaterStats>()
  const goalies = new Map<PlayerId, GoalieStats>()

  const club = (clubId: ClubId): ClubStats => {
    const stats = clubs.get(clubId)
    if (!stats) throw new Error(`foldMatch: Club ${clubId} is not in Fixture ${fixture.id}`)
    return stats
  }
  const skater = (playerId: PlayerId, clubId: ClubId): SkaterStats => {
    let stats = skaters.get(playerId)
    if (!stats) {
      stats = emptySkaterStats(clubId)
      skaters.set(playerId, stats)
    }
    return stats
  }
  const goalie = (playerId: PlayerId, clubId: ClubId): GoalieStats => {
    let stats = goalies.get(playerId)
    if (!stats) {
      stats = emptyGoalieStats(clubId)
      goalies.set(playerId, stats)
    }
    return stats
  }

  const periods: PeriodLine[] = []
  const periodLine = (period: Period): PeriodLine => {
    let line = periods.find((p) => p.period === period)
    if (!line) {
      line = { period, homeGoals: 0, awayGoals: 0, homeShots: 0, awayShots: 0 }
      periods.push(line)
    }
    return line
  }
  const creditShotOnGoal = (period: Period, clubId: ClubId): void => {
    club(clubId).shotsFor++
    club(opponentOf(clubId)).shotsAgainst++
    const line = periodLine(period)
    if (clubId === home) line.homeShots++
    else line.awayShots++
  }

  const shifts = new Map<ClubId, { clock: number; onIce: readonly PlayerId[] }>()
  const closeShift = (clubId: ClubId, clock: number): void => {
    const shift = shifts.get(clubId)
    if (!shift) return
    const seconds = Math.min(clock, endClock) - shift.clock
    if (seconds <= 0) return
    for (const playerId of shift.onIce) skater(playerId, clubId).iceTimeSeconds += seconds
  }

  const advantages = new Map<ClubId, { depth: number; since: number }>()

  const scoring: ScoringPlay[] = []
  let homeGoals = 0
  let awayGoals = 0
  const shootout = { held: false, homeGoals: 0, awayGoals: 0 }
  let reachedOvertime = false
  let fatigue: ReadonlyMap<PlayerId, number> = new Map()
  const injuries: Injury[] = []

  for (const event of events) {
    if (event.type === 'match_end') {
      fatigue = new Map(Object.entries(event.fatigue))
      continue
    }
    if (event.period === 'SO') {
      shootout.held = true
      if (event.type === 'shot' && event.result === 'goal') {
        if (opponentOf(event.clubId) === away) shootout.homeGoals++
        else shootout.awayGoals++
      }
      continue
    }
    if (event.period === 'OT') reachedOvertime = true

    switch (event.type) {
      case 'period_start':
        periodLine(event.period)
        break

      case 'period_end':
        break

      case 'injury':
        injuries.push({ playerId: event.player, clubId: event.clubId, fixtures: event.fixtures })
        break

      case 'shift_change':
        closeShift(event.clubId, event.clock)
        shifts.set(event.clubId, { clock: event.clock, onIce: event.onIce })
        for (const playerId of event.onIce) skater(playerId, event.clubId)
        break

      case 'faceoff': {
        const loserClub = opponentOf(event.wonBy)
        club(event.wonBy).faceoffWins++
        club(event.wonBy).faceoffsTaken++
        club(loserClub).faceoffsTaken++
        const winner = skater(event.winner, event.wonBy)
        winner.faceoffWins++
        winner.faceoffsTaken++
        skater(event.loser, loserClub).faceoffsTaken++
        break
      }

      case 'shot':
        // Shots on goal are counted from `goal` and `save` events. A `shot`
        // only adds what those two cannot say: misses and blocks.
        if (event.result === 'miss') {
          club(event.clubId).shotsMissed++
          skater(event.shooter, event.clubId).shotsMissed++
        } else if (event.result === 'block') {
          const defending = opponentOf(event.clubId)
          club(event.clubId).shotsBlocked++
          club(defending).blocks++
          skater(event.shooter, event.clubId).shotsBlocked++
          if (event.blocker !== undefined) skater(event.blocker, defending).blocks++
        }
        break

      case 'save': {
        const shooting = opponentOf(event.clubId)
        creditShotOnGoal(event.period, shooting)
        skater(event.shooter, shooting).shotsOnGoal++
        const stats = goalie(event.goalie, event.clubId)
        stats.shotsAgainst++
        stats.saves++
        break
      }

      case 'goal': {
        const scorerClub = event.clubId
        const conceding = opponentOf(scorerClub)
        creditShotOnGoal(event.period, scorerClub)

        club(scorerClub).goalsFor++
        club(conceding).goalsAgainst++
        if (scorerClub === home) homeGoals++
        else awayGoals++
        const line = periodLine(event.period)
        if (scorerClub === home) line.homeGoals++
        else line.awayGoals++

        const scorer = skater(event.scorer, scorerClub)
        scorer.goals++
        scorer.shotsOnGoal++
        for (const playerId of event.assists) skater(playerId, scorerClub).assists++

        if (event.strength === 'powerplay') {
          club(scorerClub).powerPlayGoals++
          club(conceding).powerPlayGoalsAgainst++
          scorer.powerPlayGoals++
        } else {
          if (event.strength === 'penaltykill') {
            club(scorerClub).shorthandedGoals++
            scorer.shorthandedGoals++
          }
          for (const playerId of shifts.get(scorerClub)?.onIce ?? []) {
            skater(playerId, scorerClub).plusMinus++
          }
          for (const playerId of shifts.get(conceding)?.onIce ?? []) {
            skater(playerId, conceding).plusMinus--
          }
        }

        if (event.goalieBeaten !== undefined) {
          const stats = goalie(event.goalieBeaten, conceding)
          stats.shotsAgainst++
          stats.goalsAgainst++
        }

        scoring.push({
          clock: event.clock,
          period: event.period,
          clubId: scorerClub,
          strength: event.strength,
          scorer: event.scorer,
          assists: event.assists,
          emptyNet: event.emptyNet,
          homeGoals,
          awayGoals,
        })
        break
      }

      case 'turnover':
        if (event.kind === 'giveaway') {
          club(event.clubId).giveaways++
          skater(event.player, event.clubId).giveaways++
        } else if (event.kind === 'takeaway') {
          club(event.clubId).takeaways++
          skater(event.player, event.clubId).takeaways++
        }
        break

      case 'penalty':
        club(event.clubId).penalties++
        club(event.clubId).penaltyMinutes += event.minutes
        skater(event.player, event.clubId).penaltyMinutes += event.minutes
        break

      case 'powerplay_start': {
        club(event.clubId).powerPlayOpportunities++
        club(opponentOf(event.clubId)).timesShorthanded++
        const open = advantages.get(event.clubId)
        if (open && open.depth > 0) open.depth++
        else advantages.set(event.clubId, { depth: 1, since: event.clock })
        break
      }

      case 'powerplay_end': {
        const open = advantages.get(event.clubId)
        if (!open || open.depth === 0) break
        open.depth--
        if (open.depth === 0) club(event.clubId).powerPlaySeconds += event.clock - open.since
        break
      }
    }
  }

  for (const clubId of [home, away]) closeShift(clubId, endClock)
  for (const [clubId, open] of advantages) {
    if (open.depth > 0) club(clubId).powerPlaySeconds += endClock - open.since
  }

  let finalHome = homeGoals
  let finalAway = awayGoals
  if (shootout.held) {
    if (shootout.homeGoals > shootout.awayGoals) finalHome++
    else if (shootout.awayGoals > shootout.homeGoals) finalAway++
  }

  const decidedIn: Decision = shootout.held
    ? 'shootout'
    : reachedOvertime
      ? 'overtime'
      : 'regulation'
  const winner = finalHome > finalAway ? home : finalAway > finalHome ? away : null

  return {
    fixtureId: fixture.id,
    homeClubId: home,
    awayClubId: away,
    result: {
      homeGoals: finalHome,
      awayGoals: finalAway,
      decidedIn,
      winner,
      shootout: shootout.held
        ? { homeGoals: shootout.homeGoals, awayGoals: shootout.awayGoals }
        : null,
    },
    periods,
    fatigue,
    injuries,
    scoring,
    clubs,
    skaters,
    goalies,
  }
}
