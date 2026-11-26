import type { Club } from '../domain/club.js'
import type { CapRules } from '../domain/contract.js'
import type { Prospect } from '../domain/draft.js'
import {
  playerLevel,
  positionGroup,
  type ClubId,
  type Player,
  type PlayerId,
  type PositionGroup,
} from '../domain/player.js'
import { pickKey, type PickRef, type Trade, type TradeSide } from '../domain/trade.js'
import { expectedLevel } from '../develop/index.js'
import { DRAFT_CLASS, fillLevel, groupSpread, onLadder } from '../draft/index.js'
import { contractedOf } from '../farm/index.js'
import { fairCapHit, regularsOf } from '../generate/contracts.js'

/**
 * Trades (ADR-033): what a trade is worth to each Club, and the trades the
 * assistant proposes and accepts, the same for every Club (D-04). Every value is
 * read through the Club's view of a Player, the truth until scouting (item 8,
 * ADR-035), and is a share of the cap. Imports domain, develop, draft, farm and
 * generate; the Season decides when trades happen and applies them.
 */

/**
 * The assistant's valuation and search, estimates fitted on the movement
 * targets of the Phase 3 gate (#138):
 *
 * - `margin`: what each Club must gain, as a share of the cap;
 * - `discount`: each Season further ahead counts this much less;
 * - `now`: the weight of what is left of this Season, `base` plus `race` times
 *   the Club's chance of the playoffs;
 * - `win`: what one level of upgrade in the Lineup is worth over a whole
 *   Season, beyond the role's price, to a Club sure of the playoffs: it is
 *   weighted by the Club's chance of them;
 * - `race`: the slope of the chance of the playoffs, per point of margin over
 *   the square root of the Fixtures left;
 * - `pickDelay`: Seasons from a draft to the first in which its pick plays;
 * - `controlled`: Seasons a pick or a prospect plays for his entry-level price;
 * - `reach`: the share of his room a pick is expected to grow into;
 * - `sell` and `buy`: during a Season a Club sells below this chance of the
 *   playoffs and buys above that one;
 * - `playoffs`: what the playoffs add to an upgrade, as a share of a regular
 *   Season, whenever in it a Club acquires him;
 * - `patience`: what a seller asks beyond the margin, times the share of the
 *   Season still before the deadline: it waits for the offers the deadline
 *   brings, as the measured moves bunch before it;
 * - `share`: the least share of what a trade gains both Clubs that the seller
 *   takes, as several buyers bidding for a Player would give it; without it a
 *   Club in the race bought stars for a late pick and the table spread past its
 *   band (#138);
 * - `perRound` and `perWindow`: trades a Club makes at most in one round of a
 *   Season, and in one round of a window between Seasons;
 * - `offeredYears`: during a Season a Club offers the Players with at most
 *   this many Seasons left on their contracts, and no Goalie: a Goalie traded
 *   during a Season splits his starts between two Clubs, which took the most-used
 *   Goalie's share below its band (#138). Between Seasons it offers anyone.
 */
export const TRADE = {
  margin: 0.001,
  discount: 0.85,
  now: { base: 0.3, race: 1.2 },
  win: 0.06,
  race: { slope: 0.6 },
  pickDelay: 2,
  controlled: 3,
  reach: 0.6,
  sell: 0.25,
  buy: 0.65,
  playoffs: 0.5,
  perRound: 4,
  perWindow: 6,
  patience: 0.05,
  share: 0.4,
  offeredYears: 2,
}

/** How many of each group a Lineup dresses for its value now: the starting Goalie only. */
const LINEUP: Readonly<Record<PositionGroup, number>> = { forward: 12, defence: 6, goalie: 1 }

/** A pick that can be traded, who owns it, and its expected place in its class, 0 the first. */
export interface TradablePick {
  ref: PickRef
  owner: ClubId
  place: number
}

