import type { Club } from '../domain/club.js'
import type { DraftFormat, DraftLottery, DraftPick, Prospect, RosterMoves } from '../domain/draft.js'
import {
  isGoalie,
  naturalPosition,
  playerLevel,
  positionGroup,
  type ClubId,
  type Player,
  type NaturalPosition,
  type PlayerId,
  type PositionGroup,
  type Skater,
  type SkaterPosition,
} from '../domain/player.js'
import type { PlayoffState } from '../domain/playoff.js'
import { expectedLevel } from '../develop/index.js'
import { ROSTER_SHAPE } from '../domain/roster.js'
import { sortStandings, type StandingsRow } from '../domain/standings.js'
import { GOALIE_ATTRIBUTE_SPREAD, SKATER_ATTRIBUTE_SPREAD } from '../develop/index.js'
import { generateDistinctNames } from '../generate/names.js'
import { generateGoalie, generateSkater } from '../generate/roster.js'
import { abilityOfLevel, FILL_ABILITY, levelOfAbility } from '../generate/talent.js'
import { gaussian, type Rng } from '../rng/index.js'

/**
 * The entry draft (ADR-024, ADR-028): the order and its lottery, a class of
 * prospects, the picks, and when a prospect is ready to join his Club.
 *
 * Pure: everything random comes from a stream the caller forks by Season
 * (D-08). Every Manager's pick and every Club's moves go through the same
 * functions; where a Club declared nothing, the assistant's choice stands
 * (D-04).
 */

// ---------------------------------------------------------------------------
// The order

/**
 * The first round's order, which every round follows. The Clubs that missed
 * the playoffs go first, worst first, through the lottery; then the playoff
 * Clubs by points, except that those who reached the format's last rounds go
 * last, by how far they went, the champion last of all.
 */
