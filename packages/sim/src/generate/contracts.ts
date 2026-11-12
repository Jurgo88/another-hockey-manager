import type { Club } from '../domain/club.js'
import {
  entryLevelYears,
  statusOnExpiry,
  type CapRules,
  type Contract,
  type DeadMoney,
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

/**
 * Each rostered Player's place in his group across the league, by a score, the
 * highest first: his level when a league opens, his public role after a Season
 * (ADR-030). Equal scores go by id.
 */
export function placesOf(
  clubs: readonly Club[],
  score: (player: Player) => number = playerLevel,
): Map<PlayerId, Place> {
  const places = new Map<PlayerId, Place>()
  const players = clubs.flatMap((club) => [...club.skaters, ...club.goalies])
  for (const group of ['forward', 'defence', 'goalie'] as const) {
    const regulars = Math.round(NHL_CAP_SHARES.regularsPerClub[group] * clubs.length)
    players
      .filter((player) => positionGroup(player) === group)
      .sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1))
      .forEach((player, rank) => places.set(player.id, { rank, regulars }))
  }
  return places
}

/** A share of the cap rounded to whole currency, so a roster file reads back exactly what it wrote. */
const inCurrency = (rules: CapRules, share: number) =>
  Math.round(share * rules.upperLimit) / rules.upperLimit

const tenthOf = (place: Place) => Math.min(9, Math.floor((place.rank / place.regulars) * 10))
const thirdOf = (tenth: number) => Math.min(2, Math.floor((tenth * 3) / 10))

/** The age bands of the measured terms, by the oldest age each holds. */
const TERM_AGE_BANDS = [24, 30] as const

/**
 * A new standard contract's length for a regular of this third and age, drawn
 * from the measured terms (ADR-030, #127). A term longer than the rules allow
 * counts as the longest.
 */
function drawTerm(rules: CapRules, third: number, age: number, rng: Rng): number {
  const band = TERM_AGE_BANDS.findIndex((upTo) => age <= upTo)
  const counts: readonly number[] =
    NHL_CAP_SHARES.terms[third]![band < 0 ? TERM_AGE_BANDS.length : band]!
  let pick = rng.next() * counts.reduce((sum, n) => sum + n, 0)
  for (const [i, n] of counts.entries()) {
    pick -= n
    if (pick < 0) return Math.min(rules.maxTerm.ownClub, i + 1)
  }
  return 1
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
 * A new standard contract at what a Player of his place asks (ADR-030): the
 * measured curve for a regular, the minimum otherwise. The term is `years`
 * when a Club names it, and otherwise drawn as the measured terms run; a
 * Player beyond the regulars signs for one year unless a Club names more.
 */
export function askingContract(
  rules: CapRules,
  player: Player,
  place: Place | undefined,
  rng: Rng,
  years?: number,
): Contract {
  if (!place || place.rank >= place.regulars) {
    const term = years ?? 1
    return {
      ...minimumContract(rules, player),
      years: term,
      onExpiry: statusOnExpiry(rules, player.age, term),
    }
  }
  const tenth = tenthOf(place)
  return standardContract(
    rules,
    player,
    tenth,
    years ?? drawTerm(rules, thirdOf(tenth), player.age, rng),
  )
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
  return standardContract(
    rules,
    player,
    tenth,
    rng.int(1, drawTerm(rules, thirdOf(tenth), player.age, rng)),
  )
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
 * The Clubs a Season on: every contract has one Season fewer. One at 0 has run
 * out, and its Player waits on his Club's decision in the re-signing window
 * (ADR-032, #127).
 */
export function tickedContracts(clubs: readonly Club[]): Club[] {
  return clubs.map((club) =>
    mapPlayers(club, (player) =>
      player.contract
        ? { ...player, contract: { ...player.contract, years: player.contract.years - 1 } }
        : player,
    ),
  )
}

/**
 * What a Club pays for a contract it releases (ADR-031): the share of what is
 * left the rules keep, a smaller one for a young Player, spread over a multiple
 * of the Seasons left. In whole currency.
 */
export function buyout(rules: CapRules, player: Player): DeadMoney | null {
  const contract = player.contract
  if (!contract || contract.years < 1) return null
  const { fraction, youngFraction, youngUnder, spread } = rules.buyout
  const share = player.age < youngUnder ? youngFraction : fraction
  return {
    playerId: player.id,
    capHit: inCurrency(rules, (contract.capHit * share) / spread),
    years: contract.years * spread,
  }
}

/** What a Club's dead money charges this Season, as a share of the cap. */
export function deadCharge(dead: readonly DeadMoney[] | undefined): number {
  return (dead ?? []).reduce((sum, entry) => sum + entry.capHit, 0)
}

/** Dead money a Season on: a Season fewer each, those run out gone. */
export function tickedDeadMoney(
  dead: Readonly<Record<string, readonly DeadMoney[]>>,
): Record<string, DeadMoney[]> {
  return Object.fromEntries(
    Object.entries(dead).map(([clubId, entries]) => [
      clubId,
      entries.map((e) => ({ ...e, years: e.years - 1 })).filter((e) => e.years > 0),
    ]),
  )
}

/**
 * A Club below the floor raised to it as a Season starts (ADR-031): its lowest
 * contracts are lifted together to the level at which its payroll, dead money
 * included, reaches the floor. Rounded up to whole currency, so it never falls
 * short.
 */
export function atFloor(rules: CapRules, club: Club, dead: number): Club {
  const players = [...club.skaters, ...club.goalies]
  const total = payroll(club) + dead
  if (total >= rules.lowerLimit || players.length === 0) return club
  const hits = players.map((p) => p.contract?.capHit ?? 0).sort((a, b) => a - b)
  const target = rules.lowerLimit - dead
  // The level L at which the sum of max(hit, L) reaches the target.
  let level = target / hits.length
  for (let k = hits.length; k > 0; k--) {
    const above = hits.slice(k).reduce((sum, h) => sum + h, 0)
    const candidate = (target - above) / k
    if (candidate >= hits[k - 1]! && (k === hits.length || candidate <= hits[k]!)) {
      level = candidate
      break
    }
  }
  const lifted = Math.ceil(level * rules.upperLimit) / rules.upperLimit
  return mapPlayers(club, (player) =>
    player.contract && player.contract.capHit < lifted
      ? { ...player, contract: { ...player.contract, capHit: lifted } }
      : player,
  )
}
