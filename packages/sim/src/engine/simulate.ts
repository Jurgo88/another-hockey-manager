import type { MatchEvent, Period } from '../domain/event.js'
import type { Club, Lineup } from '../domain/club.js'
import type { Fixture, FixtureInput } from '../domain/fixture.js'
import type { PlayerId } from '../domain/player.js'
import { createRng, type Rng } from '../rng/index.js'
import {
  absenceLength,
  goalieInjuryChance,
  OFF_ICE_INJURY_CHANCE,
  skaterInjuryChance,
} from './injury.js'
import { withoutInjured } from './lineup.js'
import { createPenaltyBox, otherSide, type Side } from './penalties.js'
import { createPossessionModel } from './possession.js'
import { playShootout } from './shootout.js'
import { createShiftLoop, onIceIds, type SideSituation } from './shift-loop.js'

/**
 * The engine's entry point (03-sim-engine.md).
 *
 * Pure (D-01): no I/O, no clock reads, no ambient state. The same input and
 * seed always yield the same array. The event stream is the only output
 * (D-03) - no score, no box score, nothing computed alongside it.
 *
 * Three regulation Periods, then - if level - whatever `fixture.overtime`
 * says (FR-09b): five minutes of 3-on-3 and a shootout, or twenty-minute
 * 5-on-5 Periods until somebody scores. The two regimes are separate
 * functions; neither assumes the other's length.
 */

const PERIOD_LENGTH = 1200
const REGULATION_PERIODS = [1, 2, 3] as const
const THREE_ON_THREE_LENGTH = 300
/**
 * A guard, not a rule: twenty scoreless playoff overtimes would mean the
 * engine has stopped producing goals at all, and looping forever would hide it.
 */
const MAX_PLAYOFF_OVERTIMES = 20

interface PeriodRules {
  length: number
  /** The Period ends on the first goal. */
  suddenDeath: boolean
  /** Level play uses the overtime trios (FR-09). */
  threeOnThree: boolean
  /** A trailing Club may pull its Goalie (FR-22). */
  pullGoalie: boolean
}