export function draftOrder(
  format: DraftFormat,
  standings: readonly StandingsRow[],
  playoffs: PlayoffState,
  rng: Rng,
): ClubId[] {
  const worstFirst = sortStandings(standings).reverse().map((row) => row.clubId)
  const qualified = new Set(playoffs.bracket.seeds.map((seed) => seed.clubId))
  const rounds = playoffs.bracket.rounds
  const lastRound = (clubId: ClubId) =>
    rounds.findLast((round) =>
      round.series.some((s) => s.higherSeed.clubId === clubId || s.lowerSeed.clubId === clubId),
    )?.round ?? 0
  const roundCount = Math.max(...rounds.map((round) => round.round), 0)
  // A Club that reached one of the last `deepRunsLast` rounds; the champion one more.
  const depth = (clubId: ClubId) => {
    if (!qualified.has(clubId)) return 0
    const reached = lastRound(clubId) + (playoffs.champion === clubId ? 1 : 0)
    return Math.max(0, reached - (roundCount - format.deepRunsLast))
  }

  const missed = worstFirst.filter((clubId) => !qualified.has(clubId))
  const playoff = worstFirst
    .filter((clubId) => qualified.has(clubId))
    .map((clubId, index) => ({ clubId, index, depth: depth(clubId) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
    .map((entry) => entry.clubId)
  return [...drawLottery(missed, format.lottery, rng), ...playoff]
}

/**
 * The lottery over Clubs in order, worst first. Each draw picks a winner by the
 * odds of his place, among Clubs that have not yet won, for the next pick. A
 * winner who would move up more than `maxJump` places moves up that many, and
 * the pick goes to the worst Club not yet placed.
 */
export function drawLottery(clubs: readonly ClubId[], lottery: DraftLottery, rng: Rng): ClubId[] {
  const order = [...clubs]
  const oddsOf = new Map(clubs.map((clubId, place) => [clubId, lottery.odds[place] ?? 0]))
  const winners = new Set<ClubId>()
  for (let pick = 0; pick < Math.min(lottery.draws, order.length); pick++) {
    const entries = clubs.filter((clubId) => !winners.has(clubId) && oddsOf.get(clubId)! > 0)
    const total = entries.reduce((sum, clubId) => sum + oddsOf.get(clubId)!, 0)
    if (total <= 0) break
    let ticket = rng.next() * total
    const winner =
      entries.find((clubId) => (ticket -= oddsOf.get(clubId)!) < 0) ?? entries[entries.length - 1]!
    winners.add(winner)
    const at = order.indexOf(winner)
    order.splice(at, 1)
    // A winner already placed above the pick, by a capped draw before, stays where he is.
    order.splice(Math.min(at, Math.max(pick, at - lottery.maxJump)), 0, winner)
  }
  return order
}

// ---------------------------------------------------------------------------
// The class

/**
 * How a class is laid out (ADR-028), in the units development moves a Player
 * in: multiples of his group's attribute spread above or below the level of an
 * undrafted fill at his group. One ladder serves Skaters and Goalies alike.
 *
 * THE VALUES ARE FITTED in #89 against the draft table of the Phase 2 gate, and
 * refitted with the long-run calibration (Phase 2, item 8).
 */
export const DRAFT_CLASS = {
  /**
   * Level above a fill by place in the class, from 0 the best to 1 the last,
   * joined by straight lines. With four rounds of a class half as large again,
   * round 1 is the first sixth and round 4 ends at two thirds. The measured
   * classes fall steeply after round 1 and then run flat: rounds 2 to 4 take
   * three Seasons to debut alike, and differ in how many become regulars.
   */
  level: [
    [0, 1.3],
    [1 / 6, -0.3],
    [2 / 3, -0.9],
    [1, -1.4],
  ],
  /** Room to grow at 18 above his level, by place, the same way. */
  room: [
    [0, 2.0],
    [1 / 6, 1.45],
    [2 / 3, 1.0],
    [1, 0.8],
  ],
  /** Noise about each place on the level ladder. */
  noise: 0.3,
  /** Room fewer at 19. */
  roomLessAt19: 0.15,
  /** Noise of the room, only ever upwards. */
  roomNoise: 0.3,
  /** Shares of a class by position, and of those aged 19. */
  goalies: 0.1,
  defence: 0.32,
  aged19: 0.2,
} as const

/** A ladder's value at a place, between its points by a straight line. */
export function onLadder(ladder: readonly (readonly [number, number])[], place: number): number {
  for (let i = 1; i < ladder.length; i++) {
    const [q1, v1] = ladder[i]!
    if (place <= q1 || i === ladder.length - 1) {
      const [q0, v0] = ladder[i - 1]!
      return v0 + ((v1 - v0) * (place - q0)) / (q1 - q0)
    }
  }
  return ladder[0]![1]
}

/** How widely an attribute is spread across a league, in each group (ADR-022). */
export function groupSpread(group: PositionGroup): number {
  return group === 'goalie' ? GOALIE_ATTRIBUTE_SPREAD : SKATER_ATTRIBUTE_SPREAD
}

/** The level of an undrafted fill at a group, the ladder's zero. */
export function fillLevel(group: PositionGroup): number {
  return levelOfAbility(FILL_ABILITY[group])
}

/** How far a level sits above a fill at his group, in spreads: comparable across groups. */
export function aboveFill(level: number, group: PositionGroup): number {
  return (level - fillLevel(group)) / groupSpread(group)
}

/**
 * A class of `size` prospects for the draft before Season `year`, generated
 * with the generator's one-Player functions (ADR-024) at confidence 0.25, and
 * held by no Club. The places on the ladder are fixed; the seed decides who
 * holds them, their positions, ages and the noise.
 */
export function generateClass(rng: Rng, year: number, size: number): Player[] {
  const c = DRAFT_CLASS
  const goalies = Math.round(size * c.goalies)
  const defence = Math.round(size * c.defence)
  const forwardPositions: SkaterPosition[] = ['C', 'LW', 'RW']
  const positions = rng.shuffle(
    Array.from({ length: size }, (_, i): SkaterPosition | 'G' =>
      i < goalies
        ? 'G'
        : i < goalies + defence
          ? (['LD', 'RD'] as const)[i % 2]!
          : forwardPositions[i % 3]!,
    ),
  )
  const names = generateDistinctNames(rng, size)

  return positions.map((position, i) => {
    const group: PositionGroup =
      position === 'G' ? 'goalie' : position === 'LD' || position === 'RD' ? 'defence' : 'forward'
    const spread = groupSpread(group)
    const place = (i + 0.5) / size
    const z = onLadder(c.level, place) + gaussian(rng) * c.noise
    const age = rng.chance(c.aged19) ? 19 : 18
    const room =
      onLadder(c.room, place) - (age === 19 ? c.roomLessAt19 : 0) + Math.abs(gaussian(rng)) * c.roomNoise
    const level = fillLevel(group) + z * spread
    const ability = abilityOfLevel(level)
    const headroom = Math.max(0, abilityOfLevel(level + Math.max(0, room) * spread) - ability)
    const spec = {
      id: `draft-y${year}-${i}`,
      clubId: '',
      person: names[i]!,
      ability,
      age,
      headroom,
    }
    return position === 'G'
      ? generateGoalie(rng, spec)
      : generateSkater(rng, { ...spec, natural: position })
  })
}

// ---------------------------------------------------------------------------
// The picks

/**
 * The assistant's view of a prospect: the top of his range, how far his
 * `potential` sits above a fill at his group, then his level the same way
 * (ADR-028). Need at a position is not part of it.
 */
export function assistantRanking<P extends Player>(prospects: readonly P[]): P[] {
  const score = (player: Player) => {
    const group = positionGroup(player)
    return {
      top: aboveFill(player.potential, group),
      now: aboveFill(playerLevel(player), group),
    }
  }
  return prospects
    .map((player) => ({ player, ...score(player) }))
    .sort(
      (a, b) =>
        b.top - a.top ||
        b.now - a.now ||
        (a.player.id < b.player.id ? -1 : a.player.id > b.player.id ? 1 : 0),
    )
    .map((entry) => entry.player)
}

/**
 * Every pick of a draft, round by round in the order of the first: the first
 * prospect on the Club's list still available, or the assistant's choice. The
 * prospects come back held by the Clubs that picked them.
 */
export function makePicks(
  format: DraftFormat,
  year: number,
  order: readonly ClubId[],
  draftClass: readonly Player[],
  lists: Readonly<Record<ClubId, readonly PlayerId[]>>,
): { picks: DraftPick[]; prospects: Prospect[] } {
  const available = new Map(draftClass.map((player) => [player.id, player]))
  const ranked = assistantRanking(draftClass)
  const picks: DraftPick[] = []
  const prospects: Prospect[] = []
  for (let round = 1; round <= format.rounds; round++) {
    for (const clubId of order) {
      if (available.size === 0) break
      const listed = (lists[clubId] ?? []).find((id) => available.has(id))
      const player = listed ? available.get(listed)! : ranked.find((p) => available.has(p.id))!
      available.delete(player.id)
      const pick = picks.length + 1
      picks.push({ year, round, pick, clubId, playerId: player.id })
      prospects.push({ player: { ...player, clubId }, year, round, pick })
    }
  }
  return { picks, prospects }
}

// ---------------------------------------------------------------------------
// Call-ups and releases

const SHAPE: Readonly<Record<PositionGroup, number>> = {
  forward: ROSTER_SHAPE.forwards,
  defence: ROSTER_SHAPE.defence,
  goalie: ROSTER_SHAPE.goalies,
}

const GROUPS: readonly PositionGroup[] = ['forward', 'defence', 'goalie']

/**
 * The level a Club expects of a Player next Season (ADR-028 amendment): whom
 * to call up and whom to release is chosen a Season ahead, so a declining
 * veteran makes room before a young Player still growing.
 */
const outlook = (player: Player) => expectedLevel(player)

const byOutlook = (a: Player, b: Player) =>
  outlook(a) - outlook(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** A Club's Roster at a position group, weakest next Season first. */
function groupOf(club: Club, group: PositionGroup): Player[] {
  return [...club.skaters, ...club.goalies].filter((p) => positionGroup(p) === group).sort(byOutlook)
}

/** A Player's natural position, a Goalie's being his own. A Roster keeps its balance of them. */
export type Natural = NaturalPosition
export const naturalOf = naturalPosition

/** A Club's Roster at a natural position, weakest next Season first. */
function atNatural(players: readonly Player[], natural: Natural): Player[] {
  return players.filter((p) => naturalOf(p) === natural).sort(byOutlook)
}

/**
 * Whether a prospect is ready (ADR-024, ADR-028): the level expected of him next
 * Season reaches that of the weakest at his natural position on his Club's
 * Roster, or of his position group when nobody plays it. A group with nobody in
 * it takes anyone.
 */
export function isReady(club: Club, prospect: Player): boolean {
  const roster = [...club.skaters, ...club.goalies]
  const weakest =
    atNatural(roster, naturalOf(prospect))[0] ?? groupOf(club, positionGroup(prospect))[0]
  return !weakest || outlook(prospect) >= outlook(weakest)
}

/**
 * The assistant's call-ups and releases for a Club (ADR-028). A gap, at the
 * natural position of whoever left it, goes to the best ready prospect at that
 * position. Then, position by position, while the best prospect left is ready,
 * he is called up and the weakest at his position released, each judged by the
 * level expected of him next Season. A Club keeps its
 * shape and its balance of centres, wings and sides.
 */
export function assistantMoves(
  club: Club,
  prospects: readonly Prospect[],
  gaps: readonly Natural[],
): RosterMoves {
  const callUps: PlayerId[] = []
  const releases: PlayerId[] = []
  let roster: Player[] = [...club.skaters, ...club.goalies]
  const waiting = prospects
    .map((prospect) => prospect.player)
    .filter((player) => player.clubId === club.id)
    .sort(byOutlook)
    .reverse()
  const call = (prospect: Player) => {
    callUps.push(prospect.id)
    roster = [...roster, prospect]
    waiting.splice(waiting.indexOf(prospect), 1)
  }

  for (const natural of gaps) {
    const best = waiting.find((p) => naturalOf(p) === natural)
    if (best && isReady(withRoster(club, roster), best)) call(best)
  }
  for (const natural of ['C', 'LW', 'RW', 'LD', 'RD', 'G'] as const) {
    for (;;) {
      const best = waiting.find((p) => naturalOf(p) === natural)
      const weakest = atNatural(roster, natural)[0]
      if (!best || !weakest || outlook(best) < outlook(weakest)) break
      releases.push(weakest.id)
      roster = roster.filter((p) => p.id !== weakest.id)
      call(best)
    }
  }
  return { callUps, releases }
}

function withRoster(club: Club, roster: readonly Player[]): Club {
  return {
    ...club,
    skaters: roster.filter((p): p is Skater => !isGoalie(p)),
    goalies: roster.filter(isGoalie),
  }
}

/** Why a Club's moves cannot stand, or nothing when they can (ADR-028). */
export function movesViolations(
  club: Club,
  prospects: readonly Prospect[],
  moves: RosterMoves,
): string[] {
  const out: string[] = []
  const held = new Map(
    prospects.filter((p) => p.player.clubId === club.id).map((p) => [p.player.id, p.player]),
  )
  const onRoster = new Map([...club.skaters, ...club.goalies].map((p) => [p.id, p]))
  if (new Set(moves.callUps).size !== moves.callUps.length) out.push('a prospect is called up twice')
  if (new Set(moves.releases).size !== moves.releases.length) out.push('a Player is released twice')
  for (const id of moves.callUps) {
    if (!held.has(id)) out.push(`${id} is not a prospect of Club ${club.id}`)
  }
  for (const id of moves.releases) {
    if (!onRoster.has(id)) out.push(`${id} is not on the Roster of Club ${club.id}`)
  }
  if (out.length > 0) return out
  for (const group of GROUPS) {
    const count =
      groupOf(club, group).length -
      moves.releases.filter((id) => positionGroup(onRoster.get(id)!) === group).length +
      moves.callUps.filter((id) => positionGroup(held.get(id)!) === group).length
    if (count > SHAPE[group]) out.push(`${count} at ${group}, above the shape of ${SHAPE[group]}`)
  }
  return out
}

/** A Club after its moves, with who joined and who was released. The moves are valid. */
export function applyMoves(
  club: Club,
  prospects: readonly Prospect[],
  moves: RosterMoves,
): { club: Club; joined: Player[]; released: Player[] } {
  const releasing = new Set(moves.releases)
  const calling = new Set(moves.callUps)
  const joined = prospects.map((p) => p.player).filter((p) => calling.has(p.id))
  const released = [...club.skaters, ...club.goalies].filter((p) => releasing.has(p.id))
  const stays = (player: Player) => !releasing.has(player.id)
  return {
    club: {
      ...club,
      skaters: [...club.skaters.filter(stays), ...joined.filter((p): p is Skater => !isGoalie(p))],
      goalies: [...club.goalies.filter(stays), ...joined.filter(isGoalie)],
    },
    joined,
    released,
  }
}
