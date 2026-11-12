import type { Club } from '../domain/club.js'
import {
  entryLevelYears,
  statusOnExpiry,
  type CapRules,
  type Contract,
} from '../domain/contract.js'
import {
  playerLevel,
  positionGroup,
  type Player,
  type PlayerId,
  type PositionGroup,
} from '../domain/player.js'
import type { Rng } from '../rng/index.js'
import { NHL_CAP_SHARES } from './nhl-cap-shares.js'

/**
 * Contracts as a league opens with them, and as Players sign them until the
 * asking price of item 3 replaces this (ADR-030, #125).
 *
 * A Player is priced by his place among the league's Players of his group,
 * ranked by level: as many of each group as real Clubs have regulars are priced
 * on the measured curve by tenth, the rest of a 16-10-3 Roster stands in for
 * call-ups and is paid the minimum. A contract that leaves its Player restricted
 * pays less, by the measured ratio, so that the curve's mean holds over the real
 * mix of entry-level, restricted and unrestricted contracts.
 */

/** Where a Player stands in his group across the league: 0 is the best. */
export interface Place {
  rank: number
  /** How many of his group the league pays as regulars. */
  regulars: number
}

/** Each rostered Player's place in his group across the league, by level. */
export function placesOf(clubs: readonly Club[]): Map<PlayerId, Place> {
  const places = new Map<PlayerId, Place>()
  const players = clubs.flatMap((club) => [...club.skaters, ...club.goalies])
  for (const group of ['forward', 'defence', 'goalie'] as const) {
    const regulars = Math.round(NHL_CAP_SHARES.regularsPerClub[group] * clubs.length)
    players
      .filter((player) => positionGroup(player) === group)
      .sort((a, b) => playerLevel(b) - playerLevel(a) || (a.id < b.id ? -1 : 1))
      .forEach((player, rank) => places.set(player.id, { rank, regulars }))
  }
  return places
}

/** A share of the cap rounded to whole currency, so a roster file reads back exactly what it wrote. */
const inCurrency = (rules: CapRules, share: number) =>
  Math.round(share * rules.upperLimit) / rules.upperLimit

const tenthOf = (place: Place) => Math.min(9, Math.floor((place.rank / place.regulars) * 10))
const thirdOf = (tenth: number) => Math.min(2, Math.floor((tenth * 3) / 10))

/** A new standard contract's length for a regular of this third, by the measured mean (ADR-030). */
function drawTerm(rules: CapRules, third: number, rng: Rng): number {
  const mean = NHL_CAP_SHARES.byThird[third]!.term
  return Math.min(rules.maxTerm.ownClub, rng.int(1, Math.max(1, Math.round(2 * mean - 1))))
}

/** What a regular of this group, tenth and status is paid, as a share of the cap. */
function capHitOf(
  rules: CapRules,
  group: PositionGroup,
  tenth: number,
  onExpiry: Contract['onExpiry'],
): number {
  const mean = NHL_CAP_SHARES.byTenth[group][tenth]!
  const { entryLevel, restricted, restrictedRatio } = NHL_CAP_SHARES.byThird[thirdOf(tenth)]!
  const unrestricted =
    (mean - entryLevel * rules.entryLevel.capHit) /
    (1 - entryLevel - restricted + restricted * restrictedRatio)
  const capHit = onExpiry === 'restricted' ? unrestricted * restrictedRatio : unrestricted
  return inCurrency(rules, Math.min(rules.maximum, Math.max(rules.minimum, capHit)))
}

/** A one-year contract at the minimum: the fill, and whoever the league does not pay as a regular. */
export function minimumContract(rules: CapRules, player: Player): Contract {
  return {
    capHit: rules.minimum,
    years: 1,
    kind: 'standard',
    onExpiry: statusOnExpiry(rules, player.age, 1),
  }
}

/** The entry-level contract a Player signs at his age, when a Club calls him up (ADR-030). */
export function entryLevelContract(rules: CapRules, player: Player): Contract {
  const years = entryLevelYears(rules, player.age)
  return {
    capHit: rules.entryLevel.capHit,
    years,
    kind: 'entry-level',
    onExpiry: statusOnExpiry(rules, player.age, years),
  }
}

