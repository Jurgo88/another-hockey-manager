import type { Lineup } from '../domain/club.js'
import type { MatchEvent } from '../domain/event.js'
import type { FixtureInput } from '../domain/fixture.js'
import type { ClubId, Goalie, Skater } from '../domain/player.js'
import type { Rng } from '../rng/index.js'
import { logit, sigmoid } from './draw.js'
import type { Side } from './penalties.js'

/**
 * The regular-season shootout (FR-09, 03-sim-engine.md).
 *
 * Three rounds, then sudden death, stopping as soon as one side cannot catch
 * up. Each attempt is shooter `shooting` and `puckControl` against Goalie
 * `reflexes` and `positioning`. Attempts are `shot` events in Period 'SO' and
 * nothing else - no `goal` or `save` events - so they decide the result and
 * count for no statistic (event.ts).
 *
 * The away Club shoots first, leaving the home Club the last attempt of each
 * round - the home Club's choice in the NHL, taken the same way every time.
 */

const ROUNDS = 3

/** Log-odds that an average shooter beats an average Goalie. Provisional, unmeasured (OQ #11). */
const SHOOTOUT_BASE = logit(0.32)
const SHOOTOUT_SHOOTER = 0.8
const SHOOTOUT_GOALIE = 0.8
/** Share of failed attempts that miss the net rather than being saved. Unmeasured. */
const SHOOTOUT_MISS_SHARE = 0.25

function centred(value: number): number {
  return (value - 10.5) / 9.5
}

/** Dressed Skaters, best at the shootout first. Nobody shoots twice until everybody has. */
function shooterOrder(lineup: Lineup, skaters: readonly Skater[]): Skater[] {
  const dressed = new Set([
    ...lineup.lines.flatMap((line) => [line.leftWing, line.centre, line.rightWing]),
    ...lineup.pairings.flatMap((pairing) => [pairing.leftDefence, pairing.rightDefence]),
  ])
  const skill = (s: Skater) => s.attributes.shooting + s.attributes.puckControl
  return skaters.filter((s) => dressed.has(s.id)).sort((a, b) => skill(b) - skill(a))
}

/** Plays the shootout at `clock`, appending its attempts, and returns the winner. */
export function playShootout(
  input: FixtureInput,
  clock: number,
  rng: Rng,
  events: MatchEvent[],
): Side {
  const sides = {
    home: {
      clubId: input.homeClub.id,
      shooters: shooterOrder(input.homeLineup, input.homeClub.skaters),
      goalie: input.homeClub.goalies.find((g) => g.id === input.homeLineup.starter)!,
    },
    away: {
      clubId: input.awayClub.id,
      shooters: shooterOrder(input.awayLineup, input.awayClub.skaters),
      goalie: input.awayClub.goalies.find((g) => g.id === input.awayLineup.starter)!,
    },
  }
  const scored: Record<Side, number> = { home: 0, away: 0 }
  const taken: Record<Side, number> = { home: 0, away: 0 }

  const attempt = (side: Side, shooter: Skater, goalie: Goalie, clubId: ClubId) => {
    const chance = sigmoid(
      SHOOTOUT_BASE +
        SHOOTOUT_SHOOTER *
          centred((shooter.attributes.shooting + shooter.attributes.puckControl) / 2) -
        SHOOTOUT_GOALIE * centred((goalie.attributes.reflexes + goalie.attributes.positioning) / 2),
    )
    const goal = rng.chance(chance)
    const miss = !goal && rng.chance(SHOOTOUT_MISS_SHARE)
    events.push({
      type: 'shot',
      clock,
      period: 'SO',
      strength: 'even',
      clubId,
      shooter: shooter.id,
      result: goal ? 'goal' : miss ? 'miss' : 'save',
      ...(goal || miss ? {} : { goalie: goalie.id }),
      danger: chance,
    })
    if (goal) scored[side]++
    taken[side]++
  }

  /** Within the first three rounds: can the trailing side still draw level? */
  const decided = () => {
    const left = (side: Side) => ROUNDS - taken[side]
    return scored.home + left('home') < scored.away || scored.away + left('away') < scored.home
  }

  for (let round = 0; ; round++) {
    for (const side of ['away', 'home'] as const) {
      const shooters = sides[side].shooters
      const opponent = side === 'home' ? sides.away : sides.home
      attempt(side, shooters[round % shooters.length]!, opponent.goalie, sides[side].clubId)
      if (round < ROUNDS && decided()) return scored.home > scored.away ? 'home' : 'away'
    }
    if (round >= ROUNDS - 1 && scored.home !== scored.away) {
      return scored.home > scored.away ? 'home' : 'away'
    }
  }
}
