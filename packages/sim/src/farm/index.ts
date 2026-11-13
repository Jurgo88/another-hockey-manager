import { farmOf, type Club } from '../domain/club.js'
import type { FarmRules, WaiverExemption } from '../domain/farm.js'
import {
  isGoalie,
  naturalPosition,
  playerLevel,
  positionGroup,
  type Goalie,
  type NaturalPosition,
  type Player,
  type PlayerId,
  type PositionGroup,
  type Service,
  type Skater,
} from '../domain/player.js'
import { ACTIVE_SHAPE } from '../domain/roster.js'

/**
 * The farm (ADR-036): which of a Club's contracted Players are on its active
 * Roster, and the call-ups and send-downs that answer injuries during a
 * Season. Every function here serves every Club alike, whoever its Manager is
 * (D-04). Imports the domain only.
 */

const GROUPS: readonly PositionGroup[] = ['forward', 'defence', 'goalie']

/** The active Roster the assistant keeps, by group (ADR-036, #133). */
export const ACTIVE_GROUPS: Readonly<Record<PositionGroup, number>> = {
  forward: ACTIVE_SHAPE.forwards,
  defence: ACTIVE_SHAPE.defence,
  goalie: ACTIVE_SHAPE.goalies,
}

/** The fewest a Club needs at each natural position to dress a Lineup (FR-20). */
export const DRESSING_MINIMUM: Readonly<Record<NaturalPosition, number>> = {
  LW: 4,
  C: 4,
  RW: 4,
  LD: 3,
  RD: 3,
  G: 2,
}

/** The fewest of each group a Lineup dresses (FR-20). */
export const DRESSED: Readonly<Record<PositionGroup, number>> = {
  forward: 12,
  defence: 6,
  goalie: 2,
}