/** What trades are valued and searched in: a day of a Season, or a window between Seasons. */
export interface TradeContext {
  rules: CapRules
  clubs: readonly Club[]
  prospects: readonly Prospect[]
  /** A Club's view of a Player (ADR-035): the truth until scouting. */
  view: (clubId: ClubId, player: Player) => Player
  /** Clubs with the same key see every Player alike, so what is read of him is read once. */
  viewKey: (clubId: ClubId) => string
  /** A Club's chance of the playoffs, 0 to 1; 0.5 between Seasons. */
  chance: (clubId: ClubId) => number
  /** The share of a Season still ahead whose play a Player adds to: 1 between Seasons. */
  now: number
  /** The Season now, or the one about to start. */
  year: number
  /** The share of a regular Season still to go before the deadline: 0 between Seasons. */
  toDeadline: number
  picks: readonly TradablePick[]
  /** Whether a trade breaks no rule of the Season (cap, contracts, retention). */
  valid: (trade: Trade) => boolean
  /** Whether a Player may be traded now: under contract for at least this Season. */
  tradable: (player: Player) => boolean
  /** Whether the assistant trades for a Club: not when its Manager makes his own trades. */
  assistant: (clubId: ClubId) => boolean
}

/** The chance of the playoffs from points above (or below) the last place in, and the Fixtures left. */
export function playoffChance(margin: number, fixturesLeft: number): number {
  if (fixturesLeft <= 0) return margin >= 0 ? 1 : 0
  return 1 / (1 + Math.exp((-TRADE.race.slope * margin) / Math.sqrt(fixturesLeft)))
}

/** Valuation over a context, with what it reads cached. */
export class TradeMarket {
  private readonly levels: Record<PositionGroup, number[]>
  private readonly paths = new Map<string, number[]>()
  private readonly holders = new Map<PlayerId, Club>()
  private readonly prospectOf = new Map<PlayerId, Prospect>()
  private readonly lineups = new Map<string, { id: PlayerId; level: number }[]>()
  private readonly values = new Map<string, number>()
  private readonly picks = new Map<string, TradablePick>()

  constructor(readonly ctx: TradeContext) {
    for (const pick of ctx.picks) {
      if (!this.picks.has(pickKey(pick.ref))) this.picks.set(pickKey(pick.ref), pick)
    }
    this.levels = { forward: [], defence: [], goalie: [] }
    for (const club of ctx.clubs) {
      for (const player of contractedOf(club)) {
        this.levels[positionGroup(player)].push(playerLevel(player))
        this.holders.set(player.id, club)
      }
    }
    for (const group of ['forward', 'defence', 'goalie'] as const) {
      this.levels[group].sort((a, b) => b - a)
    }
    for (const prospect of ctx.prospects) this.prospectOf.set(prospect.player.id, prospect)
  }