/** A standard contract running `years` from now for a regular of this tenth. */
function standardContract(rules: CapRules, player: Player, tenth: number, years: number): Contract {
  const onExpiry = statusOnExpiry(rules, player.age, years)
  return {
    capHit: capHitOf(rules, positionGroup(player), tenth, onExpiry),
    years,
    kind: 'standard',
    onExpiry,
  }
}

/**
 * A new standard contract at what a Player of his place asks: the measured
 * curve for a regular, the minimum otherwise. Until item 3 every expiring
 * contract is renewed at it.
 */
export function askingContract(
  rules: CapRules,
  player: Player,
  place: Place | undefined,
  rng: Rng,
): Contract {
  if (!place || place.rank >= place.regulars) return minimumContract(rules, player)
  const tenth = tenthOf(place)
  return standardContract(rules, player, tenth, drawTerm(rules, thirdOf(tenth), rng))
}

/**
 * The contract a Player holds when a league opens: a young Player an entry-level
 * contract part way through, a regular a standard contract at his ask, some of
 * whose Seasons have already gone, anyone else the minimum.
 */
function openingContract(rules: CapRules, player: Player, place: Place, rng: Rng): Contract {
  const firstTerm = rules.entryLevel.terms[0]!
  if (player.age <= firstTerm.upToAge) {
    const years = rng.int(1, firstTerm.years)
    return {
      ...entryLevelContract(rules, player),
      years,
      onExpiry: statusOnExpiry(rules, player.age, years),
    }
  }
  if (place.rank >= place.regulars) return minimumContract(rules, player)
  const tenth = tenthOf(place)
  return standardContract(rules, player, tenth, rng.int(1, drawTerm(rules, thirdOf(tenth), rng)))
}

/** A Club's cap hits in all, as a share of the cap. */
export function payroll(club: Club): number {
  return [...club.skaters, ...club.goalies].reduce(
    (sum, player) => sum + (player.contract?.capHit ?? 0),
    0,
  )
}

function mapPlayers(club: Club, f: <P extends Player>(player: P) => P): Club {
  return { ...club, skaters: club.skaters.map(f), goalies: club.goalies.map(f) }
}

/**
 * A Club over the cap with every contract above the minimum brought down in
 * proportion to what it pays above it, so that it opens at the cap (ADR-030).
 */
export function withinCap(rules: CapRules, club: Club): Club {
  const total = payroll(club)
  if (total <= 1) return club
  const players = [...club.skaters, ...club.goalies]
  const floor = players.reduce(
    (sum, player) => sum + Math.min(player.contract?.capHit ?? 0, rules.minimum),
    0,
  )
  const k = (1 - floor) / (total - floor)
  return mapPlayers(club, (player) => {
    const contract = player.contract
    if (!contract || contract.capHit <= rules.minimum) return player
    return {
      ...player,
      contract: {
        ...contract,
        // Down, so that rounding cannot leave the Club a dollar over.
        capHit:
          Math.floor((rules.minimum + (contract.capHit - rules.minimum) * k) * rules.upperLimit) /
          rules.upperLimit,
      },
    }
  })
}

/**
 * A league's Clubs as it opens (ADR-030): every Player without a contract gets
 * the one his place and age give him, each from a stream of his own (D-08), and
 * a Club over the cap is brought down to it. A contract a roster file carries
 * is kept.
 */
export function openingContracts(rules: CapRules, clubs: readonly Club[], rng: Rng): Club[] {
  const places = placesOf(clubs)
  return clubs.map((club) =>
    withinCap(
      rules,
      mapPlayers(club, (player) =>
        player.contract
          ? player
          : {
              ...player,
              contract: openingContract(rules, player, places.get(player.id)!, rng.fork(player.id)),
            },
      ),
    ),
  )
}

/**
 * The Clubs a Season on (#125): every contract has one Season fewer, and one that
 * ran out is renewed at the Player's ask, which item 3 replaces with re-signing.
 * A Player without a contract gets his ask too.
 */
export function renewedContracts(rules: CapRules, clubs: readonly Club[], rng: Rng): Club[] {
  const places = placesOf(clubs)
  return clubs.map((club) =>
    mapPlayers(club, (player) => {
      const left = (player.contract?.years ?? 0) - 1
      const contract =
        player.contract && left > 0
          ? { ...player.contract, years: left }
          : askingContract(rules, player, places.get(player.id), rng.fork(player.id))
      return { ...player, contract }
    }),
  )
}
