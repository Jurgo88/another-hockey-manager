import { farmOf, type Club } from '../domain/club.js'
import type { CompetitionStructure } from '../domain/competition.js'
import type { FarmLeague, FarmRules, WaiverExemption } from '../domain/farm.js'
import {
  isGoalie,
  naturalPosition,
  playerLevel,
  positionGroup,
  type Goalie,
  type NaturalPosition,
  type ClubId,
  type Player,
  type PlayerId,
  type PositionGroup,
  type Service,
  type Skater,
} from '../domain/player.js'
import { ACTIVE_SHAPE, ROSTER_SIZE } from '../domain/roster.js'

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

/**
 * A move between a Club's active Roster and its farm, or through waivers: put
 * on them, claimed by another Club (`clubId` the one claiming), or cleared to
 * the farm.
 */
export type FarmMove =
  | { kind: 'sentDown' | 'waived' | 'cleared'; clubId: ClubId; playerId: PlayerId }
  /**
   * `emergency`: called up below the emergency line (CBA 13.12(m)), which no
   * limit after the deadline counts. `offCap`: called up in a roster emergency,
   * off the cap while it lasts (CBA 50.10(e)).
   */
  | { kind: 'calledUp'; clubId: ClubId; playerId: PlayerId; emergency?: true; offCap?: true }
  | { kind: 'claimed'; clubId: ClubId; playerId: PlayerId; fromClubId: ClubId }

/**
 * What a Club's farm moves read about a day: who cannot play, who is on Injured
 * Reserve, and who can go down to the farm without waivers.
 */
export interface FarmDay {
  out: (playerId: PlayerId) => boolean
  injuredReserve: (playerId: PlayerId) => boolean
  free: (playerId: PlayerId) => boolean
  /** Whether the cap allows the active Roster with these called up and these sent down (ADR-031). */
  affords: (calledUp: readonly Player[], sentDown: readonly Player[]) => boolean
  /** The most a Player called up in a roster emergency may be paid, as a share of the cap. */
  emergencyCapHit: number
  /** From the trade deadline on (CBA 13.12(j)-(n)): what is left of the Club's regular call-ups. */
  deadline?: DeadlineDay
  /**
   * Whether a Player may be recalled other than in an emergency: in a run that
   * plays the farm's games, one sent down must play a farm Fixture first (the
   * memorandum of 2025, item 30). Left out, anyone may be.
   */
  mayRecall?: (playerId: PlayerId) => boolean
}

/** What the deadline leaves a Club on a day after it. */
export interface DeadlineDay {
  /** Regular call-ups left. */
  recalls: number
  /** How many more regular call-ups may be up at once. */
  onRoster: number
  /** Whether a Player may go down: only one called up since the deadline. */
  mayGoDown: (playerId: PlayerId) => boolean
}

/**
 * The assistant's call-ups and send-downs for a day of the Season (ADR-036,
 * #133), before its Fixtures. A Player back from Injured Reserve who leaves the
 * active Roster above its limit sends down the weakest fit Player of a group
 * above the shape the Club keeps who can go down without waivers, or the
 * weakest of them all, through waivers, when none can. A group with fewer fit Players than that
 * shape calls up the best of its farm while the Roster has room, or whatever
 * it holds when fewer are fit than the emergency rule names (CBA 13.12(m)).
 * A Player on Injured Reserve does not count against the limit (CBA 16.11).
 * A call-up must fit under the cap; in an emergency a Club that cannot afford
 * one calls up the best Player paid little enough to come off the cap while it
 * lasts (CBA 50.10(e)).
 *
 * From the trade deadline the active Roster has no limit (CBA 16.4(a)): only a
 * Player called up since it goes back down, when the Roster is above the limit
 * it had, and a call-up other than an emergency one takes one of the regular
 * call-ups left (13.12(l)).
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
    const candidates = surplus
      .flatMap((g) => fit(g))
      .filter((p) => !day.deadline || day.deadline.mayGoDown(p.id))
      .sort(byLevel)
    const weakest = candidates.filter((p) => day.free(p.id)).at(-1) ?? candidates.at(-1)
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
      const regulars = moves.filter((m) => m.kind === 'calledUp' && !m.emergency).length
      if (day.deadline) {
        // No limit, but the regular call-ups left (13.12(l)).
        const left = Math.min(day.deadline.recalls, day.deadline.onRoster) - regulars
        if (!emergency && left <= 0) break
      } else if (counted() >= rules.activeMax && !emergency) break
      const candidates = farm
        .filter(
          (p) =>
            positionGroup(p) === group &&
            !day.out(p.id) &&
            (emergency || !day.mayRecall || day.mayRecall(p.id)),
        )
        .sort(byLevel)
      const lacking = new Set(
        (Object.entries(DRESSING_MINIMUM) as [NaturalPosition, number][])
          .filter(
            ([natural, least]) =>
              fit(group).filter((p) => naturalPosition(p) === natural).length < least,
          )
          .map(([natural]) => natural),
      )
      const calledUp = () =>
        moves
          .filter((m) => m.kind === 'calledUp' && !m.offCap)
          .map((m) => contractedOf(club).find((p) => p.id === m.playerId)!)
      const sentDown = () =>
        moves
          .filter((m) => m.kind === 'sentDown')
          .map((m) => contractedOf(club).find((p) => p.id === m.playerId)!)
      const affordable = candidates.filter((p) => day.affords([...calledUp(), p], sentDown()))
      const pick = (from: readonly Player[]) =>
        from.find((p) => lacking.has(naturalPosition(p))) ?? from[0]
      const best = pick(affordable)
      const cheap = emergency
        ? pick(candidates.filter((p) => (p.contract?.capHit ?? 0) <= day.emergencyCapHit))
        : undefined
      const chosen = best ?? cheap
      if (!chosen) break
      moves.push({
        clubId: club.id,
        playerId: chosen.id,
        kind: 'calledUp',
        ...(emergency ? { emergency: true as const } : {}),
        ...(best ? {} : { offCap: true as const }),
      })
      farm = farm.filter((p) => p.id !== chosen.id)
      active = [...active, chosen]
    }
  }
  return moves
}

/** A Club after its call-ups and send-downs: those called up join its active Roster, those sent down its farm. */
export function afterFarmMoves(club: Club, moves: readonly FarmMove[]): Club {
  if (moves.length === 0) return club
  const active = new Set([...club.skaters, ...club.goalies].map((p) => p.id))
  for (const move of moves) {
    if (move.kind === 'calledUp') active.add(move.playerId)
    else if (move.kind === 'sentDown') active.delete(move.playerId)
  }
  // Those staying keep their order, and those called up follow them.
  return withActive(club, active)
}