  /** The fair price of a level at a group, by where it would stand in the league. */
  fair(group: PositionGroup, level: number): number {
    const sorted = this.levels[group]
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid]! > level) lo = mid + 1
      else hi = mid
    }
    return fairCapHit(this.ctx.rules, group, {
      rank: lo,
      regulars: regularsOf(group, this.ctx.clubs.length),
    })
  }

  /** A Player's level as a Club sees him, now and each Season ahead, as development expects it. */
  path(clubId: ClubId, player: Player, seasons: number): number[] {
    const key = `${this.ctx.viewKey(clubId)}:${player.id}`
    const cached = this.paths.get(key)
    if (cached && cached.length >= seasons) return cached
    const seen = this.ctx.view(clubId, player)
    const now = playerLevel(seen)
    const path = cached ?? [now]
    for (let s = path.length; s < seasons; s++) {
      path.push(path[s - 1]! + expectedLevel({ ...seen, age: seen.age + s - 1 }) - now)
    }
    this.paths.set(key, path)
    return path
  }

  /** The weight a Club gives this Season's play, by its race. */
  nowWeight(clubId: ClubId): number {
    return (TRADE.now.base + TRADE.now.race * this.ctx.chance(clubId)) * this.ctx.now
  }

  /**
   * How much better a Club's Lineup is with a Player than without him, in
   * levels as the Club sees them: the level he adds over whoever he pushes out
   * of it, or that his leaving takes away.
   */
  upgrade(clubId: ClubId, player: Player, joining: boolean): number {
    const group = positionGroup(player)
    const own = this.groupOf(clubId, group)
      .filter((p) => p.id !== player.id)
      .map((p) => p.level)
    const level = this.path(clubId, player, 1)[0]!
    const n = LINEUP[group]
    if (joining) {
      const dropped = own[n - 1]
      return dropped === undefined ? level : Math.max(0, level - dropped)
    }
    const replacement = own[n - 1]
    const rank = own.filter((l) => l > level).length
    if (rank >= n) return 0
    return replacement === undefined ? level : Math.max(0, level - replacement)
  }

  /** A Club's Players of a group as it sees them, best first. */
  private groupOf(clubId: ClubId, group: PositionGroup): { id: PlayerId; level: number }[] {
    const key = `${clubId}:${group}`
    const cached = this.lineups.get(key)
    if (cached) return cached
    const club = this.ctx.clubs.find((c) => c.id === clubId)!
    const list = contractedOf(club)
      .filter((p) => positionGroup(p) === group)
      .map((p) => ({ id: p.id, level: this.path(clubId, p, 1)[0]! }))
      .sort((a, b) => b.level - a.level)
    this.lineups.set(key, list)
    return list
  }

  /** What a Player under contract is worth to a Club at a cap hit, joining it or leaving it. */
  playerValue(clubId: ClubId, player: Player, capHit: number, joining: boolean): number {
    return this.memo(`p:${clubId}:${player.id}:${capHit}:${joining}`, () =>
      this.valueOf(clubId, player, capHit, joining),
    )
  }

  /** A value read once per market: the search asks the same of many trades. */
  private memo(key: string, value: () => number): number {
    const cached = this.values.get(key)
    if (cached !== undefined) return cached
    const computed = value()
    this.values.set(key, computed)
    return computed
  }

  private valueOf(clubId: ClubId, player: Player, capHit: number, joining: boolean): number {
    const years = player.contract?.years ?? 0
    if (years < 1) return 0
    const group = positionGroup(player)
    const path = this.path(clubId, player, years)
    const nowWeight = this.nowWeight(clubId)
    let value = 0
    for (let s = 0; s < years; s++) {
      const weight = s === 0 ? nowWeight : TRADE.discount ** s
      value += weight * (this.fair(group, path[s]!) - capHit)
    }
    // A better Lineup is worth what it adds to the race: nothing to a Club out of it.
    const race = this.ctx.chance(clubId) * (this.ctx.now + TRADE.playoffs)
    return value + race * TRADE.win * this.upgrade(clubId, player, joining)
  }

  /** Seasons of a young Player on an entry-level price, from `delay` Seasons ahead, at a peak level. */
  private controlled(group: PositionGroup, peak: number, delay: number): number {
    const surplus = Math.max(0, this.fair(group, peak) - this.ctx.rules.entryLevel.capHit)
    let value = 0
    for (let k = 0; k < TRADE.controlled; k++) value += TRADE.discount ** (delay + k) * surplus
    return value
  }

  /** What a pick is worth: the level its place in the class is expected to reach, played cheaply later. */
  pickValue(pick: TradablePick): number {
    return this.memo(`k:${pickKey(pick.ref)}:${pick.place}`, () => {
      const z =
        onLadder(DRAFT_CLASS.level, pick.place) +
        TRADE.reach * onLadder(DRAFT_CLASS.room, pick.place)
      const peak = fillLevel('forward') + z * groupSpread('forward')
      return this.controlled('forward', peak, pick.ref.year - this.ctx.year + TRADE.pickDelay)
    })
  }

  /** What a prospect is worth to a Club: the level it expects of him in a few Seasons, played cheaply. */
  prospectValue(clubId: ClubId, player: Player): number {
    return this.memo(`r:${clubId}:${player.id}`, () => {
      const path = this.path(clubId, player, TRADE.pickDelay + 1)
      return this.controlled(positionGroup(player), path.at(-1)!, TRADE.pickDelay)
    })
  }

  /** What a Club gains by a trade, in its own view: what it receives less what it gives. */
  gain(trade: Trade, clubId: ClubId): number {
    const [a, b] = trade.sides
    const mine = a.clubId === clubId ? a : b
    const theirs = a.clubId === clubId ? b : a
    return this.received(clubId, theirs) - this.given(clubId, mine)
  }

  private received(clubId: ClubId, side: TradeSide): number {
    let value = 0
    for (const id of side.players) {
      const player = this.player(id)
      const kept = side.retained?.[id] ?? 0
      value += this.playerValue(clubId, player, (player.contract?.capHit ?? 0) * (1 - kept), true)
    }
    for (const id of side.prospects)
      value += this.prospectValue(clubId, this.prospectOf.get(id)!.player)
    for (const ref of side.picks) value += this.pickValue(this.pick(ref))
    return value
  }

  private given(clubId: ClubId, side: TradeSide): number {
    let value = 0
    for (const id of side.players) {
      const player = this.player(id)
      const capHit = player.contract?.capHit ?? 0
      value += this.playerValue(clubId, player, capHit, false)
      // What it keeps of his cap hit it still pays, Season by Season.
      const kept = (side.retained?.[id] ?? 0) * capHit
      const years = player.contract?.years ?? 0
      for (let s = 0; s < years; s++) {
        value += (s === 0 ? this.nowWeight(clubId) : TRADE.discount ** s) * kept
      }
    }
    for (const id of side.prospects)
      value += this.prospectValue(clubId, this.prospectOf.get(id)!.player)
    for (const ref of side.picks) value += this.pickValue(this.pick(ref))
    return value
  }

  /** Whether the assistant accepts a trade for a Club: it gains at least the margin (ADR-033). */
  accepts(trade: Trade, clubId: ClubId): boolean {
    return this.gain(trade, clubId) >= TRADE.margin
  }

  player(id: PlayerId): Player {
    const club = this.holders.get(id)
    const player = club && contractedOf(club).find((p) => p.id === id)
    if (!player) throw new Error(`No Player ${id} under contract`)
    return player
  }

  holder(id: PlayerId): Club | undefined {
    return this.holders.get(id)
  }

  private pick(ref: PickRef): TradablePick {
    const found = this.picks.get(pickKey(ref))
    if (!found) throw new Error(`No tradable pick ${ref.year}:${ref.round}:${ref.clubId}`)
    return found
  }
}