export function simulateFixture(declared: FixtureInput, seed: number): MatchEvent[] {
  const rng = createRng(seed)
  const injuryRng = rng.fork('injuries')
  const events: MatchEvent[] = []

  /** Anyone hurt away from the ice before this Fixture, and the Lineup without them. */
  const fitToPlay = (club: Club, lineup: Lineup): Lineup => {
    const dressed = [
      lineup.starter,
      lineup.backup,
      ...lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
      ...lineup.pairings.flatMap((pairing) => [pairing.leftDefence, pairing.rightDefence]),
    ]
    const out = new Set<PlayerId>()
    for (const player of dressed) {
      if (!injuryRng.chance(OFF_ICE_INJURY_CHANCE)) continue
      out.add(player)
      events.push({
        type: 'injury',
        clock: 0,
        period: 1,
        strength: 'even',
        clubId: club.id,
        player,
        // This Fixture is the first one missed.
        fixtures: absenceLength(injuryRng) - 1,
        offIce: true,
      })
    }
    return out.size === 0 ? lineup : withoutInjured(club, lineup, out)
  }

  const input: FixtureInput = {
    ...declared,
    homeLineup: fitToPlay(declared.homeClub, declared.homeLineup),
    awayLineup: fitToPlay(declared.awayClub, declared.awayLineup),
  }

  const shifts = createShiftLoop(
    { club: input.homeClub, lineup: input.homeLineup },
    { club: input.awayClub, lineup: input.awayLineup },
    rng.fork('shifts'),
  )
  const clubIds = { home: input.homeClub.id, away: input.awayClub.id }
  const goalies = { home: input.homeLineup.starter, away: input.awayLineup.starter }
  /** Who comes in if the Goalie in net is hurt; nobody, once they have. */
  const backups: Record<Side, PlayerId | null> = {
    home: input.homeLineup.backup,
    away: input.awayLineup.backup,
  }
  const tactics = { home: input.homeLineup.tactics, away: input.awayLineup.tactics }
  const lineups = { home: input.homeLineup, away: input.awayLineup }
  const box = createPenaltyBox(clubIds)
  const play = createPossessionModel(input, box, rng.fork('play'))

  const level = () => play.goals().home === play.goals().away

  /** Whether `side` should have its Goalie out at `clock`, `end` being the end of the third Period. */
  const pulled = (side: Side, clock: number, end: number): boolean => {
    const goals = play.goals()
    const deficit = goals[otherSide(side)] - goals[side]
    const onPowerPlay = box.strength(side) === 'powerplay'
    return tactics[side].pullGoalie.some(
      (rule) =>
        rule.deficit === deficit &&
        end - clock <= rule.secondsRemaining &&
        (!rule.powerPlayOnly || onPowerPlay),
    )
  }

  /**
   * The earliest clock a trailing Club's rules pull its Goalie, if that is
   * still ahead with the score and strength as they are. A goal or a change
   * of strength ends the Shift anyway, so this is asked again after either.
   */
  const nextPull = (clock: number, end: number): number =>
    Math.min(
      ...(['home', 'away'] as const).flatMap((side) =>
        tactics[side].pullGoalie
          .map((rule) => end - rule.secondsRemaining)
          .filter((at) => at > clock && pulled(side, at, end)),
      ),
    )

  /** Whoever was on the ice for `seconds` may be hurt. Play goes on, so this falls between Shifts. */
  const injuries = (
    side: Side,
    onIce: readonly PlayerId[],
    netEmpty: boolean,
    seconds: number,
    clock: number,
    period: Period,
  ): void => {
    const hurt = (player: PlayerId) =>
      events.push({
        type: 'injury',
        clock,
        period,
        strength: box.strength(side),
        clubId: clubIds[side],
        player,
        fixtures: absenceLength(injuryRng),
        offIce: false,
      })

    for (const player of onIce) {
      if (!injuryRng.chance(skaterInjuryChance(seconds))) continue
      hurt(player)
      shifts.injure(side, player)
    }

    const backup = backups[side]
    if (backup !== null && !netEmpty && injuryRng.chance(goalieInjuryChance(seconds))) {
      hurt(goalies[side])
      goalies[side] = backup
      backups[side] = null
      play.changeGoalie(side, backup)
    }
  }

  /**
   * Plays one Period from `start`, appending its events, and returns the
   * clock it ended on. `closesFixture` is asked at the end: if this is the
   * last Period, the open power plays close before its `period_end`.
   */
  const playPeriod = (
    period: Period,
    start: number,
    rules: PeriodRules,
    closesFixture: () => boolean,
  ): number => {
    const end = start + rules.length
    const goalsAtStart = play.goals().home + play.goals().away
    const decided = () => rules.suddenDeath && play.goals().home + play.goals().away > goalsAtStart

    const emptyNetAt = (clock: number) =>
      rules.pullGoalie
        ? { home: pulled('home', clock, end), away: pulled('away', clock, end) }
        : { home: false, away: false }
    const situation = (clock: number) => {
      const net = emptyNetAt(clock)
      return `${box.skaters('home')}-${box.skaters('away')}-${net.home}-${net.away}-${decided()}`
    }
    const sideSituation = (side: Side, emptyNet: boolean): SideSituation => ({
      strength: box.strength(side),
      skaters: box.skaters(side) + (emptyNet ? 1 : 0),
      boxed: new Set([...box.boxed(side), ...shifts.injured(side)]),
      threeOnThree: rules.threeOnThree,
    })

    events.push({ type: 'period_start', clock: start, period, strength: box.strength('home') })
    play.startPeriod()

    let clock = start
    while (clock < end && !decided()) {
      // A Shift never runs past a penalty expiring or a Goalie due to be
      // pulled: the people on the ice must change.
      box.expire(clock, period, events)
      const until = Math.min(
        end,
        box.nextExpiry(),
        rules.pullGoalie ? nextPull(clock, end) : Infinity,
      )
      const emptyNet = emptyNetAt(clock)
      const shift = shifts.next(until - clock, {
        home: sideSituation('home', emptyNet.home),
        away: sideSituation('away', emptyNet.away),
      })

      for (const side of ['home', 'away'] as const) {
        events.push({
          type: 'shift_change',
          clock,
          period,
          strength: box.strength(side),
          clubId: clubIds[side],
          onIce: onIceIds(shift[side]),
          goalie: emptyNet[side] ? null : goalies[side],
        })
      }

      const reached = play.playShift(
        shift,
        { from: clock, to: clock + shift.seconds, period, emptyNet, situation },
        events,
      )
      shifts.played(shift, reached - clock)
      for (const side of ['home', 'away'] as const) {
        injuries(side, onIceIds(shift[side]), emptyNet[side], reached - clock, reached, period)
      }
      clock = reached
    }

    if (closesFixture()) box.close(clock, period, events)
    const goals = play.goals()
    events.push({
      type: 'period_end',
      clock,
      period,
      strength: box.strength('home'),
      homeGoals: goals.home,
      awayGoals: goals.away,
    })
    return clock
  }

  /**
   * Takes up what the Clubs chose at this intermission. It draws no random
   * numbers, so all that came before stays exactly as it was (ADR-016).
   */
  const intermission = (period: 1 | 2 | 3, clock: number): void => {
    for (const change of input.intermissions ?? []) {
      if (change.afterPeriod !== period) continue
      const side: Side = change.clubId === clubIds.home ? 'home' : 'away'
      const { lineup } = change

      shifts.changeLineup(side, lineup)
      play.changeTactics(side, lineup.tactics)
      tactics[side] = lineup.tactics
      lineups[side] = lineup
      // Only the Goalie on the bench can come in: a hurt one has already left.
      if (backups[side] === lineup.starter) {
        backups[side] = goalies[side]
        goalies[side] = lineup.starter
        play.changeGoalie(side, lineup.starter)
      }
      events.push({
        type: 'lineup_change',
        clock,
        period,
        strength: box.strength(side),
        clubId: change.clubId,
      })
    }
  }

  let clock = 0
  for (const period of REGULATION_PERIODS) {
    const last = period === REGULATION_PERIODS.at(-1)
    clock = playPeriod(
      period,
      clock,
      { length: PERIOD_LENGTH, suddenDeath: false, threeOnThree: false, pullGoalie: last },
      () => last && (input.fixture.overtime === null || !level()),
    )
    if (!last || (input.fixture.overtime !== null && level())) intermission(period, clock)
  }

  if (level() && input.fixture.overtime === 'regular-3on3-then-shootout') {
    regularSeasonOvertime(clock)
  } else if (level() && input.fixture.overtime === 'sudden-death-5on5') {
    playoffOvertime(clock)
  }

  const last = events.at(-1)!
  events.push({
    type: 'match_end',
    clock: last.clock,
    period: last.period,
    strength: 'even',
    fatigue: shifts.fatigue(),
  })

  return events

  /** Five minutes of sudden-death 3-on-3, then a shootout (FR-09). */
  function regularSeasonOvertime(start: number): void {
    box.startThreeOnThree()
    const end = playPeriod(
      'OT',
      start,
      { length: THREE_ON_THREE_LENGTH, suddenDeath: true, threeOnThree: true, pullGoalie: false },
      () => true,
    )
    if (!level()) return

    events.push({ type: 'period_start', clock: end, period: 'SO', strength: 'even' })
    const inNet: FixtureInput = {
      ...input,
      homeLineup: { ...lineups.home, starter: goalies.home },
      awayLineup: { ...lineups.away, starter: goalies.away },
    }
    const injured = new Set([...shifts.injured('home'), ...shifts.injured('away')])
    const winner = playShootout(inNet, injured, end, rng.fork('shootout'), events)
    const goals = play.goals()
    events.push({
      type: 'period_end',
      clock: end,
      period: 'SO',
      strength: 'even',
      homeGoals: goals.home + (winner === 'home' ? 1 : 0),
      awayGoals: goals.away + (winner === 'away' ? 1 : 0),
    })
  }

  /** Full twenty-minute 5-on-5 Periods until a goal, with no shootout and no pulled Goalie (FR-09a). */
  function playoffOvertime(start: number): void {
    let clock = start
    for (let overtime = 1; level(); overtime++) {
      if (overtime > MAX_PLAYOFF_OVERTIMES) {
        throw new Error(
          `Fixture ${input.fixture.id}: no goal in ${MAX_PLAYOFF_OVERTIMES} overtimes`,
        )
      }
      clock = playPeriod(
        'OT',
        clock,
        { length: PERIOD_LENGTH, suddenDeath: true, threeOnThree: false, pullGoalie: false },
        () => !level(),
      )
    }
  }
}

/**
 * The seed a Season gives one Fixture (D-08). Derived from the Fixture's id,
 * not its position, so re-scheduling or adding a Club does not perturb the
 * random numbers of the others. With its input, it replays the Fixture alone.
 */
export function fixtureSeed(seasonRng: Rng, fixture: Fixture): number {
  return seasonRng.fork(`fixture:${fixture.id}`).int(0, 0xffffffff)
}
