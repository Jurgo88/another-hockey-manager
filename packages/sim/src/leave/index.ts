import type { Club } from '../domain/club.js'
import {
  isGoalie,
  playerLevel,
  type ClubId,
  type Goalie,
  type Player,
  type PlayerId,
  type Skater,
  type SkaterPosition,
} from '../domain/player.js'
import { ROSTER_SHAPE } from '../domain/roster.js'
import { generateDistinctNames } from '../generate/names.js'
import { generateGoalie, generateSkater } from '../generate/roster.js'
import {
  DEFENCE_SLOT_ABILITY,
  FORWARD_SLOT_ABILITY,
  GOALIE_SLOT_ABILITY,
  generateAgeAndHeadroom,
} from '../generate/talent.js'
import type { Rng } from '../rng/index.js'

/**
 * Leaving the league between Seasons (ADR-023, ADR-027, #88).
 *
 * Two ways out, drawn in turn from one stream per Player and Season (D-08):
 *
 * - **Retired**: the Player's decision, by age alone. A Manager cannot
 *   overrule it.
 * - **Unsigned**: nobody gives him a new contract. Its chance falls steeply
 *   with his role, his ice time per Fixture among the Players at his position
 *   across the league. It stands in for contracts until Phase 3, where a
 *   Manager's decision not to re-sign, and free agency, replace it.
 *
 * A Club then fills each gap with an undrafted Player at the depth of a
 * call-up, so it keeps its Roster shape. Release, the Club's decision when new
 * Players push others out, comes with the draft (#89).
 *
 * THE PARAMETERS ARE FITTED in #88 to the measured rates in
 * `04-validation-targets.md`, on one played Season of three generated leagues,
 * and checked on the 2025-26 roster file. They are refitted with the long-run
 * calibration (Phase 2, item 8).
 */

/** Who left the league between one Season and the next, and why. */
export interface Departure {
  playerId: PlayerId
  clubId: ClubId
  /** His age in the Season he last played. */
  age: number
  reason: 'retired' | 'unsigned'
}

/** Forwards, defencemen and Goalies are ranked apart, as they were measured. */
export type PositionGroup = 'forward' | 'defence' | 'goalie'

export function positionGroup(player: Player): PositionGroup {
  if (isGoalie(player)) return 'goalie'
  const natural = player.preferredPositions[0]
  return natural === 'LD' || natural === 'RD' ? 'defence' : 'forward'
}

/** Retiring: even odds at about 40, rising by a factor of 1.57 a year. */
export const RETIREMENT = { logOddsAt35: -2.27, perYear: 0.45 } as const

/** A Player's chance to retire after a Season, from his age in it. */
export function retirementChance(age: number): number {
  return logistic(RETIREMENT.logOddsAt35 + RETIREMENT.perYear * (age - 35))
}

/**
 * Not signed again: about 37% for a Player with the smallest role, below 1% for
 * a regular in the top half, and slightly likelier the older he is.
 */
export const UNSIGNED = { logOdds: -3.28, roleWeight: 5.48, perYear: 0.11, aroundAge: 27 } as const

/**
 * A Player's chance to be left without a contract after a Season, from his age
 * in it and his role: 0 the smallest at his position in the league, 1 the largest.
 */
export function unsignedChance(age: number, role: number): number {
  return logistic(
    UNSIGNED.logOdds +
      UNSIGNED.roleWeight * (0.5 - role) +
      UNSIGNED.perYear * (age - UNSIGNED.aroundAge),
  )
}

/** The chance to leave by either way, as `departures` draws them in turn. */
export function leavingChance(age: number, role: number): number {
  return 1 - (1 - retirementChance(age)) * (1 - unsignedChance(age, role))
}

function logistic(logOdds: number): number {
  return 1 / (1 + Math.exp(-logOdds))
}

/** What a Player did in a Season, for his role. */
export interface SeasonUsage {
  /** Fixtures he played. */
  fixtures: number
  /** A Skater's ice time per Fixture, in seconds. Goalies are ranked by `fixtures`. */
  secondsPerFixture: number
  /** Whether he was out injured when the Season ended. */
  injured: boolean
}

/**
 * Each Player's role in the Season just played, 0 to 1 within his position
 * group across the league: Skaters by ice time per Fixture, Goalies by
 * Fixtures, as measured. A Player who did not play has role 0, unless he was
 * injured, who takes his rank by level instead: an injury does not end a
 * career by itself. Equal values go by id, so the order is total.
 */