/** A side giving nothing yet. */
function side(clubId: ClubId): TradeSide {
  return { clubId, players: [], prospects: [], picks: [] }
}

/** How many of a buyer's assets of each kind the search tries as payment. */
const PAYMENTS = { picks: 12, prospects: 4, players: 4 }

/**
 * The trades the assistant makes in a round (ADR-033, #138), the same for every
 * Club (D-04): a Club out of the race (any Club between Seasons) offers each of
 * its Players a trade may take; every other Club in the race may buy him with a
 * pick, a prospect or a Player of his group, the seller keeping half his cap
 * hit when the buyer could not otherwise fit him. A trade both Clubs gain by
 * the margin is a candidate, the best of each pair of Player and buyer kept;
 * the candidates are taken best first by what both gain together, each Club in
 * one trade a round, while the trade is still valid. Ties go by ids.
 */
export function assistantTrades(market: TradeMarket): Trade[] {
  const { ctx } = market
  const between = ctx.now >= 1
  const candidates: { trade: Trade; score: number }[] = []
  const payments = new Map<string, TradeSide[]>()
  const sellers = ctx.clubs.filter(
    (club) => ctx.assistant(club.id) && (between || ctx.chance(club.id) < TRADE.sell),
  )
  for (const seller of sellers) {
    const offered = contractedOf(seller).filter(
      (p) =>
        ctx.tradable(p) &&
        (between || (p.contract?.years ?? 0) <= TRADE.offeredYears) &&
        (between || positionGroup(p) !== 'goalie'),
    )
    for (const player of offered) {
      for (const buyer of ctx.clubs) {
        if (buyer.id === seller.id || !ctx.assistant(buyer.id)) continue
        if (!between && ctx.chance(buyer.id) <= TRADE.buy) continue
        const best = bestPayment(market, seller, buyer, player, payments)
        if (best) candidates.push(best)
      }
    }
  }
  // Ties go by key, compared by code unit: `localeCompare` follows the host's
  // locale, and a run on another machine came out different (D-01, #140).
  candidates.sort((a, b) => {
    const [p, q] = [keyOf(a.trade), keyOf(b.trade)]
    return b.score - a.score || (p < q ? -1 : p > q ? 1 : 0)
  })
  const busy = new Map<ClubId, number>()
  const moved = new Set<PlayerId>()
  const taken: Trade[] = []
  for (const { trade } of candidates) {
    const [a, b] = trade.sides
    const ids = [...a.players, ...a.prospects, ...b.players, ...b.prospects]
    const most = between ? TRADE.perWindow : TRADE.perRound
    if ((busy.get(a.clubId) ?? 0) >= most || (busy.get(b.clubId) ?? 0) >= most) continue
    if (ids.some((id) => moved.has(id))) continue
    if ([...a.picks, ...b.picks].some((p) => moved.has(`${p.year}:${p.round}:${p.clubId}`)))
      continue
    busy.set(a.clubId, (busy.get(a.clubId) ?? 0) + 1)
    busy.set(b.clubId, (busy.get(b.clubId) ?? 0) + 1)
    for (const id of ids) moved.add(id)
    for (const p of [...a.picks, ...b.picks]) moved.add(`${p.year}:${p.round}:${p.clubId}`)
    taken.push(trade)
  }
  return taken
}

