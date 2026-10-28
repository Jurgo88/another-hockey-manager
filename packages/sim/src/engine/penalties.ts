import type {
  MatchEvent,
  PenaltyKind,
  Period,
  PowerPlayEndEvent,
  Strength,
} from '../domain/event.js'
import type { ClubId, PlayerId } from '../domain/player.js'

/**
 * The penalty box for one Fixture (03-sim-engine.md, ADR-009).
 *
 * Skater counts are derived from a queue of penalties per Club rather than
 * special-cased: at most two run at once, so a Club never drops below three
 * Skaters, and a third waits until a slot frees. A double minor is two
 * consecutive minors in one slot; a major runs its five minutes regardless of
 * goals.
 *
 * Power-play events bracket a numerical advantage, not a penalty: every
 * Skater of advantage gained opens a `powerplay_start`, every one lost closes
 * it with a reason. A 5-on-3 is two nested pairs; 4-on-4 is none.
 */

export type Side = 'home' | 'away'

export const otherSide = (side: Side): Side => (side === 'home' ? 'away' : 'home')

const FULL_STRENGTH = 5
/** Two penalties at once is the floor: three Skaters a side. */
const MAX_SERVING = 2
/** Regular-season overtime (FR-09). */
const THREE_ON_THREE = 3

interface Penalty {
  player: PlayerId
  /** Seconds of each consecutive part still to serve: [120], [120, 120] or [300]. */
  parts: number[]
  /** A major is not ended by a goal. */
  major: boolean
}

interface Serving extends Penalty {
  /** Clock at which the current part ends. */
  endsAt: number
}

export interface PenaltyBox {
  skaters(side: Side): number
  strength(side: Side): Strength
  /** Every Player of this Club in the box, serving or waiting. Never on the ice. */
  boxed(side: Side): ReadonlySet<PlayerId>
  /** The earliest clock at which a penalty part ends; Infinity when the box is empty. */
  nextExpiry(): number
  call(
    side: Side,
    player: PlayerId,
    kind: PenaltyKind,
    minutes: 2 | 4 | 5,
    clock: number,
    period: Period,
    events: MatchEvent[],
  ): void
  /** Ends every penalty part due by `clock`. */
  expire(clock: number, period: Period, events: MatchEvent[]): void
  /** A goal by `side`: ends the opponent's shortest minor if `side` had the advantage. */
  goal(side: Side, clock: number, period: Period, events: MatchEvent[]): void
  /** The Fixture is over: closes every open advantage with 'period_end'. */
  close(clock: number, period: Period, events: MatchEvent[]): void
  /**
   * Regular-season overtime from here on. At 3-on-3 a penalty adds a Skater
   * to the Club with the advantage instead of removing one from the Club
   * without it, so 5-on-4 carries over as 4-on-3 - the margin, and the
   * power-play pairs, unchanged.
   */
  startThreeOnThree(): void
}

export function createPenaltyBox(clubIds: Readonly<Record<Side, ClubId>>): PenaltyBox {
  const serving: Record<Side, Serving[]> = { home: [], away: [] }
  const waiting: Record<Side, Penalty[]> = { home: [], away: [] }
  /** Open `powerplay_start` events per Club, without their `powerplay_end`. */
  const open: Record<Side, number> = { home: 0, away: 0 }
  let threeOnThree = false

  const skaters = (side: Side) =>
    threeOnThree
      ? THREE_ON_THREE + Math.max(0, serving[otherSide(side)].length - serving[side].length)
      : FULL_STRENGTH - serving[side].length

  const strength = (side: Side): Strength => {
    const margin = skaters(side) - skaters(otherSide(side))
    return margin > 0 ? 'powerplay' : margin < 0 ? 'penaltykill' : 'even'
  }

  /** Starts `penalty` in a free slot at `from`. */
  const serve = (side: Side, penalty: Penalty, from: number) => {
    serving[side].push({ ...penalty, endsAt: from + penalty.parts[0]! })
  }

  /** Ends the current part of `entry`. A finished penalty frees its slot for the next in line. */
  const endPart = (side: Side, entry: Serving, at: number) => {
    entry.parts.shift()
    if (entry.parts.length > 0) {
      entry.endsAt = at + entry.parts[0]!
      return
    }
    serving[side].splice(serving[side].indexOf(entry), 1)
    const next = waiting[side].shift()
    if (next) serve(side, next, at)
  }

  /** Emits the power-play events that bring the open pairs in line with the Skater counts. */
  const sync = (
    clock: number,
    period: Period,
    reason: PowerPlayEndEvent['reason'],
    events: MatchEvent[],
    closing = false,
  ) => {
    const margin = skaters('home') - skaters('away')
    const target: Record<Side, number> = closing
      ? { home: 0, away: 0 }
      : { home: Math.max(0, margin), away: Math.max(0, -margin) }

    for (const side of ['home', 'away'] as const) {
      while (open[side] > target[side]) {
        open[side]--
        events.push({
          type: 'powerplay_end',
          clock,
          period,
          strength: strength(side),
          clubId: clubIds[side],
          reason,
        })
      }
    }
    for (const side of ['home', 'away'] as const) {
      while (open[side] < target[side]) {
        open[side]++
        events.push({
          type: 'powerplay_start',
          clock,
          period,
          strength: strength(side),
          clubId: clubIds[side],
          skatersFor: skaters(side),
          skatersAgainst: skaters(otherSide(side)),
        })
      }
    }
  }

  return {
    skaters,
    strength,

    boxed(side) {
      return new Set([...serving[side], ...waiting[side]].map((p) => p.player))
    },

    nextExpiry() {
      return Math.min(
        Infinity,
        ...serving.home.map((p) => p.endsAt),
        ...serving.away.map((p) => p.endsAt),
      )
    },

    call(side, player, kind, minutes, clock, period, events) {
      events.push({
        type: 'penalty',
        clock,
        period,
        strength: strength(side),
        clubId: clubIds[side],
        player,
        kind,
        minutes,
      })

      const penalty: Penalty = {
        player,
        parts: minutes === 2 ? [120] : minutes === 4 ? [120, 120] : [300],
        major: minutes === 5,
      }
      if (serving[side].length < MAX_SERVING) serve(side, penalty, clock)
      else waiting[side].push(penalty)

      sync(clock, period, 'penalty', events)
    },

    expire(clock, period, events) {
      let changed = false
      for (;;) {
        const due = (['home', 'away'] as const)
          .flatMap((side) => serving[side].map((entry) => ({ side, entry })))
          .filter(({ entry }) => entry.endsAt <= clock)
          .sort((a, b) => a.entry.endsAt - b.entry.endsAt)[0]
        if (!due) break
        endPart(due.side, due.entry, due.entry.endsAt)
        changed = true
      }
      if (changed) sync(clock, period, 'expired', events)
    },

    goal(side, clock, period, events) {
      const shorthanded = otherSide(side)
      if (skaters(side) <= skaters(shorthanded)) return

      const minor = serving[shorthanded]
        .filter((entry) => !entry.major)
        .sort((a, b) => a.endsAt - b.endsAt)[0]
      if (!minor) return

      endPart(shorthanded, minor, clock)
      sync(clock, period, 'goal', events)
    },

    close(clock, period, events) {
      sync(clock, period, 'period_end', events, true)
    },

    startThreeOnThree() {
      threeOnThree = true
    },
  }
}