export function roles(
  clubs: readonly Club[],
  usage: (player: Player) => SeasonUsage,
): Map<PlayerId, number> {
  const everyone = clubs.flatMap((club) => [...club.skaters, ...club.goalies])
  const result = new Map<PlayerId, number>()
  const byGroup = (members: readonly Player[], score: (player: Player) => number) => {
    for (const group of ['forward', 'defence', 'goalie'] as const) {
      const ranked = members
        .filter((player) => positionGroup(player) === group)
        .map((player) => ({ id: player.id, score: score(player) }))
        .sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      const last = Math.max(1, ranked.length - 1)
      ranked.forEach((member, index) => result.set(member.id, index / last))
    }
  }

  const levels = new Map<PlayerId, number>()
  byGroup(everyone, playerLevel)
  for (const [id, rank] of result) levels.set(id, rank)
  result.clear()

  const played = everyone.filter((player) => usage(player).fixtures > 0)
  byGroup(played, (player) => {
    const { fixtures, secondsPerFixture } = usage(player)
    return isGoalie(player) ? fixtures : secondsPerFixture
  })
  for (const player of everyone) {
    if (result.has(player.id)) continue
    result.set(player.id, usage(player).injured ? levels.get(player.id)! : 0)
  }
  return result
}

/**
 * Who leaves after the Season the Clubs have just played, and why. Each Player
 * draws from his own stream (D-08): first whether he retires, then, if not,
 * whether he is signed again.
 */
export function departures(
  clubs: readonly Club[],
  roleOf: ReadonlyMap<PlayerId, number>,
  streamOf: (player: Player) => Rng,
): Departure[] {
  const out: Departure[] = []
  for (const club of clubs) {
    for (const player of [...club.skaters, ...club.goalies]) {
      const rng = streamOf(player)
      const reason = rng.chance(retirementChance(player.age))
        ? 'retired'
        : rng.chance(unsignedChance(player.age, roleOf.get(player.id) ?? 0))
          ? 'unsigned'
          : null
      if (reason) out.push({ playerId: player.id, clubId: club.id, age: player.age, reason })
    }
  }
  return out
}

/** The ability of the last call-up in a generated league, at each position group (ADR-023). */
export const FILL_ABILITY: Readonly<Record<PositionGroup, number>> = {
  forward: FORWARD_SLOT_ABILITY[FORWARD_SLOT_ABILITY.length - 1]!,
  defence: DEFENCE_SLOT_ABILITY[DEFENCE_SLOT_ABILITY.length - 1]!,
  goalie: GOALIE_SLOT_ABILITY[GOALIE_SLOT_ABILITY.length - 1]!,
}

/**
 * The Club with each gap in its Roster shape filled by an undrafted Player,
 * generated at the depth of a call-up and marked generated (ADR-023). A gap at
 * forward or on defence takes the natural position of whoever left it, so a
 * Club keeps its balance of centres, wings and sides. Ids carry the Season, so
 * a filled Player is never mistaken for one who left.
 */
export function filledRoster(club: Club, left: readonly Player[], rng: Rng, year: number): Club {
  const forwards = club.skaters.filter((skater) => positionGroup(skater) === 'forward').length
  const defence = club.skaters.length - forwards
  const wanted = (group: PositionGroup, have: number, shape: number): SkaterPosition[] => {
    const natural = left
      .filter((player): player is Skater => !isGoalie(player) && positionGroup(player) === group)
      .map((skater) => skater.preferredPositions[0]!)
    const fallback: SkaterPosition[] = group === 'forward' ? ['C', 'LW', 'RW'] : ['LD', 'RD']
    return Array.from(
      { length: Math.max(0, shape - have) },
      (_, i) => natural[i] ?? fallback[i % fallback.length]!,
    )
  }
  const skaterGaps = [
    ...wanted('forward', forwards, ROSTER_SHAPE.forwards),
    ...wanted('defence', defence, ROSTER_SHAPE.defence),
  ]
  const goalieGaps = Math.max(0, ROSTER_SHAPE.goalies - club.goalies.length)
  if (skaterGaps.length + goalieGaps === 0) return club

  const names = generateDistinctNames(rng, skaterGaps.length + goalieGaps)
  let n = 0
  const next = () => {
    const k = n++
    return { id: `${club.id}-y${year}-u${k}`, clubId: club.id, person: names[k]! }
  }

  const skaters: Skater[] = skaterGaps.map((natural) => {
    const ability = FILL_ABILITY[natural === 'LD' || natural === 'RD' ? 'defence' : 'forward']
    const { age, headroom } = generateAgeAndHeadroom(rng, ability)
    return generateSkater(rng, { ...next(), natural, ability, age, headroom })
  })
  const goalies: Goalie[] = Array.from({ length: goalieGaps }, () => {
    const ability = FILL_ABILITY.goalie
    const { age, headroom } = generateAgeAndHeadroom(rng, ability, 'goalie')
    return generateGoalie(rng, { ...next(), ability, age, headroom })
  })

  return { ...club, skaters: [...club.skaters, ...skaters], goalies: [...club.goalies, ...goalies] }
}