function keyOf(trade: Trade): string {
  return trade.sides
    .map(
      (s) =>
        `${s.clubId}:${s.players.join(',')}:${s.prospects.join(',')}:${s.picks.map((p) => `${p.year}.${p.round}.${p.clubId}`).join(',')}`,
    )
    .join('|')
}

/**
 * What a buyer may pay for a Player of a group: its latest picks, its least
 * valuable prospects and its least valuable Players of the group.
 */
function paymentsOf(market: TradeMarket, buyer: Club, group: PositionGroup): TradeSide[] {
  const { ctx } = market
  return [
    ...ctx.picks
      .filter((p) => p.owner === buyer.id)
      .sort((a, b) => b.place - a.place || a.ref.year - b.ref.year)
      .slice(0, PAYMENTS.picks)
      .map((p) => ({ ...side(buyer.id), picks: [p.ref] })),
    ...ctx.prospects
      .filter((p) => p.player.clubId === buyer.id)
      .map((p) => ({ prospect: p, value: market.prospectValue(buyer.id, p.player) }))
      .sort((a, b) => a.value - b.value || (a.prospect.player.id < b.prospect.player.id ? -1 : 1))
      .slice(0, PAYMENTS.prospects)
      .map(({ prospect }) => ({ ...side(buyer.id), prospects: [prospect.player.id] })),
    ...contractedOf(buyer)
      .filter((p) => positionGroup(p) === group && ctx.tradable(p))
      .map((p) => ({ p, value: market.playerValue(buyer.id, p, p.contract?.capHit ?? 0, false) }))
      .sort((a, b) => a.value - b.value || (a.p.id < b.p.id ? -1 : 1))
      .slice(0, PAYMENTS.players)
      .map(({ p }) => ({ ...side(buyer.id), players: [p.id] })),
  ]
}

/** The buyer's payment for a seller's Player that both gain most by, together, or null. */
function bestPayment(
  market: TradeMarket,
  seller: Club,
  buyer: Club,
  player: Player,
  known: Map<string, TradeSide[]>,
): { trade: Trade; score: number } | null {
  const { ctx } = market
  // Without a place in the buyer's Lineup a Player is worth no trade to him.
  if (market.upgrade(buyer.id, player, true) <= 0) return null
  const group = positionGroup(player)
  const key = `${buyer.id}:${group}`
  const payments = known.get(key) ?? paymentsOf(market, buyer, group)
  known.set(key, payments)
  let best: { trade: Trade; score: number } | null = null
  for (const payment of payments) {
    const most = Math.max(
      0,
      Math.min(
        ctx.rules.retention.maxShare,
        1 - ctx.rules.minimum / (player.contract?.capHit ?? 1),
      ),
    )
    for (const kept of most > 0 ? [0, most] : [0]) {
      const give: TradeSide = {
        ...side(seller.id),
        players: [player.id],
        ...(kept > 0 ? { retained: { [player.id]: kept } } : {}),
      }
      const trade: Trade = { sides: [give, payment] }
      const gainSeller = market.gain(trade, seller.id)
      const gainBuyer = market.gain(trade, buyer.id)
      const asked = TRADE.margin + TRADE.patience * ctx.toDeadline
      if (gainSeller < asked || gainBuyer < TRADE.margin) continue
      // Several buyers bid for a Player: the seller takes its share of what the trade gains.
      if (gainSeller < TRADE.share * (gainSeller + gainBuyer)) continue
      const score = gainSeller + gainBuyer
      if (best && score <= best.score) continue
      if (!ctx.valid(trade)) continue
      best = { trade, score }
      // Keeping salary is a last resort: only when nothing fits without it.
      break
    }
  }
  return best
}