// ---------------------------------------------------------------------------
// Claims (CBA 13.19)

/**
 * How much better than the weakest of his group on its active Roster a Player
 * on waivers must be for the assistant to claim him, in levels, and how many
 * contracts beyond the shape it keeps (`ROSTER_SHAPE`) it holds at most to claim
 * one. Estimates, as `SWAP.margin` is: no measured rate of claims is a target.
 * Without the second, the Club lowest in the table claimed nearly every Player
 * better than its weakest, and held 50 contracts by the Season's end.
 */
export const CLAIM = { margin: 1, spare: 2 }

/**
 * Whether the assistant claims a Player off waivers for a Club (ADR-036), the
 * same for every Club (D-04): one its active Roster is short of at his group,
 * or one clearly better than the weakest there, while it holds few enough
 * contracts. Whether the Club can afford him
 * and has a contract to spare is the caller's to check.
 */
export function wantsClaim(club: Club, player: Player): boolean {
  if (contractedOf(club).length >= ROSTER_SIZE + CLAIM.spare) return false
  const group = positionGroup(player)
  const mates = [...club.skaters, ...club.goalies].filter((p) => positionGroup(p) === group)
  if (mates.length < ACTIVE_GROUPS[group]) return true
  const weakest = Math.min(...mates.map(playerLevel))
  return playerLevel(player) >= weakest + CLAIM.margin
}

/** A row of a table as claims read it. */
export interface ClaimRow {
  clubId: ClubId
  points: number
  gamesPlayed: number
}

/**
 * The order in which Clubs may claim (CBA 13.19): the lowest share of the points
 * possible first. `table` lists the Clubs best first, as standings are kept, so
 * a tie goes to the Club lower in it; a Club without a row comes after them all.
 */
export function claimOrder(table: readonly ClaimRow[], clubIds: readonly ClubId[]): ClubId[] {
  const at = new Map(table.map((row, i) => [row.clubId, i]))
  const share = (id: ClubId) => {
    const row = table.find((r) => r.clubId === id)
    return row && row.gamesPlayed > 0 ? row.points / (2 * row.gamesPlayed) : 0.5
  }
  return [...clubIds].sort(
    (a, b) =>
      share(a) - share(b) || (at.get(b) ?? -1) - (at.get(a) ?? -1) || (a < b ? -1 : a > b ? 1 : 0),
  )
}

// ---------------------------------------------------------------------------
// Development on the farm (ADR-022, ADR-036)

/**
 * How many of each group a farm dresses for its affiliate's games: a Lineup's
 * 12 forwards and 6 defencemen, and the Goalie who starts most. The affiliate
 * fills the rest with Players on minor-league contracts (ADR-036).
 */
export const AFFILIATE_DRESSED: Readonly<Record<PositionGroup, number>> = {
  forward: 12,
  defence: 6,
  goalie: 1,
}

/**
 * Whether a Player on a Club's farm plays as a regular for its affiliate, in a
 * run that does not play the farm's games (ADR-036): his rank by level among
 * the farm's Players of his group stands in for the ice time he would get.
 */
export function regularOnFarm(club: Club, player: Player): boolean {
  const group = positionGroup(player)
  const rank = farmOf(club)
    .filter((p) => positionGroup(p) === group)
    .sort(byLevel)
    .findIndex((p) => p.id === player.id)
  return rank >= 0 && rank < AFFILIATE_DRESSED[group]
}

// ---------------------------------------------------------------------------
// The affiliates' games (ADR-036, #135)