const byLevel = (a: Player, b: Player) =>
  playerLevel(b) - playerLevel(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Every Player a Club holds under contract: its active Roster, then its farm. */
export function contractedOf(club: Club): Player[] {
  return [...club.skaters, ...club.goalies, ...farmOf(club)]
}

/** A Club whose active Roster is `active`; everyone else it holds is on its farm. */
export function withActive(club: Club, active: ReadonlySet<PlayerId>): Club {
  const all = contractedOf(club)
  const on = all.filter((p) => active.has(p.id))
  return {
    ...club,
    skaters: on.filter((p): p is Skater => !isGoalie(p)),
    goalies: on.filter((p): p is Goalie => isGoalie(p)),
    farm: all.filter((p) => !active.has(p.id)),
  }
}

/**
 * The active Roster the assistant picks from everyone a Club holds, as a
 * Season starts (ADR-036): first the best at each natural position until a
 * Lineup can be dressed, then the best of each group up to the shape it keeps.
 * The rest go to the farm. By level, the Season about to be played.
 */
export function assignedClub(club: Club): Club {
  const all = contractedOf(club).sort(byLevel)
  const chosen = new Set<PlayerId>()
  for (const [natural, least] of Object.entries(DRESSING_MINIMUM) as [NaturalPosition, number][]) {
    all
      .filter((p) => naturalPosition(p) === natural && !chosen.has(p.id))
      .slice(0, least)
      .forEach((p) => chosen.add(p.id))
  }
  for (const group of GROUPS) {
    const have = all.filter((p) => positionGroup(p) === group && chosen.has(p.id)).length
    all
      .filter((p) => positionGroup(p) === group && !chosen.has(p.id))
      .slice(0, Math.max(0, ACTIVE_GROUPS[group] - have))
      .forEach((p) => chosen.add(p.id))
  }
  return withActive(club, chosen)
}

// ---------------------------------------------------------------------------
// Service and the exemption from waivers (CBA 13.4)

/**
 * The age at which a Player in a league as it opens is taken to have signed his
 * first contract, when nothing says otherwise: an estimate. A Player older than
 * it is taken to have played every Season since under contract, and NHL games
 * are not estimated, so his Seasons end his exemption.
 */
export const OPENING_SIGNED_AT = 20

/** The service of a Player as a league opens, when his source gives none. */
export function openingService(player: Player): Service {
  const signedAt = Math.min(player.age, OPENING_SIGNED_AT)
  return { signedAt, seasons: player.age - signedAt, games: 0 }
}

/** The service of a Player who has just signed his first contract. */
export function firstService(player: Player): Service {
  return { signedAt: player.age, seasons: 0, games: 0 }
}

/**
 * A Player's service after a Season under contract, with the NHL games he
 * played in it, regular Season and playoffs, folded from its events (D-03).
 */
export function serviceAfter(service: Service, games: number, exemption: WaiverExemption): Service {
  const season = service.seasons + 1
  const shortens =
    service.shortenedIn === undefined &&
    service.signedAt <= exemption.youngUpTo &&
    games >= exemption.shortenAfter
  return {
    ...service,
    seasons: season,
    games: service.games + games,
    ...(shortens ? { shortenedIn: season } : {}),
  }
}

/**
 * Whether a Player goes down to the farm without waivers (CBA 13.4), given the
 * NHL games he has played so far this Season. The row of his age at signing
 * sets the Seasons and the games, and whichever runs out first ends it; for a
 * Player who signed young, the Seasons are cut from the first in which he played
 * enough games. A Player without service is exempt: he has not signed yet.
 */
export function waiverExempt(player: Player, rules: FarmRules, gamesThisSeason: number): boolean {
  const service = player.service
  if (!service) return true
  const { exemption } = rules.waivers
  const goalie = isGoalie(player)
  const table = goalie ? exemption.goalies : exemption.skaters
  const row = table.find((r) => service.signedAt <= r.age) ?? table.at(-1)!
  if (row.games !== null && service.games + gamesThisSeason >= row.games) return false
  const season = service.seasons + 1
  let allowed = row.seasons
  if (service.signedAt <= exemption.youngUpTo) {
    const from =
      service.shortenedIn ?? (gamesThisSeason >= exemption.shortenAfter ? season : undefined)
    const shortened = goalie ? exemption.shortened.goalies : exemption.shortened.skaters
    if (from !== undefined) allowed = Math.min(allowed, from - 1 + shortened)
  }
  return season <= allowed
}

/** A move between a Club's active Roster and its farm. */
export interface FarmMove {
  clubId: string
  playerId: PlayerId
  kind: 'calledUp' | 'sentDown'
}

/** What a Club's farm moves read about a day: who cannot play, and who is on Injured Reserve. */
export interface FarmDay {
  out: (playerId: PlayerId) => boolean
  injuredReserve: (playerId: PlayerId) => boolean
}

/**
 * The assistant's call-ups and send-downs for a day of the Season (ADR-036,
 * #133), before its Fixtures. A Player back from Injured Reserve who leaves the
 * active Roster above its limit sends down the weakest fit Player of a group
 * above the shape the Club keeps. A group with fewer fit Players than that
 * shape calls up the best of its farm while the Roster has room, or whatever
 * it holds when fewer are fit than the emergency rule names (CBA 13.12(m)).
 * A Player on Injured Reserve does not count against the limit (CBA 16.11).
 */
export function farmMoves(club: Club, rules: FarmRules, day: FarmDay): FarmMove[] {
  const moves: FarmMove[] = []
  let active = [...club.skaters, ...club.goalies]
  let farm = [...farmOf(club)]
  const counted = () => active.filter((p) => !day.injuredReserve(p.id)).length
  const fit = (group: PositionGroup) =>
    active.filter((p) => positionGroup(p) === group && !day.out(p.id))

  // Back from Injured Reserve: the active Roster down to its limit.
  while (counted() > rules.activeMax) {
    const surplus = GROUPS.filter((g) => fit(g).length > ACTIVE_GROUPS[g])
    const weakest = surplus
      .flatMap((g) => fit(g))
      .sort(byLevel)
      .at(-1)
    if (!weakest) break
    moves.push({ clubId: club.id, playerId: weakest.id, kind: 'sentDown' })
    active = active.filter((p) => p.id !== weakest.id)
    farm = [...farm, weakest]
  }

  // Short of a group: the best fit Player of the farm, at a natural position
  // the active Roster lacks if there is one.
  for (const group of ['goalie', 'defence', 'forward'] as const) {
    while (fit(group).length < ACTIVE_GROUPS[group]) {
      const emergency = fit(group).length < rules.emergency[group]
      if (counted() >= rules.activeMax && !emergency) break
      const candidates = farm
        .filter((p) => positionGroup(p) === group && !day.out(p.id))
        .sort(byLevel)
      const lacking = new Set(
        (Object.entries(DRESSING_MINIMUM) as [NaturalPosition, number][])
          .filter(
            ([natural, least]) =>
              fit(group).filter((p) => naturalPosition(p) === natural).length < least,
          )
          .map(([natural]) => natural),
      )
      const best = candidates.find((p) => lacking.has(naturalPosition(p))) ?? candidates[0]
      if (!best) break
      moves.push({ clubId: club.id, playerId: best.id, kind: 'calledUp' })
      farm = farm.filter((p) => p.id !== best.id)
      active = [...active, best]
    }
  }
  return moves
}

/** A Club after its farm moves: those called up join its active Roster, those sent down its farm. */
export function afterFarmMoves(club: Club, moves: readonly FarmMove[]): Club {
  if (moves.length === 0) return club
  const active = new Set([...club.skaters, ...club.goalies].map((p) => p.id))
  for (const move of moves) {
    if (move.kind === 'calledUp') active.add(move.playerId)
    else active.delete(move.playerId)
  }
  // Those staying keep their order, and those called up follow them.
  return withActive(club, active)
}