const AFFILIATE_MARK = '-farm'

/** The id a Club's affiliate plays under. */
export function affiliateId(clubId: ClubId): ClubId {
  return `${clubId}${AFFILIATE_MARK}`
}

/** The Club an affiliate's id belongs to. */
export function parentOf(id: ClubId): ClubId {
  return id.endsWith(AFFILIATE_MARK) ? id.slice(0, -AFFILIATE_MARK.length) : id
}

/**
 * The affiliates' league as a Competition (D-10): its Competition's alignment,
 * each affiliate in its Club's Division, with the league's key and calendar.
 */
export function affiliateStructure(
  structure: CompetitionStructure,
  league: FarmLeague,
): CompetitionStructure {
  return {
    ...structure,
    id: `${structure.id}${AFFILIATE_MARK}`,
    name: `${structure.name} affiliates`,
    divisions: structure.divisions.map((division) => ({
      ...division,
      clubIds: division.clubIds.map(affiliateId),
    })),
    scheduleKey: league.scheduleKey,
    calendar: league.calendar,
  }
}

/**
 * A Club's affiliate as the engine plays it: the Club's farm and the Players
 * on minor-league contracts, under the affiliate's id.
 */
export function affiliateOf(club: Club, minorLeague: readonly Player[]): Club {
  const all = [...farmOf(club), ...minorLeague]
  return {
    id: affiliateId(club.id),
    code: club.code,
    name: club.name,
    skaters: all.filter((p): p is Skater => !isGoalie(p)),
    goalies: all.filter((p): p is Goalie => isGoalie(p)),
  }
}

/**
 * How far ahead in level and form together a Player must be for the assistant
 * to swap him for another between the active Roster and the farm, in levels,
 * and the groups it swaps. Estimates: no measured target counts call-ups for
 * form. At a margin of 1 the forward tier-1 to tier-4 points-per-minute ratio
 * of the farm tier rose to 3.215 against 2.71 ±0.50; at 1.5 every band holds,
 * with about 3 swaps a Club a Season. Goalies are not swapped: a save
 * percentage over ten Fixtures is mostly noise, and swapping by it took the
 * most-used Goalie's share to 53.0% against 59.0% ±5 (#135).
 */
export const FORM_SWAP: { margin: number; groups: readonly PositionGroup[] } = {
  margin: 1.5,
  groups: ['forward', 'defence'],
}

/** What the assistant's swaps for form read about a day (ADR-036, #135). */
export interface FormDay {
  /** A Player's level plus his form, or null while his form says nothing. */
  merit: (playerId: PlayerId) => number | null
  out: (playerId: PlayerId) => boolean
  injuredReserve: (playerId: PlayerId) => boolean
  /** Whether he goes down without waivers. */
  free: (playerId: PlayerId) => boolean
  mayRecall: (playerId: PlayerId) => boolean
  /** Whether the cap allows these called up and these sent down, beyond the day's other moves. */
  affords: (calledUp: readonly Player[], sentDown: readonly Player[]) => boolean
}

/**
 * The assistant's swaps for form (ADR-036, #135), the same for every Club
 * (D-04): at each group it swaps, the farm's best by level and form together comes up
 * for the weakest fit Player of the active Roster who can go down without
 * waivers, when he is `FORM_SWAP.margin` ahead and the active Roster can
 * still dress a Lineup at every natural position. At most one a group a day.
 */
export function formSwaps(club: Club, day: FormDay): FarmMove[] {
  const moves: FarmMove[] = []
  const up: Player[] = []
  const down: Player[] = []
  const active = [...club.skaters, ...club.goalies]
  for (const group of FORM_SWAP.groups) {
    const ranked = (players: readonly Player[]) =>
      players
        .map((p) => ({ p, merit: day.merit(p.id) }))
        .filter((m): m is { p: Player; merit: number } => m.merit !== null)
        .sort((a, b) => a.merit - b.merit || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0))
    const fitActive = active.filter(
      (p) => positionGroup(p) === group && !day.out(p.id) && !day.injuredReserve(p.id),
    )
    const weakest = ranked(fitActive.filter((p) => day.free(p.id)))[0]
    if (!weakest) continue
    const best = ranked(
      farmOf(club).filter(
        (p) => positionGroup(p) === group && !day.out(p.id) && day.mayRecall(p.id),
      ),
    )
      .reverse()
      .find(({ p }) => {
        const natural = naturalPosition(weakest.p)
        if (naturalPosition(p) === natural) return true
        const left = fitActive.filter((q) => naturalPosition(q) === natural).length - 1
        return left >= DRESSING_MINIMUM[natural]
      })
    if (!best || best.merit < weakest.merit + FORM_SWAP.margin) continue
    if (!day.affords([...up, best.p], [...down, weakest.p])) continue
    up.push(best.p)
    down.push(weakest.p)
    moves.push(
      { clubId: club.id, playerId: weakest.p.id, kind: 'sentDown' },
      { clubId: club.id, playerId: best.p.id, kind: 'calledUp' },
    )
  }
  return moves
}
